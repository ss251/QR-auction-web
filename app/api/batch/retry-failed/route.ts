import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { addToBatch } from '@/lib/batch-claim-processor-redis';

// Setup Supabase client
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const supabase = createClient(supabaseUrl, supabaseServiceKey);

export async function POST(request: NextRequest) {
  try {
    // Validate API key
    const apiKey = request.headers.get('x-api-key');
    const validApiKey = process.env.RETRY_API_KEY;
    
    if (!apiKey || !validApiKey || apiKey !== validApiKey) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }
    
    // Get failed batch claims from the database
    const { data: failedClaims, error: fetchError } = await supabase
      .from('link_visit_claim_failures')
      .select('*')
      .eq('error_code', 'BATCH_PROCESSING_FAILED')
      .lt('retry_count', 3)
      .order('created_at', { ascending: true })
      .limit(50);
    
    if (fetchError) {
      console.error('Error fetching failed batch claims:', fetchError);
      return NextResponse.json({ 
        success: false, 
        error: 'Failed to fetch batch failures' 
      }, { status: 500 });
    }
    
    if (!failedClaims || failedClaims.length === 0) {
      return NextResponse.json({ 
        success: true, 
        message: 'No failed batch claims to retry' 
      });
    }
    
    console.log(`🔄 Retrying ${failedClaims.length} failed batch claims`);
    
    const results = [];
    
    for (const failure of failedClaims) {
      try {
        // Re-add to batch queue
        const batchResult = await addToBatch({
          fid: failure.fid,
          address: failure.eth_address,
          auction_id: failure.auction_id.toString(),
          username: failure.username || undefined,
          user_id: failure.user_id || undefined,
          winning_url: failure.winning_url || undefined,
          claim_source: failure.request_data?.claim_source || 'mini_app',
          client_ip: failure.client_ip || 'unknown'
        });
        
        if (batchResult.success) {
          // Delete the failure record
          await supabase
            .from('link_visit_claim_failures')
            .delete()
            .eq('id', failure.id);
          
          results.push({
            id: failure.id,
            success: true,
            tx_hash: batchResult.tx_hash
          });
        } else {
          // Update retry count
          await supabase
            .from('link_visit_claim_failures')
            .update({ 
              retry_count: (failure.retry_count || 0) + 1,
              last_retry_at: new Date().toISOString()
            })
            .eq('id', failure.id);
          
          results.push({
            id: failure.id,
            success: false,
            error: batchResult.error
          });
        }
      } catch (error) {
        console.error(`Error retrying batch claim ${failure.id}:`, error);
        
        // Update retry count
        await supabase
          .from('link_visit_claim_failures')
          .update({ 
            retry_count: (failure.retry_count || 0) + 1,
            last_retry_at: new Date().toISOString()
          })
          .eq('id', failure.id);
        
        results.push({
          id: failure.id,
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }
    
    const successCount = results.filter(r => r.success).length;
    const failureCount = results.filter(r => !r.success).length;
    
    return NextResponse.json({
      success: true,
      summary: {
        total: results.length,
        successful: successCount,
        failed: failureCount
      },
      results
    });
    
  } catch (error) {
    console.error('Batch retry error:', error);
    return NextResponse.json({ 
      success: false, 
      error: 'Failed to process batch retries' 
    }, { status: 500 });
  }
}