import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { ethers } from 'ethers';
import { Redis } from '@upstash/redis';
import AirdropABI from '@/abi/Airdrop.json';

// Setup Supabase client
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
const supabase = createClient(supabaseUrl, supabaseKey);

// Setup Upstash Redis client for queue
const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL?.replace(/^@/, '') || '',
  token: process.env.UPSTASH_REDIS_REST_TOKEN || '',
});

// Queue name for airdrop requests
const AIRDROP_QUEUE = 'airdrop_requests';

// Contract details
const QR_TOKEN_ADDRESS = process.env.NEXT_PUBLIC_QR_COIN || '';
const AIRDROP_CONTRACT_ADDRESS = process.env.AIRDROP_CONTRACT_ADDRESS || '';
const ADMIN_PRIVATE_KEY = process.env.ADMIN_PRIVATE_KEY || '';

// Alchemy RPC URL for Base
const ALCHEMY_RPC_URL = 'https://base-mainnet.g.alchemy.com/v2/';
const ALCHEMY_API_KEY = process.env.NEXT_PUBLIC_ALCHEMY_API_KEY || '';
const RPC_URL = ALCHEMY_API_KEY ? 
  `${ALCHEMY_RPC_URL}${ALCHEMY_API_KEY}` : 
  'https://mainnet.base.org';

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

// Simple delay function
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// Interface for queue job data
interface AirdropJob {
  fid: string;
  address: string;
  username?: string;
  hasNotifications: boolean;
  timestamp: number;
  attempt?: number;
}

// Function to retry transactions with exponential backoff
async function executeWithRetry<T>(
  operation: (attempt: number) => Promise<T>,
  maxRetries: number = 3,
  initialDelayMs: number = 1000
): Promise<T> {
  let attempt = 0;
  let lastError: Error | unknown;

  while (attempt <= maxRetries) {
    try {
      return await operation(attempt);
    } catch (error) {
      lastError = error;
      
      // Check if this is a retryable error
      const isRetryable = error instanceof Error && (
        error.message?.includes('replacement fee too low') ||
        error.message?.includes('nonce has already been used') ||
        error.message?.includes('transaction underpriced') ||
        error.message?.includes('timeout') ||
        error.message?.includes('network error') ||
        error.message?.includes('transaction execution reverted')
      );
      
      // Don't retry if error is not retryable
      if (!isRetryable || attempt >= maxRetries) {
        throw error;
      }
      
      // Log retry attempt
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.log(`Transaction failed (attempt ${attempt + 1}/${maxRetries + 1}). Retrying in ${initialDelayMs * 2 ** attempt}ms. Error: ${errorMessage}`);
      
      // Wait with exponential backoff
      await delay(initialDelayMs * 2 ** attempt);
      attempt++;
    }
  }
  
  throw lastError;
}

// Process a job from the queue
async function processAirdropJob(job: AirdropJob): Promise<{ success: boolean; tx_hash?: string; error?: string }> {
  const { fid, address } = job;

  try {
    // Initialize ethers provider and wallet
    const provider = new ethers.JsonRpcProvider(RPC_URL);
    const adminWallet = new ethers.Wallet(ADMIN_PRIVATE_KEY, provider);
    
    // Check wallet balance before proceeding
    const balance = await provider.getBalance(adminWallet.address);
    console.log(`Admin wallet balance: ${ethers.formatEther(balance)} ETH for job ${fid}`);
    
    if (balance < ethers.parseEther("0.001")) {
      console.error("Admin wallet has insufficient ETH for gas");
      throw new Error('Admin wallet has insufficient ETH for gas');
    }
    
    // Define airdrop amount (10,000 QR tokens)
    // Assuming 18 decimals for the QR token
    const airdropAmount = ethers.parseUnits('10000', 18);
    
    console.log(`Preparing airdrop of 10,000 QR tokens to ${address} for FID=${fid}`);
    
    // Create contract instances
    const airdropContract = new ethers.Contract(
      AIRDROP_CONTRACT_ADDRESS,
      AirdropABI.abi,
      adminWallet
    );
    
    const qrTokenContract = new ethers.Contract(
      QR_TOKEN_ADDRESS,
      ERC20_ABI,
      adminWallet
    );
    
    // Check token balance and allowance
    const tokenBalance = await qrTokenContract.balanceOf(adminWallet.address);
    console.log(`Admin QR token balance: ${ethers.formatUnits(tokenBalance, 18)}`);
    
    if (tokenBalance < airdropAmount) {
      console.error("Admin wallet has insufficient QR tokens for airdrop");
      throw new Error('Admin wallet has insufficient QR tokens for airdrop');
    }
    
    const allowance = await qrTokenContract.allowance(adminWallet.address, AIRDROP_CONTRACT_ADDRESS);
    console.log(`Current allowance: ${ethers.formatUnits(allowance, 18)}`);
    
    if (allowance < airdropAmount) {
      console.log('Approving tokens for transfer...');
      
      // Get nonce for approval transaction
      const approvalNonce = await provider.getTransactionCount(adminWallet.address, 'latest');
      console.log(`Using nonce ${approvalNonce} for approval`);

      // Approve the airdrop contract to spend the tokens
      const approveTx = await qrTokenContract.approve(
        AIRDROP_CONTRACT_ADDRESS,
        airdropAmount,
        {
          nonce: approvalNonce,
          gasLimit: 300000
        }
      );
      
      console.log(`Approval tx submitted: ${approveTx.hash}`);
      await approveTx.wait();
      console.log('Approval confirmed');
      
      // Add a small delay after approval
      await delay(2000);
    } else {
      console.log('Sufficient allowance already exists, skipping approval');
    }
    
    // Prepare airdrop content
    const airdropContent = [{
      recipient: address,
      amount: airdropAmount
    }];
    
    console.log(`Executing airdrop for FID=${fid}...`);
    
    // Wrap the transaction in the retry function
    const receipt = await executeWithRetry(async (attempt) => {
      // Get fresh nonce each time
      const nonce = await provider.getTransactionCount(adminWallet.address, 'latest');
      console.log(`Using nonce: ${nonce} for airdrop transaction, attempt: ${attempt}`);
      
      // Increase gas price with each retry attempt
      const gasPrice = await provider.getFeeData().then(feeData => 
        feeData.gasPrice ? feeData.gasPrice * BigInt(130 + attempt * 20) / BigInt(100) : undefined
      );
      
      // Execute the airdrop with explicit nonce and higher gas limit
      const tx = await airdropContract.airdropERC20(
        QR_TOKEN_ADDRESS,
        airdropContent,
        {
          nonce,
          gasLimit: 500000, // Higher gas limit for safety
          gasPrice // Increasing gas price with each retry
        }
      );
      
      console.log(`Airdrop tx submitted: ${tx.hash} for FID=${fid}`);
      const receipt = await tx.wait();
      console.log(`Airdrop confirmed in block ${receipt.blockNumber} for FID=${fid}`);
      
      return receipt;
    });
    
    // Return success info with transaction hash
    return {
      success: true,
      tx_hash: receipt.hash
    };
  } catch (error) {
    console.error(`Error processing airdrop for FID=${fid}:`, error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      success: false,
      error: errorMessage
    };
  }
}

// Process a batch of jobs from the queue
async function processBatch(batchSize: number = 1): Promise<{ 
  processed: number; 
  succeeded: number; 
  failed: number;
  errors: string[] 
}> {
  const result = {
    processed: 0,
    succeeded: 0,
    failed: 0,
    errors: [] as string[]
  };
  
  // Process at most batchSize jobs
  for (let i = 0; i < batchSize; i++) {
    // Get job from queue
    const jobData = await redis.rpop(AIRDROP_QUEUE);
    
    if (!jobData) {
      console.log('No more jobs in queue');
      break;
    }
    
    try {
      // The jobData might already be an object due to Redis client auto-deserialization
      const job = typeof jobData === 'string' ? JSON.parse(jobData) : jobData as AirdropJob;
      result.processed++;
      
      console.log(`Processing job for FID=${job.fid}, address=${job.address}`);
      
      // Process the job
      const processResult = await processAirdropJob(job);
      
      // Update database with result
      if (processResult.success) {
        console.log(`Airdrop succeeded for FID=${job.fid}, tx=${processResult.tx_hash}`);
        result.succeeded++;
        
        // Update database with success
        await supabase
          .from('airdrop_claims')
          .update({
            tx_hash: processResult.tx_hash,
            success: true,
            status: 'completed'
          })
          .eq('fid', job.fid);
          
        // Remove pending flag
        await redis.del(`pending:${job.fid}`);
      } else {
        console.log(`Airdrop failed for FID=${job.fid}: ${processResult.error}`);
        result.failed++;
        result.errors.push(`FID=${job.fid}: ${processResult.error}`);
        
        // Update database with failure
        await supabase
          .from('airdrop_claims')
          .update({
            success: false,
            status: 'failed',
            error: processResult.error?.substring(0, 255) // Limit length
          })
          .eq('fid', job.fid);
          
        // Remove pending flag
        await redis.del(`pending:${job.fid}`);
        
        // If we have a serious failure (not a network issue), add a delay
        if (processResult.error?.includes('insufficient') || 
            processResult.error?.includes('reverted')) {
          console.log('Serious error detected, adding delay before next job');
          await delay(5000);
        }
      }
    } catch (error) {
      console.error('Error processing job:', error);
      result.failed++;
      const errorMessage = error instanceof Error ? error.message : String(error);
      result.errors.push(errorMessage);
      
      // Add a delay after errors to prevent rapid-fire failures
      await delay(2000);
    }
  }
  
  return result;
}

// API route handler - requires API key
export async function POST(request: NextRequest) {
  try {
    // Verify API key for security
    const authHeader = request.headers.get('authorization');
    const apiKey = process.env.WORKER_API_KEY;
    
    if (!apiKey || authHeader !== `Bearer ${apiKey}`) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }
    
    // Get batch size from request or use default
    const { batchSize = 5 } = await request.json().catch(() => ({}));
    
    // Process batch
    const result = await processBatch(batchSize);
    
    // Return processing results
    return NextResponse.json({
      success: true,
      result
    });
  } catch (error) {
    console.error('Worker error:', error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    
    return NextResponse.json({ 
      success: false, 
      error: errorMessage
    }, { status: 500 });
  }
} 