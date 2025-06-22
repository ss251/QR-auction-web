import { NextRequest, NextResponse } from 'next/server';
import { Receiver } from '@upstash/qstash';
import { handleBatchProcess } from '@/lib/batch-claim-processor-redis';

// QStash receiver for verification
const receiver = new Receiver({
  currentSigningKey: process.env.QSTASH_CURRENT_SIGNING_KEY || '',
  nextSigningKey: process.env.QSTASH_NEXT_SIGNING_KEY || '',
});

export async function POST(req: NextRequest) {
  try {
    // Verify the request is from QStash
    const signature = req.headers.get('upstash-signature');
    if (!signature) {
      return NextResponse.json({ success: false, error: 'Unauthorized - missing signature' }, { status: 401 });
    }
    
    const bodyText = await req.text();
    const isValid = await receiver.verify({
      signature,
      body: bodyText,
    });
    
    if (!isValid) {
      return NextResponse.json({ success: false, error: 'Unauthorized - invalid signature' }, { status: 401 });
    }
    
    // Parse the body
    const body = JSON.parse(bodyText);
    const { claimSource } = body;
    
    if (!claimSource) {
      return NextResponse.json({ success: false, error: 'Missing claimSource' }, { status: 400 });
    }
    
    console.log(`⏰ QStash triggered batch processing for ${claimSource}`);
    
    // Process the batch
    await handleBatchProcess(claimSource);
    
    return NextResponse.json({ success: true });
    
  } catch (error) {
    console.error('Error in batch process endpoint:', error);
    return NextResponse.json({ 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown error' 
    }, { status: 500 });
  }
}