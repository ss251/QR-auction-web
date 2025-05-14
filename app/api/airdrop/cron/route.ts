import { NextRequest, NextResponse } from 'next/server';

// Worker URL - change to your deployment URL when ready
const WORKER_URL = process.env.NEXT_PUBLIC_HOST_URL
  ? `${process.env.NEXT_PUBLIC_HOST_URL}/api/airdrop/worker`
  : 'http://localhost:3000/api/airdrop/worker';

// API key for worker auth
const WORKER_API_KEY = process.env.WORKER_API_KEY || '';

// GET endpoint for Upstash cron to hit
export async function GET(request: NextRequest) {
  // Verify the request has the correct cron secret if set
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = request.headers.get('authorization');
  
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    console.log('Unauthorized cron job attempt');
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }
  
  try {
    console.log('Triggering airdrop worker');
    
    // Call the worker endpoint to process the queue
    const response = await fetch(WORKER_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${WORKER_API_KEY}`
      },
      body: JSON.stringify({ batchSize: 3 }) // Process 3 jobs per batch
    });
    
    if (!response.ok) {
      const error = await response.text();
      console.error('Worker responded with error:', error);
      return NextResponse.json({ 
        success: false, 
        error: `Worker error: ${response.status} ${response.statusText}`,
        details: error
      }, { status: 500 });
    }
    
    const result = await response.json();
    console.log('Worker response:', result);
    
    return NextResponse.json({ 
      success: true, 
      triggered: true,
      result
    });
  } catch (error) {
    console.error('Error triggering worker:', error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    
    return NextResponse.json({ 
      success: false, 
      error: errorMessage
    }, { status: 500 });
  }
} 