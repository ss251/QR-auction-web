import { createClient } from '@supabase/supabase-js';
import { ethers } from 'ethers';
import AirdropABI from '@/abi/Airdrop.json';
import { getWalletPool } from '@/lib/wallet-pool';
import { Redis } from '@upstash/redis';
import { Client as QStashClient } from '@upstash/qstash';

// Setup Redis client
const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL!,
  token: process.env.UPSTASH_REDIS_REST_TOKEN!,
});

// Setup QStash client for delayed processing
const qstash = new QStashClient({
  token: process.env.QSTASH_TOKEN!,
});

// Setup Supabase client
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const supabase = createClient(supabaseUrl, supabaseServiceKey);

const QR_TOKEN_ADDRESS = process.env.NEXT_PUBLIC_QR_COIN || '';

// Alchemy RPC URL
const ALCHEMY_RPC_URL = 'https://base-mainnet.g.alchemy.com/v2/';
const ALCHEMY_API_KEY = process.env.NEXT_PUBLIC_ALCHEMY_API_KEY || '';
const RPC_URL = ALCHEMY_API_KEY ? 
  `${ALCHEMY_RPC_URL}${ALCHEMY_API_KEY}` : 
  'https://mainnet.base.org';

// Batch configuration
const BATCH_SIZE = 10; // Smaller batch size for real-time processing
const BATCH_TIMEOUT = 15000; // 15 seconds max wait time
const BATCH_QUEUE_PREFIX = 'batch:claims:';
const BATCH_TIMER_PREFIX = 'batch:timer:';
const BATCH_LOCK_PREFIX = 'batch:lock:';

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

interface PendingClaim {
  id: string; // Unique ID for the claim
  fid: number;
  address: string;
  auction_id: string;
  username?: string;
  user_id?: string;
  winning_url?: string;
  claim_source: string;
  client_ip: string;
  timestamp: number;
}

// Store pending promise resolvers in memory (these are lightweight)
const pendingResolvers = new Map<string, {
  resolve: (result: { success: boolean; tx_hash?: string; error?: string }) => void;
  reject: (error: Error) => void;
  timeoutId?: NodeJS.Timeout;
}>();

// Process a batch of claims for a specific source
async function processBatch(claimSource: string): Promise<void> {
  const lockKey = `${BATCH_LOCK_PREFIX}${claimSource}`;
  
  // Try to acquire lock for this batch
  const lockAcquired = await redis.set(lockKey, '1', {
    nx: true,
    ex: 60 // 1 minute lock
  });
  
  if (!lockAcquired) {
    console.log(`🔒 Batch already being processed for ${claimSource}`);
    return;
  }
  
  try {
    // Get all claims from Redis list
    const queueKey = `${BATCH_QUEUE_PREFIX}${claimSource}`;
    const claimStrings = await redis.lrange(queueKey, 0, BATCH_SIZE - 1);
    
    if (claimStrings.length === 0) {
      console.log(`📭 No claims to process for ${claimSource}`);
      return;
    }
    
    // Parse claims (handle both string and object responses from Redis)
    const claims: PendingClaim[] = claimStrings.map(str => {
      if (typeof str === 'string') {
        return JSON.parse(str) as PendingClaim;
      }
      // If Redis returns an object, use it directly
      return str as PendingClaim;
    });
    
    console.log(`🚀 Processing batch of ${claims.length} claims for ${claimSource}`);
    
    // Remove processed claims from queue
    await redis.ltrim(queueKey, claims.length, -1);
    
    // Clear the timer
    await redis.del(`${BATCH_TIMER_PREFIX}${claimSource}`);
    
    const provider = new ethers.JsonRpcProvider(RPC_URL);
    const walletPool = getWalletPool(provider);
    const walletPurpose = claimSource === 'web' ? 'link-web' : 'link-miniapp';
    
    // Get wallet for this batch
    const directWallet = walletPool.getDirectWallet(walletPurpose);
    let adminWallet: ethers.Wallet;
    let DYNAMIC_AIRDROP_CONTRACT: string;
    let walletLockKey: string | null = null;
    let walletConfig: { wallet: ethers.Wallet; airdropContract: string; lockKey: string } | null = null;
    
    if (directWallet) {
      adminWallet = directWallet.wallet;
      DYNAMIC_AIRDROP_CONTRACT = directWallet.airdropContract;
    } else {
      try {
        walletConfig = await walletPool.getAvailableWallet(walletPurpose);
        adminWallet = walletConfig.wallet;
        DYNAMIC_AIRDROP_CONTRACT = walletConfig.airdropContract;
        walletLockKey = walletConfig.lockKey;
      } catch {
        // If no wallet available, reject all claims
        claims.forEach(claim => {
          const resolver = pendingResolvers.get(claim.id);
          if (resolver) {
            resolver.reject(new Error('All wallets busy'));
            pendingResolvers.delete(claim.id);
          }
        });
        return;
      }
    }
    
    try {
      // Check wallet balances
      const ethBalance = await provider.getBalance(adminWallet.address);
      const requiredEth = ethers.parseEther("0.005");
      
      if (ethBalance < requiredEth) {
        throw new Error(`Insufficient ETH. Need: ${ethers.formatEther(requiredEth)}, Have: ${ethers.formatEther(ethBalance)}`);
      }
      
      // Set up contracts
      const qrTokenContract = new ethers.Contract(QR_TOKEN_ADDRESS, ERC20_ABI, adminWallet);
      const airdropContract = new ethers.Contract(DYNAMIC_AIRDROP_CONTRACT, AirdropABI.abi, adminWallet);
      
      // Check token balance
      const requiredTokens = BigInt(claims.length) * ethers.parseUnits('420', 18);
      const tokenBalance = await qrTokenContract.balanceOf(adminWallet.address);
      
      if (tokenBalance < requiredTokens) {
        throw new Error(`Insufficient QR tokens. Need: ${ethers.formatUnits(requiredTokens, 18)}, Have: ${ethers.formatUnits(tokenBalance, 18)}`);
      }
      
      // Check and set allowance if needed
      const allowance = await qrTokenContract.allowance(adminWallet.address, DYNAMIC_AIRDROP_CONTRACT);
      if (allowance < requiredTokens) {
        console.log(`Approving tokens for batch of ${claims.length} claims...`);
        
        const feeData = await provider.getFeeData();
        const gasPrice = feeData.gasPrice ? feeData.gasPrice * BigInt(120) / BigInt(100) : undefined;
        
        const approveTx = await qrTokenContract.approve(
          DYNAMIC_AIRDROP_CONTRACT,
          ethers.parseUnits('1000000', 18),
          { gasPrice }
        );
        
        await approveTx.wait();
        console.log('Batch token approval confirmed');
      }
      
      // Prepare batch airdrop data
      const airdropContent = claims.map(claim => ({
        recipient: claim.address,
        amount: ethers.parseUnits('420', 18)
      }));
      
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
              gasLimit: 2000000 + (claims.length * 100000)
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
      const successfulClaims = claims.map(claim => ({
        fid: claim.fid,
        auction_id: parseInt(claim.auction_id),
        eth_address: claim.address,
        link_visited_at: new Date().toISOString(),
        claimed_at: new Date().toISOString(),
        amount: 420,
        tx_hash: txReceipt.hash,
        success: true,
        username: claim.username || null,
        user_id: claim.user_id || null,
        winning_url: claim.winning_url || `https://qrcoin.fun/auction/${claim.auction_id}`,
        claim_source: claim.claim_source,
        client_ip: claim.client_ip
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
      
      // Resolve all claims successfully
      claims.forEach(claim => {
        const resolver = pendingResolvers.get(claim.id);
        if (resolver) {
          // Clear the timeout to prevent false timeouts
          if (resolver.timeoutId) {
            clearTimeout(resolver.timeoutId);
          }
          resolver.resolve({
            success: true,
            tx_hash: txReceipt.hash
          });
          pendingResolvers.delete(claim.id);
        }
      });
      
    } catch (batchError) {
      console.error(`Batch failed for ${claimSource}:`, batchError);
      
      // Reject all claims in the batch
      const errorMessage = batchError instanceof Error ? batchError.message : String(batchError);
      claims.forEach(claim => {
        const resolver = pendingResolvers.get(claim.id);
        if (resolver) {
          // Clear the timeout first
          if (resolver.timeoutId) {
            clearTimeout(resolver.timeoutId);
          }
          resolver.reject(new Error(errorMessage));
          pendingResolvers.delete(claim.id);
        }
      });
      
    } finally {
      // Release wallet lock if using pool
      if (walletLockKey && walletConfig) {
        await walletPool.releaseWallet(walletLockKey);
        console.log(`Released wallet lock for ${adminWallet.address}`);
      }
    }
  } finally {
    // Always release the batch processing lock
    await redis.del(lockKey);
  }
}

// Check if we should process a batch
async function checkAndProcessBatch(claimSource: string): Promise<void> {
  const queueKey = `${BATCH_QUEUE_PREFIX}${claimSource}`;
  const queueLength = await redis.llen(queueKey);
  
  if (queueLength >= BATCH_SIZE) {
    console.log(`🚀 Batch size reached (${queueLength}/${BATCH_SIZE}), processing immediately for ${claimSource}`);
    await processBatch(claimSource);
  } else if (queueLength > 0) {
    // Check if timer exists
    const timerKey = `${BATCH_TIMER_PREFIX}${claimSource}`;
    const timerExists = await redis.exists(timerKey);
    
    if (!timerExists) {
      // Set timer and schedule batch processing
      await redis.set(timerKey, Date.now().toString(), {
        ex: Math.ceil(BATCH_TIMEOUT / 1000) // Convert to seconds
      });
      
      // Schedule with QStash for reliable delayed execution
      try {
        await qstash.publishJSON({
          url: `${process.env.NEXT_PUBLIC_HOST_URL}/api/batch/process`,
          body: { claimSource },
          delay: BATCH_TIMEOUT / 1000 // QStash expects seconds
        });
        console.log(`⏱️ Batch timer set for ${BATCH_TIMEOUT}ms (${claimSource})`);
      } catch (error) {
        console.error('Failed to schedule batch with QStash:', error);
        // Fallback: try to process after timeout locally (less reliable)
        setTimeout(() => processBatch(claimSource), BATCH_TIMEOUT);
      }
    }
  }
}

// Add a claim to the batch processor
export async function addToBatch(claimData: {
  fid: number;
  address: string;
  auction_id: string;
  username?: string;
  user_id?: string;
  winning_url?: string;
  claim_source: string;
  client_ip: string;
}): Promise<{ success: boolean; tx_hash?: string; error?: string }> {
  // Generate unique ID for this claim
  const claimId = `${claimData.address}:${claimData.auction_id}:${Date.now()}`;
  
  return new Promise(async (resolve, reject) => {
    try {
      const claim: PendingClaim = {
        ...claimData,
        id: claimId,
        timestamp: Date.now()
      };
      
      // Store resolver for later
      const resolver = { resolve, reject, timeoutId: undefined as NodeJS.Timeout | undefined };
      pendingResolvers.set(claimId, resolver);
      
      try {
        // Add to Redis queue
        const queueKey = `${BATCH_QUEUE_PREFIX}${claimData.claim_source}`;
        await redis.rpush(queueKey, JSON.stringify(claim));
        
        const queueLength = await redis.llen(queueKey);
        console.log(`📦 Added claim to batch (${queueLength}/${BATCH_SIZE}) for ${claimData.claim_source}`);
        
        // Check if we should process
        await checkAndProcessBatch(claimData.claim_source);
      } catch (redisError) {
        // Redis failed - remove resolver and throw error to trigger fallback
        console.error('Redis error in batch processing:', redisError);
        pendingResolvers.delete(claimId);
        throw new Error('Redis unavailable for batch processing');
      }
      
      // Set a timeout to reject if not processed within reasonable time
      const timeoutId = setTimeout(() => {
        if (pendingResolvers.has(claimId)) {
          console.log(`⏱️ Batch processing timeout for claim ${claimId} - triggering fallback`);
          pendingResolvers.delete(claimId);
          reject(new Error('Batch processing timeout'));
        }
      }, BATCH_TIMEOUT * 2); // Double the batch timeout for safety
      
      // Store the timeout ID so we can clear it later
      resolver.timeoutId = timeoutId;
      
    } catch (error) {
      reject(error);
    }
  });
}

// Check if batch processing is enabled
export function isBatchProcessingEnabled(): boolean {
  return process.env.ENABLE_BATCH_CLAIMS === 'true';
}

// Force process all pending batches (useful for testing or shutdown)
export async function flushAllBatches(): Promise<void> {
  const sources = ['web', 'mini_app'];
  await Promise.all(sources.map(source => processBatch(source)));
}

// Process batch endpoint handler (called by QStash)
export async function handleBatchProcess(claimSource: string): Promise<void> {
  await processBatch(claimSource);
}

// Get batch queue status
export async function getBatchQueueStatus(): Promise<{
  web: number;
  mini_app: number;
  redis_healthy: boolean;
}> {
  try {
    const webQueue = await redis.llen(`${BATCH_QUEUE_PREFIX}web`);
    const miniAppQueue = await redis.llen(`${BATCH_QUEUE_PREFIX}mini_app`);
    
    return {
      web: webQueue,
      mini_app: miniAppQueue,
      redis_healthy: true
    };
  } catch (error) {
    console.error('Error getting batch queue status:', error);
    return {
      web: 0,
      mini_app: 0,
      redis_healthy: false
    };
  }
}

// Clean up expired claims (maintenance task)
export async function cleanupExpiredClaims(): Promise<void> {
  const sources = ['web', 'mini_app'];
  
  for (const source of sources) {
    try {
      const queueKey = `${BATCH_QUEUE_PREFIX}${source}`;
      const claims = await redis.lrange(queueKey, 0, -1);
      
      const now = Date.now();
      const validClaims: string[] = [];
      
      for (const claimStr of claims) {
        try {
          const claim = JSON.parse(claimStr as string) as PendingClaim;
          // Keep claims less than 5 minutes old
          if (now - claim.timestamp < 5 * 60 * 1000) {
            validClaims.push(claimStr as string);
          }
        } catch {
          // Skip invalid claims
        }
      }
      
      // Replace queue with valid claims only
      if (validClaims.length < claims.length) {
        await redis.del(queueKey);
        if (validClaims.length > 0) {
          await redis.rpush(queueKey, ...validClaims);
        }
        console.log(`Cleaned up ${claims.length - validClaims.length} expired claims from ${source} queue`);
      }
    } catch (error) {
      console.error(`Error cleaning up ${source} queue:`, error);
    }
  }
}