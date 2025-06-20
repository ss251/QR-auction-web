import { createClient } from '@supabase/supabase-js';
import { ethers } from 'ethers';
import AirdropABI from '@/abi/Airdrop.json';
import { getWalletPool } from '@/lib/wallet-pool';

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
  fid: number;
  address: string;
  auction_id: string;
  username?: string;
  user_id?: string;
  winning_url?: string;
  claim_source: string;
  client_ip: string;
  timestamp: number;
  resolve: (result: { success: boolean; tx_hash?: string; error?: string }) => void;
  reject: (error: Error) => void;
}

// In-memory batch accumulator
const pendingClaims = new Map<string, PendingClaim[]>(); // Key: claim_source
const batchTimers = new Map<string, NodeJS.Timeout>(); // Key: claim_source

// Process a batch of claims for a specific source
async function processBatch(claims: PendingClaim[], claimSource: string): Promise<void> {
  console.log(`🚀 Processing batch of ${claims.length} claims for ${claimSource}`);
  
  const provider = new ethers.JsonRpcProvider(RPC_URL);
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
    } catch {
      // If no wallet available, reject all claims
      claims.forEach(claim => {
        claim.reject(new Error('All wallets busy'));
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
      claim.resolve({
        success: true,
        tx_hash: txReceipt.hash
      });
    });
    
  } catch (batchError) {
    console.error(`Batch failed for ${claimSource}:`, batchError);
    
    // Reject all claims in the batch
    const errorMessage = batchError instanceof Error ? batchError.message : String(batchError);
    claims.forEach(claim => {
      claim.reject(new Error(errorMessage));
    });
    
  } finally {
    // Release wallet lock if using pool
    if (lockKey && walletConfig) {
      await walletPool.releaseWallet(lockKey);
      console.log(`Released wallet lock for ${adminWallet.address}`);
    }
  }
}

// Execute batch processing for a specific claim source
async function executeBatch(claimSource: string): Promise<void> {
  const claims = pendingClaims.get(claimSource) || [];
  if (claims.length === 0) return;
  
  // Clear the pending claims and timer for this source
  pendingClaims.delete(claimSource);
  const timer = batchTimers.get(claimSource);
  if (timer) {
    clearTimeout(timer);
    batchTimers.delete(claimSource);
  }
  
  // Process the batch
  await processBatch(claims, claimSource);
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
  return new Promise((resolve, reject) => {
    const claim: PendingClaim = {
      ...claimData,
      timestamp: Date.now(),
      resolve,
      reject
    };
    
    const claimSource = claimData.claim_source;
    
    // Add to pending claims
    if (!pendingClaims.has(claimSource)) {
      pendingClaims.set(claimSource, []);
    }
    
    const claims = pendingClaims.get(claimSource)!;
    claims.push(claim);
    
    console.log(`📦 Added claim to batch (${claims.length}/${BATCH_SIZE}) for ${claimSource}`);
    
    // Check if we should process the batch immediately
    if (claims.length >= BATCH_SIZE) {
      console.log(`🚀 Batch size reached (${BATCH_SIZE}), processing immediately`);
      executeBatch(claimSource);
    } else {
      // Set or reset the timer
      const existingTimer = batchTimers.get(claimSource);
      if (existingTimer) {
        clearTimeout(existingTimer);
      }
      
      // Calculate timeout based on how old the oldest claim is
      const oldestClaim = claims[0];
      const age = Date.now() - oldestClaim.timestamp;
      const remainingTime = Math.max(100, BATCH_TIMEOUT - age); // At least 100ms
      
      const timer = setTimeout(() => {
        console.log(`⏰ Batch timeout reached, processing ${claims.length} claims for ${claimSource}`);
        executeBatch(claimSource);
      }, remainingTime);
      
      batchTimers.set(claimSource, timer);
      
      console.log(`⏱️ Batch timer set for ${remainingTime}ms (${claimSource})`);
    }
  });
}

// Check if batch processing is enabled
export function isBatchProcessingEnabled(): boolean {
  return process.env.ENABLE_BATCH_CLAIMS === 'true';
}

// Force process all pending batches (useful for testing)
export async function flushAllBatches(): Promise<void> {
  const sources = Array.from(pendingClaims.keys());
  await Promise.all(sources.map(source => executeBatch(source)));
} 