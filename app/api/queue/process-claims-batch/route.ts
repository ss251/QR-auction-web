/* eslint-disable */
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { ethers } from 'ethers';
import AirdropABI from '@/abi/Airdrop.json';
import { updateRetryStatus, redis } from '@/lib/queue/failedClaims';
import { Receiver } from '@upstash/qstash';
import { getWalletPool } from '@/lib/wallet-pool';

// Setup Supabase clients
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const supabase = createClient(supabaseUrl, supabaseServiceKey);

// QStash receiver for verification
const receiver = new Receiver({
  currentSigningKey: process.env.QSTASH_CURRENT_SIGNING_KEY || '',
  nextSigningKey: process.env.QSTASH_NEXT_SIGNING_KEY || '',
});

const QR_TOKEN_ADDRESS = process.env.NEXT_PUBLIC_QR_COIN || '';

// Alchemy RPC URL
const ALCHEMY_RPC_URL = 'https://base-mainnet.g.alchemy.com/v2/';
const ALCHEMY_API_KEY = process.env.NEXT_PUBLIC_ALCHEMY_API_KEY || '';
const RPC_URL = ALCHEMY_API_KEY ? 
  `${ALCHEMY_RPC_URL}${ALCHEMY_API_KEY}` : 
  'https://mainnet.base.org';

// Batch configuration
const BATCH_SIZE = 20; // Process up to 20 claims per batch
const MAX_BATCHES_PER_RUN = 5; // Process up to 5 batches per execution

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// ERC20 ABI for approval
const ERC20_ABI = [
  {
    "inputs": [
      { "internalType": "address", "name": "spender", "type": "address" },
      { "internalType": "uint256", "name": "amount", "type": "uint256" }
    ],
    "name": "approve",
    "outputs": [{ "internalType": "bool", "name": "", "type": "bool" }],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      { "internalType": "address", "name": "account", "type": "address" }
    ],
    "name": "balanceOf",
    "outputs": [{ "internalType": "uint256", "name": "", "type": "uint256" }],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      { "internalType": "address", "name": "owner", "type": "address" },
      { "internalType": "address", "name": "spender", "type": "address" }
    ],
    "name": "allowance",
    "outputs": [{ "internalType": "uint256", "name": "", "type": "uint256" }],
    "stateMutability": "view",
    "type": "function"
  }
];

// Get queued failures from Redis
async function getQueuedFailures(limit: number = BATCH_SIZE): Promise<Array<{
  failureId: string;
  attempt: number;
  claimSource: string;
  scheduledTime: number;
}>> {
  try {
    // Scan for claim keys that are in "queued" status
    const keys = await redis.keys('claim:*');
    
    const queuedFailures: Array<{
      failureId: string;
      attempt: number;
      claimSource: string;
      scheduledTime: number;
    }> = [];
    
    for (const key of keys) {
      if (queuedFailures.length >= limit) break;
      
      const claimData = await redis.get(key);
      if (!claimData) continue;
      
      try {
        const parsed = JSON.parse(claimData as string);
        
        // Only process items that are queued and ready to process
        if (parsed.status === 'queued' && 
            (!parsed.nextRetryAt || new Date(parsed.nextRetryAt) <= new Date())) {
          
          queuedFailures.push({
            failureId: parsed.failureId,
            attempt: parsed.currentAttempt || 0,
            claimSource: parsed.claimSource || 'mini_app',
            scheduledTime: parsed.scheduledTime || Date.now()
          });
        }
      } catch (parseError) {
        console.error(`Error parsing claim data for ${key}:`, parseError);
      }
    }
    
    // Sort by scheduled time (oldest first)
    queuedFailures.sort((a, b) => a.scheduledTime - b.scheduledTime);
    
    return queuedFailures.slice(0, limit);
  } catch (error) {
    console.error('Error getting queued failures:', error);
    return [];
  }
}

// Group failures by claim source since they use different contracts
function groupFailuresBySource(failures: any[]): { [key: string]: any[] } {
  return failures.reduce((groups: { [key: string]: any[] }, failure) => {
    const source = failure.claim_source || 'mini_app';
    if (!groups[source]) groups[source] = [];
    groups[source].push(failure);
    return groups;
  }, {} as { [key: string]: any[] });
}

// Process a batch of failures with the same claim source
async function processBatch(
  failures: any[], 
  claimSource: string, 
  provider: ethers.JsonRpcProvider
) {
  const walletPool = getWalletPool(provider);
  const walletPurpose = claimSource === 'web' ? 'link-web' : 'link-miniapp';
  
  // Get wallet for this batch
  const directWallet = walletPool.getDirectWallet(walletPurpose);
  let adminWallet: ethers.Wallet;
  let DYNAMIC_AIRDROP_CONTRACT: string;
  let lockKey: string | null = null;
  let walletConfig: { wallet: ethers.Wallet; airdropContract: string; lockKey: string } | null = null;
  
  if (directWallet) {
    adminWallet = directWallet.wallet;
    DYNAMIC_AIRDROP_CONTRACT = directWallet.airdropContract;
  } else {
    try {
      walletConfig = await walletPool.getAvailableWallet(walletPurpose);
      adminWallet = walletConfig.wallet;
      DYNAMIC_AIRDROP_CONTRACT = walletConfig.airdropContract;
      lockKey = walletConfig.lockKey;
    } catch (poolError) {
      throw new Error('All wallets busy for batch processing');
    }
  }
  
  try {
    // Mark all failures as processing
    for (const failure of failures) {
      await updateRetryStatus(failure.id, {
        status: 'processing',
        processingStarted: new Date().toISOString(),
        batchId: `batch-${Date.now()}`,
        batchSize: failures.length
      });
    }
    
    // Check wallet balances
    const ethBalance = await provider.getBalance(adminWallet.address);
    const requiredEth = ethers.parseEther("0.005"); // More ETH needed for batch
    
    if (ethBalance < requiredEth) {
      throw new Error(`Insufficient ETH. Need: ${ethers.formatEther(requiredEth)}, Have: ${ethers.formatEther(ethBalance)}`);
    }
    
    // Set up contracts
    const qrTokenContract = new ethers.Contract(QR_TOKEN_ADDRESS, ERC20_ABI, adminWallet);
    const airdropContract = new ethers.Contract(DYNAMIC_AIRDROP_CONTRACT, AirdropABI.abi, adminWallet);
    
    // Check token balance
    const requiredTokens = BigInt(failures.length) * ethers.parseUnits('420', 18);
    const tokenBalance = await qrTokenContract.balanceOf(adminWallet.address);
    
    if (tokenBalance < requiredTokens) {
      throw new Error(`Insufficient QR tokens. Need: ${ethers.formatUnits(requiredTokens, 18)}, Have: ${ethers.formatUnits(tokenBalance, 18)}`);
    }
    
    // Check and set allowance if needed
    const allowance = await qrTokenContract.allowance(adminWallet.address, DYNAMIC_AIRDROP_CONTRACT);
    if (allowance < requiredTokens) {
      console.log(`Approving tokens for batch of ${failures.length} claims...`);
      
      const feeData = await provider.getFeeData();
      const gasPrice = feeData.gasPrice ? feeData.gasPrice * BigInt(120) / BigInt(100) : undefined;
      
      const approveTx = await qrTokenContract.approve(
        DYNAMIC_AIRDROP_CONTRACT,
        ethers.parseUnits('1000000', 18), // Approve large amount
        { gasPrice }
      );
      
      await approveTx.wait();
      console.log('Batch token approval confirmed');
    }
    
    // Prepare batch airdrop data
    const airdropContent = failures.map(failure => ({
      recipient: failure.eth_address,
      amount: ethers.parseUnits('420', 18)
    }));
    
    console.log(`Processing batch of ${failures.length} claims for ${claimSource}`);
    
    // Execute batch transaction with retries
    let txReceipt = null;
    let lastError = null;
    
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        if (attempt > 0) {
          await delay(2000 * attempt);
        }
        
        const nonce = await provider.getTransactionCount(adminWallet.address, 'latest');
        const feeData = await provider.getFeeData();
        const baseGasPrice = feeData.gasPrice || ethers.parseUnits('0.1', 'gwei');
        const gasPrice = baseGasPrice * BigInt(120 + attempt * 20) / BigInt(100);
        
        console.log(`Batch attempt ${attempt + 1} with gas price ${ethers.formatUnits(gasPrice, 'gwei')} gwei`);
        
        const tx = await airdropContract.airdropERC20(
          QR_TOKEN_ADDRESS,
          airdropContent,
          {
            nonce,
            gasPrice,
            gasLimit: 2000000 + (failures.length * 100000) // Dynamic gas based on batch size
          }
        );
        
        console.log(`Batch airdrop tx submitted: ${tx.hash}`);
        txReceipt = await tx.wait();
        break;
        
      } catch (err) {
        lastError = err;
        console.error(`Batch attempt ${attempt + 1} failed:`, err);
      }
    }
    
    if (!txReceipt) {
      throw new Error(`Batch transaction failed: ${lastError}`);
    }
    
    console.log(`Batch airdrop successful: ${txReceipt.hash}`);
    
    // Record all successful claims
    const successfulClaims = failures.map(failure => ({
      fid: failure.fid,
      auction_id: parseInt(failure.auction_id),
      eth_address: failure.eth_address,
      link_visited_at: new Date().toISOString(),
      claimed_at: new Date().toISOString(),
      amount: 420,
      tx_hash: txReceipt.hash,
      success: true,
      username: failure.username || null,
      user_id: failure.user_id || null,
      winning_url: failure.winning_url || `https://qrcoin.fun/auction/${failure.auction_id}`,
      claim_source: failure.claim_source || 'mini_app',
      client_ip: 'batch_queue'
    }));
    
    // Insert successful claims
    const { error: insertError } = await supabase
      .from('link_visit_claims')
      .upsert(successfulClaims, {
        onConflict: 'fid,auction_id',
        ignoreDuplicates: false
      });
    
    if (insertError) {
      console.error('Error inserting batch claims:', insertError);
      throw new Error(`Database error: ${insertError.message}`);
    }
    
    // Update Redis status for all failures
    for (const failure of failures) {
      await updateRetryStatus(failure.id, {
        status: 'success',
        tx_hash: txReceipt.hash,
        completedAt: new Date().toISOString()
      });
    }
    
    // Remove processed failures from database
    const failureIds = failures.map(f => f.id);
    await supabase
      .from('link_visit_claim_failures')
      .delete()
      .in('id', failureIds);
    
    return {
      success: true,
      processed: failures.length,
      tx_hash: txReceipt.hash
    };
    
  } finally {
    // Release wallet lock if using pool
    if (lockKey && walletConfig) {
      await walletPool.releaseWallet(lockKey);
      console.log(`Released wallet lock for ${adminWallet.address}`);
    }
  }
}

export async function POST(req: NextRequest) {
  try {
    // Verify the request is from QStash (bypass for localhost)
    const isLocalhost = req.url.includes('localhost') || req.url.includes('127.0.0.1');
    
    if (!isLocalhost) {
      const signature = req.headers.get('upstash-signature');
      if (!signature) {
        return NextResponse.json({ success: false, error: 'Unauthorized - missing signature' }, { status: 401 });
      }
      
      const bodyText = await req.text();
      const isValid = await receiver.verify({ signature, body: bodyText });
      
      if (!isValid) {
        return NextResponse.json({ success: false, error: 'Unauthorized - invalid signature' }, { status: 401 });
      }
    } else {
      console.log('🔧 LOCALHOST: Bypassing signature verification for batch processor');
    }
    
    console.log(`🚀 Starting batch queue processing...`);
    
    // Get queued failures from Redis
    const queuedFailures = await getQueuedFailures(BATCH_SIZE * MAX_BATCHES_PER_RUN);
    
    if (queuedFailures.length === 0) {
      console.log('No queued failures found');
      return NextResponse.json({ 
        success: true, 
        message: 'No failures to process',
        processed: 0
      });
    }
    
    console.log(`Found ${queuedFailures.length} queued failures to process`);
    
    // Get failure details from database
    const failureIds = queuedFailures.map(f => f.failureId);
    const { data: failures, error: fetchError } = await supabase
      .from('link_visit_claim_failures')
      .select('*')
      .in('id', failureIds)
      .order('created_at', { ascending: true });
    
    if (fetchError) {
      console.error('Failed to fetch failure records:', fetchError);
      return NextResponse.json({ 
        success: false, 
        error: 'Failed to fetch failures' 
      }, { status: 500 });
    }
    
    if (!failures || failures.length === 0) {
      console.log('No failure records found in database');
      return NextResponse.json({ 
        success: true, 
        message: 'No failures found in database',
        processed: 0
      });
    }
    
    // Remove duplicates and banned users
    const validFailures = [];
    
    for (const failure of failures) {
      // Check for bans
      const banCheckConditions = [];
      if (failure.fid && failure.fid > 0) banCheckConditions.push(`fid.eq.${failure.fid}`);
      if (failure.eth_address) banCheckConditions.push(`eth_address.ilike.${failure.eth_address}`);
      if (failure.username) banCheckConditions.push(`username.ilike.${failure.username}`);
      
      if (banCheckConditions.length > 0) {
        const { data: bannedUser } = await supabase
          .from('banned_users')
          .select('fid, username, reason')
          .or(banCheckConditions.join(','))
          .single();
        
        if (bannedUser) {
          console.log(`🚫 BATCH: Skipping banned user FID=${failure.fid}, username=${failure.username}`);
          
          // Clean up Redis and database
          await updateRetryStatus(failure.id, {
            status: 'banned_user',
            completedAt: new Date().toISOString()
          });
          
          await supabase
            .from('link_visit_claim_failures')
            .delete()
            .eq('id', failure.id);
          
          continue;
        }
      }
      
      // Check for existing claims
      const { data: existingClaim } = await supabase
        .from('link_visit_claims')
        .select('tx_hash')
        .eq('eth_address', failure.eth_address)
        .eq('auction_id', failure.auction_id)
        .not('claimed_at', 'is', null)
        .single();
      
      if (existingClaim) {
        console.log(`🚫 BATCH: Skipping already claimed ${failure.eth_address} for auction ${failure.auction_id}`);
        
        // Clean up Redis and database
        await updateRetryStatus(failure.id, {
          status: 'already_claimed',
          completedAt: new Date().toISOString()
        });
        
        await supabase
          .from('link_visit_claim_failures')
          .delete()
          .eq('id', failure.id);
        
        continue;
      }
      
      validFailures.push(failure);
    }
    
    if (validFailures.length === 0) {
      console.log('No valid failures to process after filtering');
      return NextResponse.json({ 
        success: true, 
        message: 'No valid failures after filtering',
        processed: 0
      });
    }
    
    console.log(`Processing ${validFailures.length} valid failures in batches`);
    
    // Group by claim source
    const groupedFailures = groupFailuresBySource(validFailures);
    
    // Initialize provider
    const provider = new ethers.JsonRpcProvider(RPC_URL);
    
    // Process each group in batches
    const results = {
      totalProcessed: 0,
      successful: 0,
      failed: 0,
      batches: [] as any[]
    };
    
    for (const [claimSource, sourceFailures] of Object.entries(groupedFailures)) {
      console.log(`Processing ${sourceFailures.length} failures for ${claimSource}`);
      
      // Process in batches
      for (let i = 0; i < sourceFailures.length; i += BATCH_SIZE) {
        const batch = sourceFailures.slice(i, i + BATCH_SIZE);
        
        try {
          const batchResult = await processBatch(batch, claimSource, provider);
          
          results.totalProcessed += batchResult.processed;
          results.successful += batchResult.processed;
          results.batches.push({
            source: claimSource,
            size: batch.length,
            success: true,
            tx_hash: batchResult.tx_hash
          });
          
          console.log(`✅ Batch completed: ${batch.length} claims in tx ${batchResult.tx_hash}`);
          
        } catch (batchError) {
          console.error(`❌ Batch failed for ${claimSource}:`, batchError);
          
          const errorMessage = batchError instanceof Error ? batchError.message : String(batchError);
          
          results.totalProcessed += batch.length;
          results.failed += batch.length;
          results.batches.push({
            source: claimSource,
            size: batch.length,
            success: false,
            error: errorMessage
          });
          
          // Mark batch failures for retry (fallback to individual processing)
          for (const failure of batch) {
            const queuedFailure = queuedFailures.find(qf => qf.failureId === failure.id);
            const attempt = queuedFailure?.attempt || 0;
            
            if (attempt < 4) {
              // Schedule individual retry
              let delayMinutes = 2;
              if (attempt === 1) delayMinutes = 5;
              if (attempt === 2) delayMinutes = 10;
              if (attempt === 3) delayMinutes = 20;
              
              await updateRetryStatus(failure.id, {
                status: 'retry_scheduled',
                lastError: `Batch failed: ${errorMessage}`,
                nextRetryAt: new Date(Date.now() + delayMinutes * 60 * 1000).toISOString()
              });
              
              // Queue individual retry with original process-claim endpoint
              await fetch('https://qstash.upstash.io/v2/publish', {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  'Authorization': `Bearer ${process.env.QSTASH_TOKEN}`
                },
                body: JSON.stringify({
                  url: `${process.env.NEXT_PUBLIC_HOST_URL}/api/queue/process-claim`,
                  body: { failureId: failure.id, attempt: attempt + 1 },
                  delay: delayMinutes * 60
                })
              });
              
            } else {
              // Max retries exceeded
              await updateRetryStatus(failure.id, {
                status: 'max_retries_exceeded',
                lastError: `Batch failed: ${errorMessage}`,
                completedAt: new Date().toISOString()
              });
            }
          }
        }
        
        // Delay between batches
        if (i + BATCH_SIZE < sourceFailures.length) {
          await delay(3000);
        }
      }
    }
    
    console.log(`🎉 Batch processing completed:`, results);
    
    return NextResponse.json({
      success: true,
      ...results
    });
    
  } catch (error) {
    console.error('Batch processing error:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
} 