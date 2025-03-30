import { NextRequest, NextResponse } from "next/server";
import { Redis } from "@upstash/redis";
import { getUserNotificationDetails } from "@/lib/kv";
import { sendWinnerNotification } from "@/lib/notifs";

const API_KEY = process.env.NEXT_PUBLIC_AUCTION_API_KEY;
const DEFAULT_BATCH_SIZE = 10;
const DEFAULT_BATCH_DELAY_MS = 1000;
const RATE_LIMIT_COOLDOWN_MS = 30000; // 30 seconds cooldown if we hit rate limit

export async function POST(request: NextRequest) {
  // Check API key for security
  const authHeader = request.headers.get("authorization");
  if (!authHeader || !authHeader.startsWith("Bearer ") || authHeader.split(" ")[1] !== API_KEY) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    // Get request body
    const body = await request.json();
    const { winnerName, auctionId, batchSize = DEFAULT_BATCH_SIZE, batchDelayMs = DEFAULT_BATCH_DELAY_MS } = body;

    if (!winnerName || !auctionId) {
      return NextResponse.json({ 
        error: "Missing parameters. Required: winnerName, auctionId" 
      }, { status: 400 });
    }

    // Get all notification tokens from Redis
    const redis = new Redis({
      url: process.env.NEXT_PUBLIC_REDIS_URL,
      token: process.env.NEXT_PUBLIC_REDIS_API_KEY,
    });

    // Get all keys with pattern frames-v2-demo:user:*
    const keys = await redis.keys("frames-v2-demo:user:*");
    
    // Process in batches to avoid rate limits
    const results = [];
    const targetUrl = `https://qrcoin.fun/auction/${auctionId}`;
    
    // Track rate limits for adaptive delays
    let totalRateLimits = 0;
    let consecutiveRateLimits = 0;
    let currentDelay = batchDelayMs;
    
    // Process all users in batches
    for (let i = 0; i < keys.length; i += batchSize) {
      console.log(`Processing batch ${Math.floor(i/batchSize) + 1} of ${Math.ceil(keys.length/batchSize)}`);
      
      // If we hit consecutive rate limits, take a longer break
      if (consecutiveRateLimits >= 3) {
        console.log(`Hit ${consecutiveRateLimits} consecutive rate limits, cooling down for ${RATE_LIMIT_COOLDOWN_MS}ms`);
        await new Promise(resolve => setTimeout(resolve, RATE_LIMIT_COOLDOWN_MS));
        consecutiveRateLimits = 0;
        
        // Increase delay for future batches
        currentDelay = Math.min(currentDelay * 2, 5000); // Max 5 second delay
      }
      
      // Get current batch of keys
      const batch = keys.slice(i, i + batchSize);
      
      // Process current batch in parallel
      const batchPromises = batch.map(async (key) => {
        try {
          // Extract FID from key (frames-v2-demo:user:123 -> 123)
          const fidMatch = key.match(/frames-v2-demo:user:(\d+)/);
          if (!fidMatch || !fidMatch[1]) return null;
          
          const fid = parseInt(fidMatch[1], 10);
          
          // Get notification details for this user
          const notificationDetails = await getUserNotificationDetails(fid);
          
          if (!notificationDetails) return null;
          
          // Send the notification
          const result = await sendWinnerNotification({
            fid,
            winnerName,
            auctionId: parseInt(String(auctionId), 10),
            targetUrl
          });
          
          // Check if rate limited
          if (result.state === 'rate_limit') {
            totalRateLimits++;
            consecutiveRateLimits++;
          } else {
            consecutiveRateLimits = 0;
          }
          
          return { fid, result };
        } catch (error) {
          console.error(`Error sending to key: ${key}`, error);
          return null;
        }
      });
      
      // Wait for all notifications in this batch to complete
      const batchResults = (await Promise.all(batchPromises)).filter(Boolean);
      results.push(...batchResults);
      
      // Only add delay if we have more batches to process
      if (i + batchSize < keys.length) {
        await new Promise(resolve => setTimeout(resolve, currentDelay));
      }
    }
    
    return NextResponse.json({ 
      success: true, 
      total: results.length,
      results,
      stats: {
        totalBatches: Math.ceil(keys.length/batchSize),
        batchSize,
        totalRateLimits,
        finalDelay: currentDelay,
      }
    });
  } catch (error) {
    console.error("Error sending daily winner notification:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
} 