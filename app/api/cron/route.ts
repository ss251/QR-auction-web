import { NextResponse } from 'next/server';

// Worker URL within the same deployment
const WORKER_URL = '/api/airdrop/worker';

// API key for worker auth
const WORKER_API_KEY = process.env.WORKER_API_KEY || '';

// This route will be called by Vercel's cron system
export async function GET() {
  try {
    console.log('Vercel cron: Triggering airdrop worker');
    
    // Call the worker endpoint to process the queue
    const response = await fetch(
      // Use absolute URL construction for same-deployment fetch
      new URL(WORKER_URL, process.env.NEXT_PUBLIC_HOST_URL 
        ? `${process.env.NEXT_PUBLIC_HOST_URL}` 
        : 'http://localhost:3000'),
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${WORKER_API_KEY}`
        },
        body: JSON.stringify({ batchSize: 3 }) // Process 3 jobs per batch
      }
    );
    
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