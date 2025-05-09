import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { ethers } from 'ethers';

// Setup Supabase client
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_SERVICE_KEY || ''; // Use service key for admin access
const supabase = createClient(supabaseUrl, supabaseKey);

// For testing purposes
const TEST_USERNAME = "thescoho.eth";

// Contract details
const QR_TOKEN_ADDRESS = '0x2b5050F01d64FBb3e4Ac44dc07f0732BFb5ecadF'; // QR token address on Base mainnet
const AIRDROP_CONTRACT_ADDRESS = process.env.AIRDROP_CONTRACT_ADDRESS || '';
const ADMIN_PRIVATE_KEY = process.env.ADMIN_PRIVATE_KEY || '';
const RPC_URL = process.env.BASE_RPC_URL || 'https://mainnet.base.org';

// ABI for airdropERC20 function
const AIRDROP_ABI = [
  {
    "inputs": [
      { "internalType": "address", "name": "_tokenAddress", "type": "address" },
      { "internalType": "address", "name": "_tokenOwner", "type": "address" },
      { 
        "components": [
          { "internalType": "address", "name": "recipient", "type": "address" },
          { "internalType": "uint256", "name": "amount", "type": "uint256" }
        ],
        "internalType": "struct IAirdropERC20.AirdropContent[]", 
        "name": "_contents", 
        "type": "tuple[]" 
      }
    ],
    "name": "airdropERC20",
    "outputs": [],
    "stateMutability": "payable",
    "type": "function"
  }
];

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
  }
];

export async function POST(request: NextRequest) {
  try {
    // Parse request body
    const { fid, address, hasNotifications, username } = await request.json();
    
    if (!fid || !address) {
      return NextResponse.json({ success: false, error: 'Missing fid or address' }, { status: 400 });
    }
    
    // Special exception for testing with thescoho.eth
    if (username === TEST_USERNAME) {
      console.log(`Test user ${TEST_USERNAME} claiming airdrop - skipping contract call`);
      return NextResponse.json({ 
        success: true, 
        tx_hash: '0x' + Array(64).fill(0).map(() => Math.floor(Math.random() * 16).toString(16)).join('')
      });
    }
    
    // Require notifications to be enabled - this comes from the client
    // which captures the frameContext.client.notificationDetails
    if (!hasNotifications) {
      return NextResponse.json({ 
        success: false, 
        error: 'User has not added frame with notifications enabled' 
      }, { status: 400 });
    }
    
    // Check if user has already claimed
    const { data: claimData } = await supabase
      .from('airdrop_claims')
      .select('*')
      .eq('fid', fid)
      .single();
      
    if (claimData) {
      return NextResponse.json({ 
        success: false, 
        error: 'User has already claimed the airdrop' 
      }, { status: 400 });
    }
    
    // Initialize ethers provider and wallet
    const provider = new ethers.JsonRpcProvider(RPC_URL);
    const adminWallet = new ethers.Wallet(ADMIN_PRIVATE_KEY, provider);
    
    // Define airdrop amount (100,000 QR tokens)
    // Assuming 18 decimals for the QR token
    const airdropAmount = ethers.parseUnits('100000', 18);
    
    // Create contract instances
    const airdropContract = new ethers.Contract(
      AIRDROP_CONTRACT_ADDRESS,
      AIRDROP_ABI,
      adminWallet
    );
    
    const qrTokenContract = new ethers.Contract(
      QR_TOKEN_ADDRESS,
      ERC20_ABI,
      adminWallet
    );
    
    // Approve the airdrop contract to spend the tokens
    const approveTx = await qrTokenContract.approve(
      AIRDROP_CONTRACT_ADDRESS,
      airdropAmount
    );
    await approveTx.wait();
    
    // Prepare airdrop content
    const airdropContent = [{
      recipient: address,
      amount: airdropAmount
    }];
    
    // Execute the airdrop
    const airdropTx = await airdropContract.airdropERC20(
      QR_TOKEN_ADDRESS,
      adminWallet.address,
      airdropContent
    );
    
    const receipt = await airdropTx.wait();
    
    // Record the claim in the database
    const { error: insertError } = await supabase
      .from('airdrop_claims')
      .insert({
        fid: fid,
        eth_address: address,
        amount: 100000, // 100,000 QR tokens
        tx_hash: receipt.hash,
        success: true
      });
      
    if (insertError) {
      console.error('Error recording claim:', insertError);
      return NextResponse.json({ 
        success: true, 
        warning: 'Airdrop successful but failed to record claim',
        tx_hash: receipt.hash
      });
    }
    
    return NextResponse.json({ 
      success: true, 
      tx_hash: receipt.hash
    });
  } catch (error) {
    console.error('Airdrop claim error:', error);
    return NextResponse.json({ 
      success: false, 
      error: 'Failed to process airdrop claim' 
    }, { status: 500 });
  }
} 