import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import type { Database } from '@/types/database';
import { getAuctionImage, isAuctionImageVideo } from '@/utils/auctionImageOverrides';

// Initialize Supabase client
const supabase = createClient<Database>(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const testAuctionId = searchParams.get('testAuctionId') || '1';
  
  try {
    console.log('🔍 Starting auction image overrides debug...');
    
    // Test 1: Check Supabase connection
    console.log('Test 1: Checking Supabase connection...');
    const { data: connectionTest, error: connectionError } = await supabase
      .from('auction_image_overrides')
      .select('count(*)', { count: 'exact' });
    
    if (connectionError) {
      console.error('❌ Supabase connection failed:', connectionError);
      return NextResponse.json({
        success: false,
        error: 'Supabase connection failed',
        details: connectionError,
        tests: {}
      });
    }
    
    console.log('✅ Supabase connection successful');
    
    // Test 2: Check table structure
    console.log('Test 2: Checking table structure...');
    const { data: structureData, error: structureError } = await supabase
      .from('auction_image_overrides')
      .select('*')
      .limit(1);
    
    // Test 3: Get all records
    console.log('Test 3: Fetching all records...');
    const { data: allRecords, error: fetchError } = await supabase
      .from('auction_image_overrides')
      .select('*')
      .order('auction_id');
    
    // Test 4: Check specific auction ID
    console.log(`Test 4: Checking specific auction ID: ${testAuctionId}...`);
    const { data: specificRecord, error: specificError } = await supabase
      .from('auction_image_overrides')
      .select('*')
      .eq('auction_id', testAuctionId)
      .maybeSingle();
    
    // Test 5: Test getAuctionImage function
    console.log(`Test 5: Testing getAuctionImage function for auction ${testAuctionId}...`);
    let getAuctionImageResult = null;
    let getAuctionImageError = null;
    try {
      getAuctionImageResult = await getAuctionImage(testAuctionId);
      console.log('getAuctionImage result:', getAuctionImageResult);
    } catch (error) {
      getAuctionImageError = error;
      console.error('getAuctionImage error:', error);
    }
    
    // Test 6: Test isAuctionImageVideo function
    console.log(`Test 6: Testing isAuctionImageVideo function for auction ${testAuctionId}...`);
    let isVideoResult = null;
    let isVideoError = null;
    try {
      isVideoResult = await isAuctionImageVideo(testAuctionId);
      console.log('isAuctionImageVideo result:', isVideoResult);
    } catch (error) {
      isVideoError = error;
      console.error('isAuctionImageVideo error:', error);
    }
    
    // Test 7: Check environment variables
    console.log('Test 7: Checking environment variables...');
    const envCheck = {
      NEXT_PUBLIC_SUPABASE_URL: !!process.env.NEXT_PUBLIC_SUPABASE_URL,
      NEXT_PUBLIC_SUPABASE_ANON_KEY: !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
      supabaseUrlLength: process.env.NEXT_PUBLIC_SUPABASE_URL?.length || 0,
      supabaseKeyLength: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.length || 0
    };
    
    // Test 8: Test data format validation
    console.log('Test 8: Validating data formats...');
    const dataValidation = allRecords?.map(record => ({
      auction_id: record.auction_id,
      auction_id_type: typeof record.auction_id,
      image_url: record.image_url,
      image_url_length: record.image_url?.length || 0,
      image_url_trimmed: record.image_url?.trim(),
      image_url_empty: record.image_url?.trim() === '',
      is_video: record.is_video,
      is_video_type: typeof record.is_video
    }));
    
    const results = {
      success: true,
      timestamp: new Date().toISOString(),
      testAuctionId,
      tests: {
        connection: {
          success: !connectionError,
          error: connectionError,
          totalRecords: connectionTest?.[0]?.count || 0
        },
        tableStructure: {
          success: !structureError,
          error: structureError,
          sampleRecord: structureData?.[0] || null
        },
        allRecords: {
          success: !fetchError,
          error: fetchError,
          count: allRecords?.length || 0,
          records: allRecords || []
        },
        specificRecord: {
          success: !specificError,
          error: specificError,
          found: !!specificRecord,
          record: specificRecord
        },
        getAuctionImageFunction: {
          success: !getAuctionImageError,
          error: getAuctionImageError?.message || null,
          result: getAuctionImageResult
        },
        isVideoFunction: {
          success: !isVideoError,
          error: isVideoError?.message || null,
          result: isVideoResult
        },
        environment: envCheck,
        dataValidation: dataValidation
      }
    };
    
    console.log('🎉 Debug complete. Results:', JSON.stringify(results, null, 2));
    
    return NextResponse.json(results);
    
  } catch (error) {
    console.error('💥 Unexpected error during debug:', error);
    return NextResponse.json({
      success: false,
      error: 'Unexpected error during debug',
      details: error instanceof Error ? error.message : String(error),
      tests: {}
    });
  }
}