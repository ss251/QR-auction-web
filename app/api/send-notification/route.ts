import { NextRequest } from "next/server";
import { Redis } from "@upstash/redis";
import { 
  sendWinnerNotification, 
  sendOutbidNotification, 
  sendAuctionEndingSoonNotification, 
  sendAuctionWonNotification 
} from "@/lib/notifs";
import { getUserNotificationDetails } from "@/lib/kv";

// Add a simple API key for protection
const API_KEY = process.env.NOTIFICATION_API_KEY;

export async function POST(request: NextRequest) {
  // Check API key for security
  const authHeader = request.headers.get("authorization");
  if (!authHeader || !authHeader.startsWith("Bearer ") || authHeader.split(" ")[1] !== API_KEY) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const requestData = await request.json();
    const { type, data } = requestData;
    
    if (!type || !data) {
      return Response.json({ error: "Missing parameters" }, { status: 400 });
    }
    
    // Different notification types
    switch (type) {
      case "winner": {
        // Send notification about the daily winner
        const { fid, winnerName, auctionId, targetUrl } = data;
        
        if (!fid || !winnerName || !auctionId || !targetUrl) {
          return Response.json({ error: "Missing winner notification data" }, { status: 400 });
        }
        
        const result = await sendWinnerNotification({
          fid,
          winnerName,
          auctionId,
          targetUrl
        });
        
        return Response.json({ success: true, result });
      }
      
      case "outbid": {
        // Send notification to a bidder who has been outbid
        const { fid, auctionId } = data;
        
        if (!fid || !auctionId) {
          return Response.json({ error: "Missing outbid notification data" }, { status: 400 });
        }
        
        const result = await sendOutbidNotification({
          fid,
          auctionId
        });
        
        return Response.json({ success: true, result });
      }
      
      case "ending_soon": {
        // Send notification that auction is ending soon
        const { fid, auctionId } = data;
        
        if (!fid || !auctionId) {
          return Response.json({ error: "Missing ending soon notification data" }, { status: 400 });
        }
        
        const result = await sendAuctionEndingSoonNotification({
          fid,
          auctionId
        });
        
        return Response.json({ success: true, result });
      }
      
      case "won": {
        // Send notification to the winner of an auction
        const { fid, auctionId } = data;
        
        if (!fid || !auctionId) {
          return Response.json({ error: "Missing auction won notification data" }, { status: 400 });
        }
        
        const result = await sendAuctionWonNotification({
          fid,
          auctionId
        });
        
        return Response.json({ success: true, result });
      }
      
      case "broadcast": {
        // Send a notification to all users who have enabled notifications
        const { title, body, targetUrl } = data;
        
        if (!title || !body) {
          return Response.json({ error: "Missing broadcast notification data" }, { status: 400 });
        }
        
        // Get all notification tokens from Redis
        const redis = new Redis({
          url: process.env.NEXT_PUBLIC_REDIS_URL,
          token: process.env.NEXT_PUBLIC_REDIS_API_KEY,
        });
        
        // Get all keys with pattern frames-v2-demo:user:*
        const keys = await redis.keys("frames-v2-demo:user:*");
        
        // For each key, get the FID from the key
        const results = [];
        
        for (const key of keys) {
          try {
            // Extract FID from key (frames-v2-demo:user:123 -> 123)
            const fidMatch = key.match(/frames-v2-demo:user:(\d+)/);
            if (fidMatch && fidMatch[1]) {
              const fid = parseInt(fidMatch[1], 10);
              
              // Get notification details for this user
              const notificationDetails = await getUserNotificationDetails(fid);
              
              if (notificationDetails) {
                const result = await sendWinnerNotification({
                  fid,
                  winnerName: title, // Reuse the title as winnerName
                  auctionId: 0,     // Default value
                  targetUrl: targetUrl || (process.env.NEXT_PUBLIC_HOST_URL || ""),
                });
                
                results.push({ fid, result });
              }
            }
          } catch (error) {
            console.error(`Error sending to FID: ${key}`, error);
          }
        }
        
        return Response.json({ success: true, results });
      }
      
      default:
        return Response.json({ error: "Invalid notification type" }, { status: 400 });
    }
  } catch (error) {
    console.error("Error sending notification:", error);
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}
