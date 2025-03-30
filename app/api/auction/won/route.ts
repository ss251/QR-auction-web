import { NextRequest, NextResponse } from "next/server";
import { sendAuctionWonNotification } from "@/lib/notifs";

const API_KEY = process.env.NEXT_PUBLIC_AUCTION_API_KEY;
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
    const { fid, auctionId, targetUrl } = body;

    if (!fid || !auctionId) {
      return NextResponse.json({ 
        error: "Missing parameters. Required: fid, auctionId" 
      }, { status: 400 });
    }

    // Track rate limit and attempts
    let attempts = 0;
    const maxAttempts = 3;
    let success = false;

    while (!success && attempts < maxAttempts) {
      attempts++;
      
      // Send notification
      const result = await sendAuctionWonNotification({
        fid,
        auctionId,
        targetUrl
      });
      
      // Check the result
      if (result.state === 'success') {
        success = true;
        return NextResponse.json({ state: "success" });
      } else if (result.state === 'rate_limit') {
        console.log(`Rate limited on attempt ${attempts}. Waiting ${RATE_LIMIT_COOLDOWN_MS}ms before retry...`);
        
        // If we've hit the max attempts, don't wait again
        if (attempts < maxAttempts) {
          await new Promise(resolve => setTimeout(resolve, RATE_LIMIT_COOLDOWN_MS));
        }
      } else if (result.state === 'no_token') {
        return NextResponse.json({ state: "no_token" }, { status: 404 });
      } else {
        return NextResponse.json({ state: "error", error: result.error }, { status: 500 });
      }
    }
    
    // If we got here, we've hit max attempts without success
    return NextResponse.json({ state: "rate_limit" }, { status: 429 });
  } catch (error) {
    console.error("Error sending auction won notification:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
} 