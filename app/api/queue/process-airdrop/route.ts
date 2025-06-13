import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { ethers } from 'ethers';
import AirdropABI from '@/abi/Airdrop.json';
import { updateRetryStatus } from '@/lib/queue/failedClaims';
import { Receiver } from '@upstash/qstash';
import { getWalletPool } from '@/lib/wallet-pool';

// Setup Supabase clients
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

// Use service role key for database operations in API routes (bypasses RLS)
const supabase = createClient(supabaseUrl, supabaseServiceKey || supabaseAnonKey);

// If we don't have service key, log a warning
if (!supabaseServiceKey) {
  console.warn('SUPABASE_SERVICE_ROLE_KEY not found, falling back to anon key - database writes may fail due to RLS');
}

// QStash receiver for verification
const receiver = new Receiver({
  currentSigningKey: process.env.QSTASH_CURRENT_SIGNING_KEY || '',
  nextSigningKey: process.env.QSTASH_NEXT_SIGNING_KEY || '',
});

// Contract details
const QR_TOKEN_ADDRESS = process.env.NEXT_PUBLIC_QR_COIN || '';
// const AIRDROP_CONTRACT_ADDRESS = process.env.AIRDROP_CONTRACT_ADDRESS || '';
// const ADMIN_PRIVATE_KEY = process.env.ADMIN_PRIVATE_KEY || '';

// Alchemy RPC URL
const ALCHEMY_RPC_URL = 'https://base-mainnet.g.alchemy.com/v2/';
const ALCHEMY_API_KEY = process.env.NEXT_PUBLIC_ALCHEMY_API_KEY || '';
const RPC_URL = ALCHEMY_API_KEY ? 
  `${ALCHEMY_RPC_URL}${ALCHEMY_API_KEY}` : 
  'https://mainnet.base.org';

// Simple delay function
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

export async function POST(req: NextRequest) {
  // Verify the request is from QStash
  try {
    const signature = req.headers.get('upstash-signature');
    if (!signature) {
      return NextResponse.json({ success: false, error: 'Unauthorized - missing signature' }, { status: 401 });
    }
    
    const bodyText = await req.text();
    const isValid = await receiver.verify({
      signature,
      body: bodyText,
    });
    
    if (!isValid) {
      return NextResponse.json({ success: false, error: 'Unauthorized - invalid signature' }, { status: 401 });
    }
    
    // Parse the body as JSON
    const body = JSON.parse(bodyText);
    const { failureId, attempt } = body;
    
    console.log(`Processing queued airdrop claim: ${failureId}, attempt: ${attempt}`);
    
    // Initialize provider
    const provider = new ethers.JsonRpcProvider(RPC_URL);
    const walletPool = getWalletPool(provider);
    
    // Get an available wallet from the pool
    let walletConfig: { wallet: ethers.Wallet; airdropContract: string; lockKey: string } | null = null;
    
    try {
      walletConfig = await walletPool.getAvailableWallet('main-airdrop');
      console.log(`Using wallet ${walletConfig.wallet.address} with contract ${walletConfig.airdropContract}`);
    } catch (poolError) {
      console.error('Error getting available wallet:', poolError);
      console.log('All wallets are currently busy, will retry later');
      
      // Calculate a delay between 5-15 seconds for faster retry
      const delaySeconds = 5 + Math.floor(Math.random() * 10);
      
      return NextResponse.json({
        success: false, 
        status: 'retry_scheduled',
        error: 'All wallets busy',
        retryAfter: delaySeconds
      });
    }
    
    const { wallet: adminWallet, airdropContract: DYNAMIC_AIRDROP_CONTRACT, lockKey } = walletConfig;
    
    try {
      // Update status to processing
      await updateRetryStatus(failureId, {
        status: 'processing',
        processingStarted: new Date().toISOString(),
        currentAttempt: attempt
      });
      
      // Get the failure details from the database
      const { data: failure, error: fetchError } = await supabase
        .from('airdrop_claim_failures')
        .select('*')
        .eq('id', failureId)
        .single();
      
      if (fetchError || !failure) {
        console.error('Failed to fetch failure record:', fetchError);
        return NextResponse.json({ success: false, error: 'Failure record not found' });
      }
      
      // Check if user has already claimed
      const { data: existingClaim } = await supabase
        .from('airdrop_claims')
        .select('*')
        .eq('fid', failure.fid)
        .eq('success', true)
        .maybeSingle();
      
      if (existingClaim) {
        console.log(`User already has successful airdrop claim`);
        
        // Update retry status
        await updateRetryStatus(failureId, {
          status: 'already_claimed',
          completedAt: new Date().toISOString()
        });
        
        // Delete the failure record
        await supabase
          .from('airdrop_claim_failures')
          .delete()
          .eq('id', failureId);
        
        return NextResponse.json({ 
          success: true, 
          status: 'already_claimed'
        });
      }
      
      // Check wallet balances
      const ethBalance = await provider.getBalance(adminWallet.address);
      if (ethBalance < ethers.parseEther("0.001")) {
        // Update retry status
        await updateRetryStatus(failureId, {
          status: 'failed',
          error: 'Insufficient ETH for gas',
          completedAt: new Date().toISOString()
        });
        
        return NextResponse.json({ 
          success: false, 
          error: 'Insufficient ETH for gas' 
        });
      }
      
      // Set up contracts
      const qrTokenContract = new ethers.Contract(
        QR_TOKEN_ADDRESS,
        ERC20_ABI,
        adminWallet
      );
      
      const airdropContract = new ethers.Contract(
        DYNAMIC_AIRDROP_CONTRACT,
        AirdropABI.abi,
        adminWallet
      );
      
      // Check token balance
      const tokenBalance = await qrTokenContract.balanceOf(adminWallet.address);
      if (tokenBalance < ethers.parseUnits('1000', 18)) {
        // Update retry status
        await updateRetryStatus(failureId, {
          status: 'failed',
          error: 'Insufficient QR tokens',
          completedAt: new Date().toISOString()
        });
        
        return NextResponse.json({ 
          success: false, 
          error: 'Insufficient QR tokens' 
        });
      }
      
      // Check allowance
      const allowance = await qrTokenContract.allowance(adminWallet.address, DYNAMIC_AIRDROP_CONTRACT);
      if (allowance < ethers.parseUnits('1000', 18)) {
        console.log('Approving tokens for airdrop contract...');
        
        // Increase gas price by 30%
        const feeData = await provider.getFeeData();
        const gasPrice = feeData.gasPrice ? feeData.gasPrice * BigInt(130) / BigInt(100) : undefined;
        
        // Approve a large amount
        const approveTx = await qrTokenContract.approve(
          DYNAMIC_AIRDROP_CONTRACT,
          ethers.parseUnits('1000000', 18),
          { gasPrice }
        );
        
        await approveTx.wait();
        console.log('Token approval confirmed');
      }
      
      // Prepare airdrop data
      const airdropAmount = ethers.parseUnits('1000', 18);
      const airdropContent = [{
        recipient: failure.eth_address,
        amount: airdropAmount
      }];
      
      // Try to execute the transaction with dynamic gas
      let txReceipt = null;
      let lastError = null;
      
      for (let txAttempt = 0; txAttempt < 3; txAttempt++) {
        try {
          // Add delay between transaction attempts - reduced for faster processing
          if (txAttempt > 0) {
            await delay(1000 * txAttempt);
          }
          
          // Get fresh nonce
          const nonce = await provider.getTransactionCount(adminWallet.address, 'latest');
          
          // Increase gas based on attempt
          const feeData = await provider.getFeeData();
          const baseGasPrice = feeData.gasPrice || ethers.parseUnits('0.1', 'gwei');
          const gasPrice = baseGasPrice * BigInt(130 + txAttempt * 30) / BigInt(100);
          
          console.log(`Transaction attempt ${txAttempt + 1} with gas price ${ethers.formatUnits(gasPrice, 'gwei')} gwei`);
          
          // Execute airdrop
          const tx = await airdropContract.airdropERC20(
            QR_TOKEN_ADDRESS,
            airdropContent,
            {
              nonce,
              gasPrice,
              gasLimit: 5000000
            }
          );
          
          console.log(`Airdrop tx submitted: ${tx.hash}`);
          txReceipt = await tx.wait();
          break; // Success - exit the retry loop
          
        } catch (err) {
          lastError = err;
          console.error(`Transaction attempt ${txAttempt + 1} failed:`, err);
        }
      }
      
      // If all transaction attempts failed
      if (!txReceipt) {
        console.error('All transaction attempts failed');
        
        // Should we requeue for later retry?
        if (attempt < 4) { // Cap at 5 total attempts (0-4)
          // Calculate delay for next attempt with faster schedule
          // New schedule: 2min, 5min, 10min, 20min
          let delayMinutes = 2;
          if (attempt === 1) delayMinutes = 5;
          if (attempt === 2) delayMinutes = 10;
          if (attempt === 3) delayMinutes = 20;
          
          // Update retry status
          await updateRetryStatus(failureId, {
            status: 'retry_scheduled',
            lastError: lastError instanceof Error ? lastError.message : String(lastError),
            nextRetryAt: new Date(Date.now() + delayMinutes * 60 * 1000).toISOString()
          });
          
          // Queue next retry with QStash
          const response = await fetch('https://qstash.upstash.io/v2/publish', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${process.env.QSTASH_TOKEN}`
            },
            body: JSON.stringify({
              url: `${process.env.NEXT_PUBLIC_HOST_URL}/api/queue/process-airdrop`,
              body: {
                failureId,
                attempt: attempt + 1
              },
              delay: delayMinutes * 60 // Convert to seconds
            })
          });
          
          if (!response.ok) {
            console.error('Failed to schedule retry:', await response.text());
          } else {
            console.log(`Scheduled retry ${attempt + 1} in ${delayMinutes} minutes`);
          }
          
          return NextResponse.json({
            success: false,
            status: 'retry_scheduled',
            nextRetry: delayMinutes,
            attempt: attempt + 1
          });
        }
        
        // Max retries exceeded - mark as permanently failed
        await updateRetryStatus(failureId, {
          status: 'max_retries_exceeded',
          lastError: lastError instanceof Error ? lastError.message : String(lastError),
          completedAt: new Date().toISOString()
        });
        
        return NextResponse.json({
          success: false,
          status: 'max_retries_exceeded',
          error: lastError instanceof Error ? lastError.message : 'Max retries exceeded'
        });
      }
      
      // Transaction succeeded - record claim
      console.log(`Airdrop successful with TX: ${txReceipt.hash}`);
      
      // Record in airdrop_claims table
      const { error: insertError } = await supabase
        .from('airdrop_claims')
        .insert({
          fid: failure.fid,
          eth_address: failure.eth_address,
          amount: 2000,
          tx_hash: txReceipt.hash,
          success: true,
          username: failure.username || null
        });
      
      if (insertError) {
        console.error('Error inserting success record:', insertError);
        
        // Update retry status anyway
        await updateRetryStatus(failureId, {
          status: 'tx_success_db_fail',
          tx_hash: txReceipt.hash,
          completedAt: new Date().toISOString(),
          error: `Transaction succeeded but failed to record: ${insertError.message}`
        });
      } else {
        // Update retry status
        await updateRetryStatus(failureId, {
          status: 'success',
          tx_hash: txReceipt.hash,
          completedAt: new Date().toISOString()
        });
        
        // Delete from failures table
        await supabase
          .from('airdrop_claim_failures')
          .delete()
          .eq('id', failureId);
      }
      
      return NextResponse.json({
        success: true,
        status: 'success',
        tx_hash: txReceipt.hash
      });
      
    } catch (error) {
      console.error('Error processing retried airdrop claim:', error);
      return NextResponse.json({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    } finally {
      // Always release the wallet lock
      if (walletConfig) {
        await walletPool.releaseWallet(lockKey);
        console.log(`Released wallet lock for ${adminWallet.address}`);
      }
    }
  } catch (error) {
    console.error('Error processing retried airdrop claim:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
} 