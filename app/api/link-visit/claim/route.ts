import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { ethers } from 'ethers';
import AirdropABI from '@/abi/Airdrop.json';

// Setup Supabase client
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
const supabase = createClient(supabaseUrl, supabaseKey);

// Contract details
const QR_TOKEN_ADDRESS = process.env.NEXT_PUBLIC_QR_COIN || '';
const AIRDROP_CONTRACT_ADDRESS = process.env.AIRDROP_CONTRACT_ADDRESS2 || '';
const ADMIN_PRIVATE_KEY = process.env.ADMIN_PRIVATE_KEY2 || '';

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

export async function POST(request: NextRequest) {
  try {
    // Parse request body
    const { fid, address, auction_id, username, winning_url } = await request.json();
    
    if (!fid || !address || !auction_id) {
      return NextResponse.json({ success: false, error: 'Missing required parameters' }, { status: 400 });
    }
    
    // Default winning URL if not provided
    const winningUrl = winning_url || `https://qrcoin.fun/auction/${auction_id}`;
    
    // Log request for debugging
    console.log(`Link Visit Claim request: FID=${fid}, address=${address}, auction=${auction_id}, username=${username || 'unknown'}`);
    
    // Check if user has already claimed tokens for this auction (without using .single())
    const { data: claimData, error: selectError } = await supabase
      .from('link_visit_claims')
      .select('*')
      .eq('fid', fid)
      .eq('auction_id', auction_id);
    
    if (selectError) {
      console.error('Error checking claim status:', selectError);
      return NextResponse.json({
        success: false,
        error: 'Database error when checking claim status'
      }, { status: 500 });
    }
      
    if (claimData && claimData.length > 0 && claimData[0].claimed_at) {
      // Check if we have a transaction hash
      if (claimData[0].tx_hash) {
        // There's a valid claim with a tx hash - already claimed successfully
        console.log(`User ${fid} has already claimed tokens for auction ${auction_id} at tx ${claimData[0].tx_hash}`);
        return NextResponse.json({ 
          success: false, 
          error: 'User has already claimed tokens for this auction',
          tx_hash: claimData[0].tx_hash
        }, { status: 400 });
      } else {
        // There's a record with claimed_at but no tx hash - likely a failed claim
        // We'll allow them to try again by deleting this partial record
        console.log(`Found incomplete claim for user ${fid}, auction ${auction_id} - allowing retry`);
        await supabase
          .from('link_visit_claims')
          .delete()
          .match({
            fid: fid,
            auction_id: auction_id
          });
      }
    }
    
    // Initialize ethers provider and wallet
    const provider = new ethers.JsonRpcProvider(RPC_URL);
    const adminWallet = new ethers.Wallet(ADMIN_PRIVATE_KEY, provider);
    
    // Check wallet balance before proceeding
    const balance = await provider.getBalance(adminWallet.address);
    console.log(`Admin wallet balance: ${ethers.formatEther(balance)} ETH`);
    
    if (balance < ethers.parseEther("0.001")) {
      console.error("Admin wallet has insufficient ETH for gas");
      return NextResponse.json({ 
        success: false, 
        error: 'Admin wallet has insufficient ETH for gas. Please contact support.' 
      }, { status: 500 });
    }
    
    // Define airdrop amount (5,000 QR tokens)
    // Assuming 18 decimals for the QR token
    const airdropAmount = ethers.parseUnits('5000', 18);
    
    console.log(`Preparing airdrop of 5,000 QR tokens to ${address}`);
    
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
    try {
      const tokenBalance = await qrTokenContract.balanceOf(adminWallet.address);
      console.log(`Admin QR token balance: ${ethers.formatUnits(tokenBalance, 18)}`);
      
      if (tokenBalance < airdropAmount) {
        console.error("Admin wallet has insufficient QR tokens for airdrop");
        return NextResponse.json({ 
          success: false, 
          error: 'Admin wallet has insufficient QR tokens for airdrop. Please contact support.' 
        }, { status: 500 });
      }
      
      const allowance = await qrTokenContract.allowance(adminWallet.address, AIRDROP_CONTRACT_ADDRESS);
      console.log(`Current allowance: ${ethers.formatUnits(allowance, 18)}`);
      
      if (allowance < airdropAmount) {
        console.log('Approving tokens for transfer...');
        
        // Approve the airdrop contract to spend the tokens
        const approveTx = await qrTokenContract.approve(
          AIRDROP_CONTRACT_ADDRESS,
          airdropAmount
        );
        
        console.log(`Approval tx submitted: ${approveTx.hash}`);
        await approveTx.wait();
        console.log('Approval confirmed');
      } else {
        console.log('Sufficient allowance already exists, skipping approval');
      }
    } catch (error) {
      console.error('Error checking token balance or approving tokens:', error);
      return NextResponse.json({ 
        success: false, 
        error: 'Failed to check token balance or approve tokens. Please try again later.' 
      }, { status: 500 });
    }
    
    // Prepare airdrop content
    const airdropContent = [{
      recipient: address,
      amount: airdropAmount
    }];
    
    console.log('Executing airdrop...');
    
    // Execute the airdrop with retry logic
    try {
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
            gasLimit: 5000000, // Higher gas limit for safety
            gasPrice // Increasing gas price with each retry
          }
        );
        
        console.log(`Airdrop tx submitted: ${tx.hash}`);
        const receipt = await tx.wait();
        console.log(`Airdrop confirmed in block ${receipt.blockNumber}`);
        
        return receipt;
      });
      
      // Insert a new record, don't upsert over existing record
      const { error: insertError } = await supabase
        .from('link_visit_claims')
        .insert({
          fid: fid,
          auction_id: auction_id,
          eth_address: address, 
          link_visited_at: new Date().toISOString(), // Ensure we mark it as visited
          claimed_at: new Date().toISOString(),
          amount: 5000, // 5,000 QR tokens
          tx_hash: receipt.hash,
          success: true,
          username: username || null,
          winning_url: winningUrl
        });
        
      if (insertError) {
        // If insert fails, try an update as fallback
        console.error('Error inserting claim record, trying update:', insertError);
        const { error: updateError } = await supabase
          .from('link_visit_claims')
          .update({
            eth_address: address,
            claimed_at: new Date().toISOString(),
            amount: 5000, // 5,000 QR tokens
            tx_hash: receipt.hash,
            success: true,
            username: username || null,
            winning_url: winningUrl
          })
          .match({
            fid: fid,
            auction_id: auction_id
          });
          
        if (updateError) {
          console.error('Error updating claim record:', updateError);
          return NextResponse.json({ 
            success: true, 
            warning: 'Airdrop successful but failed to update claim record',
            tx_hash: receipt.hash
          });
        }
      }
      
      return NextResponse.json({ 
        success: true, 
        message: 'Tokens claimed successfully',
        tx_hash: receipt.hash
      });
    } catch (error: unknown) {
      console.error('Token claim error:', error);
      
      // Try to provide more specific error messages for common issues
      let errorMessage = 'Failed to process token claim';
      if (error instanceof Error) {
        if (error.message.includes('insufficient funds')) {
          errorMessage = 'Insufficient funds in admin wallet for gas';
        } else if (error.message.includes('execution reverted')) {
          errorMessage = 'Contract execution reverted: ' + error.message.split('execution reverted:')[1]?.trim() || 'unknown reason';
        }
      }
      
      return NextResponse.json({ 
        success: false, 
        error: errorMessage
      }, { status: 500 });
    }
  } catch (error: unknown) {
    console.error('Token claim error:', error);
    
    // Try to provide more specific error messages for common issues
    let errorMessage = 'Failed to process token claim';
    if (error instanceof Error) {
      if (error.message.includes('insufficient funds')) {
        errorMessage = 'Insufficient funds in admin wallet for gas';
      } else if (error.message.includes('execution reverted')) {
        errorMessage = 'Contract execution reverted: ' + error.message.split('execution reverted:')[1]?.trim() || 'unknown reason';
      }
    }
    
    return NextResponse.json({ 
      success: false, 
      error: errorMessage
    }, { status: 500 });
  }
} 