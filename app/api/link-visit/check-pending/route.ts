import { NextRequest, NextResponse } from 'next/server';
import { Redis } from '@upstash/redis';

// Setup Redis client
const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL!,
  token: process.env.UPSTASH_REDIS_REST_TOKEN!,
});

const BATCH_QUEUE_PREFIX = 'batch:claims:';

export async function POST(req: NextRequest) {
  try {
    const { address, fid, auction_id, username } = await req.json();
    
    if (!auction_id) {
      return NextResponse.json({ 
        success: false, 
        error: 'Missing auction_id' 
      }, { status: 400 });
    }
    
    // Check if there's a pending claim in either web or mini_app batch queue
    const sources = ['web', 'mini_app'];
    
    for (const source of sources) {
      const queueKey = `${BATCH_QUEUE_PREFIX}${source}`;
      
      try {
        // Get all pending claims from this queue
        const pendingClaims = await redis.lrange(queueKey, 0, -1);
        
        // Check if any match our criteria
        for (const claimStr of pendingClaims) {
          try {
            const claim = typeof claimStr === 'string' 
              ? JSON.parse(claimStr) 
              : claimStr;
            
            // Check if this claim matches the user
            const auctionMatches = claim.auction_id === auction_id.toString();
            const addressMatches = address && claim.address?.toLowerCase() === address.toLowerCase();
            const fidMatches = fid && claim.fid === fid;
            const usernameMatches = username && claim.username?.toLowerCase() === username.toLowerCase();
            
            if (auctionMatches && (addressMatches || fidMatches || usernameMatches)) {
              console.log(`Found pending claim in ${source} queue for auction ${auction_id}`);
              return NextResponse.json({ 
                success: true, 
                hasPendingClaim: true,
                source: source
              });
            }
          } catch (e) {
            console.error('Error parsing claim:', e);
          }
        }
      } catch (error) {
        console.error(`Error checking ${source} queue:`, error);
      }
    }
    
    // No pending claims found
    return NextResponse.json({ 
      success: true, 
      hasPendingClaim: false 
    });
    
  } catch (error) {
    console.error('Error checking pending claims:', error);
    return NextResponse.json({ 
      success: false, 
      error: 'Failed to check pending claims' 
    }, { status: 500 });
  }
}