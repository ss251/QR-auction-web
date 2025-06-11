import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// Initialize regular client for storage operations
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(request: NextRequest) {
  try {
    // Verify service role key is available
    if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
      console.error('SUPABASE_SERVICE_ROLE_KEY is not set');
      return NextResponse.json(
        { error: 'Server configuration error' },
        { status: 500 }
      );
    }

    const formData = await request.formData();
    const image = formData.get('image') as File;
    const latitude = parseFloat(formData.get('latitude') as string);
    const longitude = parseFloat(formData.get('longitude') as string);
    const uploaderId = formData.get('uploader_id') as string;
    const uploaderType = formData.get('uploader_type') as string;
    const city = formData.get('city') as string;
    const fid = formData.get('fid') ? parseInt(formData.get('fid') as string) : null;
    const twitterUsername = formData.get('twitter_username') as string | null;
    const walletAddress = formData.get('wallet_address') as string | null;

    if (!image || !latitude || !longitude || !uploaderId || !uploaderType) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    // Generate unique filename
    const fileExt = image.name.split('.').pop();
    const fileName = `${Date.now()}-${Math.random().toString(36).substring(2)}.${fileExt}`;

    // Upload image to Supabase storage (can use regular client)
    const { error: uploadError } = await supabase.storage
      .from('images')
      .upload(fileName, image, {
        cacheControl: '3600',
        upsert: false,
      });

    if (uploadError) {
      console.error('Upload error:', uploadError);
      return NextResponse.json(
        { error: 'Failed to upload image' },
        { status: 500 }
      );
    }

    // Get public URL for the uploaded image
    const { data: { publicUrl } } = supabase.storage
      .from('images')
      .getPublicUrl(fileName);

    // Insert record into qrmap table (use admin client to bypass RLS)
    console.log('Attempting insert with service role...');
    const { data: insertData, error: insertError } = await supabase
      .from('qrmap')
      .insert({
        image_url: publicUrl,
        latitude,
        longitude,
        uploader_id: uploaderId,
        uploader_type: uploaderType,
        city,
        fid,
        twitter_username: twitterUsername,
        wallet_address: walletAddress,
      })
      .select()
      .single();

    console.log('Insert result:', { insertData, insertError });

    if (insertError) {
      console.error('Insert error:', insertError);
      return NextResponse.json(
        { error: 'Failed to save map entry' },
        { status: 500 }
      );
    }

    return NextResponse.json({ 
      success: true, 
      data: insertData 
    });

  } catch (error) {
    console.error('QR Map API error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get('limit') || '50');
    const offset = parseInt(searchParams.get('offset') || '0');

    // Use admin client for reads to ensure consistency
    const { data, error } = await supabase
      .from('qrmap')
      .select('*')
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) {
      console.error('Fetch error:', error);
      return NextResponse.json(
        { error: 'Failed to fetch map entries' },
        { status: 500 }
      );
    }

    return NextResponse.json({ 
      success: true, 
      data 
    });

  } catch (error) {
    console.error('QR Map API error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
} 