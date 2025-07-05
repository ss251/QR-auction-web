import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { verifyAdmin } from '@/lib/auth';

// Initialize Supabase client with service role key
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const supabase = createClient(supabaseUrl, supabaseServiceKey);

// GET: Fetch all claim amount configurations
export async function GET(request: NextRequest) {
  try {
    // Verify admin authentication
    const isAdmin = await verifyAdmin(request);
    if (!isAdmin) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    // Fetch all claim amount configurations
    const { data, error } = await supabase
      .from('claim_amount_configs')
      .select('*')
      .order('category', { ascending: true });

    if (error) {
      console.error('Error fetching claim amounts:', error);
      return NextResponse.json({ success: false, error: 'Failed to fetch claim amounts' }, { status: 500 });
    }

    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error('Error in GET claim-amounts:', error);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}

// POST: Update claim amount configurations
export async function POST(request: NextRequest) {
  try {
    // Verify admin authentication
    const isAdmin = await verifyAdmin(request);
    if (!isAdmin) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const updates = await request.json();

    // Validate the updates array
    if (!Array.isArray(updates)) {
      return NextResponse.json({ success: false, error: 'Invalid request body' }, { status: 400 });
    }

    // Update each configuration
    const results = [];
    for (const update of updates) {
      const { id, amount, description, is_active, min_score, max_score } = update;

      if (!id) {
        results.push({ id, success: false, error: 'Missing ID' });
        continue;
      }

      // Validate amount
      if (amount !== undefined && (typeof amount !== 'number' || amount < 0)) {
        results.push({ id, success: false, error: 'Invalid amount' });
        continue;
      }

      // Validate score ranges
      if (min_score !== undefined && (typeof min_score !== 'number' || min_score < 0 || min_score > 1)) {
        results.push({ id, success: false, error: 'Invalid min_score (must be between 0 and 1)' });
        continue;
      }

      if (max_score !== undefined && (typeof max_score !== 'number' || max_score < 0 || max_score > 1)) {
        results.push({ id, success: false, error: 'Invalid max_score (must be between 0 and 1)' });
        continue;
      }

      // Build update object
      const updateData: any = {};
      if (amount !== undefined) updateData.amount = amount;
      if (description !== undefined) updateData.description = description;
      if (is_active !== undefined) updateData.is_active = is_active;
      if (min_score !== undefined) updateData.min_score = min_score;
      if (max_score !== undefined) updateData.max_score = max_score;

      // Update the record
      const { error } = await supabase
        .from('claim_amount_configs')
        .update(updateData)
        .eq('id', id);

      if (error) {
        console.error(`Error updating claim amount ${id}:`, error);
        results.push({ id, success: false, error: error.message });
      } else {
        results.push({ id, success: true });
      }
    }

    return NextResponse.json({ success: true, results });
  } catch (error) {
    console.error('Error in POST claim-amounts:', error);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}

// PUT: Create a new claim amount configuration
export async function PUT(request: NextRequest) {
  try {
    // Verify admin authentication
    const isAdmin = await verifyAdmin(request);
    if (!isAdmin) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const newConfig = await request.json();

    // Validate required fields
    if (!newConfig.category || !newConfig.amount) {
      return NextResponse.json({ success: false, error: 'Missing required fields' }, { status: 400 });
    }

    // Insert the new configuration
    const { data, error } = await supabase
      .from('claim_amount_configs')
      .insert([newConfig])
      .select()
      .single();

    if (error) {
      console.error('Error creating claim amount:', error);
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error('Error in PUT claim-amounts:', error);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}

// DELETE: Delete a claim amount configuration
export async function DELETE(request: NextRequest) {
  try {
    // Verify admin authentication
    const isAdmin = await verifyAdmin(request);
    if (!isAdmin) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await request.json();

    if (!id) {
      return NextResponse.json({ success: false, error: 'Missing ID' }, { status: 400 });
    }

    // Delete the configuration
    const { error } = await supabase
      .from('claim_amount_configs')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('Error deleting claim amount:', error);
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error in DELETE claim-amounts:', error);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}