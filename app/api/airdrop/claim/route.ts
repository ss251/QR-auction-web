import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { Redis } from '@upstash/redis';

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

// For testing purposes
const TEST_USERNAME = "thescoho.eth";

// Interface for queue job data
interface AirdropJob {
  fid: string;
  address: string;
  username?: string;
  hasNotifications: boolean;
  timestamp: number;
  attempt?: number;
}

// This route now just adds requests to the queue instead of processing directly
export async function POST(request: NextRequest) {
  try {
    // Parse request body
    const { fid, address, hasNotifications, username } = await request.json();
    
    if (!fid || !address) {
      return NextResponse.json({ success: false, error: 'Missing fid or address' }, { status: 400 });
    }
    
    // Log request for debugging
    console.log(`Airdrop claim request received: FID=${fid}, address=${address}, username=${username || 'unknown'}`);
    
    // Special logging for test user
    if (username === TEST_USERNAME) {
      console.log(`Test user ${TEST_USERNAME} requesting airdrop - will be queued`);
    }
    
    // Require notifications to be enabled
    if (!hasNotifications) {
      console.log(`User ${fid} attempted to claim without notifications enabled`);
      return NextResponse.json({ 
        success: false, 
        error: 'User has not added frame with notifications enabled' 
      }, { status: 400 });
    }
    
    // Check if user has already claimed
    const { data: claimData, error: selectError } = await supabase
      .from('airdrop_claims')
      .select('*')
      .eq('fid', fid)
      .single();
    
    if (selectError && selectError.code !== 'PGRST116') { // PGRST116 is "no rows found"
      console.error('Error checking claim status:', selectError);
      return NextResponse.json({
        success: false,
        error: 'Database error when checking claim status'
      }, { status: 500 });
    }
      
    if (claimData) {
      console.log(`User ${fid} has already claimed at tx ${claimData.tx_hash}`);
      return NextResponse.json({ 
        success: false, 
        error: 'User has already claimed the airdrop',
        tx_hash: claimData.tx_hash
      }, { status: 400 });
    }

    // Check if request is already in queue
    const queueKey = `pending:${fid}`;
    const isPending = await redis.get(queueKey);
    
    if (isPending) {
      console.log(`Request for FID=${fid} is already in the queue`);
      return NextResponse.json({ 
        success: true, 
        status: 'pending',
        message: 'Your airdrop claim is being processed' 
      });
    }
    
    // Create a job and add to the queue
    const job: AirdropJob = {
      fid,
      address,
      username,
      hasNotifications,
      timestamp: Date.now(),
      attempt: 0
    };
    
    // Set pending flag with 30 minute expiry
    await redis.set(queueKey, 'true', { ex: 1800 });
    
    // Add to the processing queue
    await redis.lpush(AIRDROP_QUEUE, job);
    
    console.log(`Airdrop request for FID=${fid} added to queue`);
    
    // Insert a pending record in the database
    await supabase.from('airdrop_claims').insert({
      fid,
      eth_address: address,
      amount: 10000,
      tx_hash: null,
      success: false,
      status: 'queued',
      username: username || null
    });
    
    // Return success with pending status
    return NextResponse.json({ 
      success: true, 
      status: 'queued',
      message: 'Your airdrop claim has been queued and will be processed shortly'
    });

  } catch (error: unknown) {
    console.error('Airdrop queue error:', error);
    
    let errorMessage = 'Failed to queue airdrop claim';
    if (error instanceof Error) {
      errorMessage = error.message;
    }
    
    return NextResponse.json({ 
      success: false, 
      error: errorMessage
    }, { status: 500 });
  }
} 
