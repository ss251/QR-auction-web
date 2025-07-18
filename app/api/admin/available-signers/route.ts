import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { Redis } from '@upstash/redis';

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL!,
  token: process.env.UPSTASH_REDIS_REST_TOKEN!,
});

// Setup Supabase clients
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

// Use service role key for database operations in API routes (bypasses RLS)
const supabase = createClient(
  supabaseUrl,
  supabaseServiceKey || supabaseAnonKey
);

// If we don't have service key, log a warning
if (!supabaseServiceKey) {
  console.warn(
    'SUPABASE_SERVICE_ROLE_KEY not found, falling back to anon key - database reads may fail due to RLS'
  );
}

import { isAdminAddress } from '@/lib/constants';

interface Signer {
  fid: number;
  signer_uuid: string;
  permissions: string[];
  status: string;
  follower_count?: number;
}

interface BatchState {
  castHash: string;
  actionType: string;
  targetFid?: number;
  signers: Signer[];
  currentIndex: number;
  results: {
    successful: number;
    failed: number;
    errors: string[];
    details: Array<{
      fid: number;
      action: string;
      success: boolean;
      error?: string;
    }>;
  };
}

export async function GET(request: NextRequest) {
  try {
    // Check authorization
    const authHeader = request.headers.get('authorization');
    const address = authHeader?.replace('Bearer ', '');

    if (!address || !isAdminAddress(address)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Fetch all approved signers with updated metrics
    const { data: signers, error } = await supabase
      .from('neynar_signers_updated')
      .select(
        `
        fid, 
        permissions, 
        status, 
        approved_at, 
        username,
        display_name,
        follower_count,
        following_count,
        neynar_score,
        power_badge,
        pfp_url,
        bio,
        verified_accounts,
        last_updated_at
      `
      )
      .eq('status', 'approved')
      .limit(10000)
      .order('follower_count', { ascending: false });

    if (error) {
      console.error('Error fetching signers:', error);
      return NextResponse.json(
        { error: 'Failed to fetch signers' },
        { status: 500 }
      );
    }
    const keys: string[] = await redis.keys('likes-recasts-batch:*');


    let cronKeys: {
      key: string;
      total: number;
      completed: number;
      successful: number;
      failed: number;
      
    }[] = [];

    if (keys.length > 0) {
      for (const batchKey of keys as string[]) {
        const state: BatchState|null = await redis.get(batchKey);
        if (state) {
          cronKeys.push({
            key: batchKey,
            total: state.signers.length,
            completed: state.currentIndex,
            successful: state.results.successful,
            failed: state.results.failed,
          });
        }
      }
    }

    return NextResponse.json({
      success: true,
      cronKeys,
      signers: signers || [],
      count: signers?.length || 0,
    });
  } catch (error) {
    console.error('Error in available-signers API:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
