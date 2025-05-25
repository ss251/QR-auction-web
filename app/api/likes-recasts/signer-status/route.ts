import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getNeynarClient } from '@/lib/neynar';

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

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const signer_uuid = searchParams.get('signer_uuid');

    if (!signer_uuid) {
      return NextResponse.json(
        { error: 'signer_uuid is required' },
        { status: 400 }
      );
    }

    // Get signer from Neynar to check current status
    const neynarClient = getNeynarClient();
    const signer = await neynarClient.lookupSigner({ signerUuid: signer_uuid });
    
    // Update local database with current status
    if (signer.status === 'approved') {
      await supabase
        .from('neynar_signers')
        .update({
          status: 'approved',
          approved_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('signer_uuid', signer_uuid);
    }

    return NextResponse.json({
      signer_uuid: signer.signer_uuid,
      status: signer.status,
      public_key: signer.public_key
    }, { status: 200 });

  } catch (error) {
    console.error('Error checking signer status:', error);
    return NextResponse.json({ error: 'An error occurred' }, { status: 500 });
  }
} 