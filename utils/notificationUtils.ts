import { getFarcasterUser } from "./farcaster";

/**
 * Send outbid notification to the specified user for the auction
 * @param outbidAddress The Ethereum address of the user who was outbid
 * @param auctionId The ID of the auction
 * @returns True if the notification was sent, false otherwise
 */
export async function notifyOutbid(outbidAddress: string, auctionId: bigint | number): Promise<boolean> {
  try {
    console.log(`Sending outbid notification to ${outbidAddress} for auction #${auctionId}`);
    
    // Get the user's Farcaster information to find their FID
    const farcasterUser = await getFarcasterUser(outbidAddress);
    
    // If we don't have a Farcaster user, we can't send a notification
    if (!farcasterUser || !farcasterUser.fid) {
      console.log(`No Farcaster FID found for address ${outbidAddress}`);
      return false;
    }
    
    console.log(`Found Farcaster FID ${farcasterUser.fid} for outbid address ${outbidAddress}`);
    
    // Get the API key from environment
    const apiKey = process.env.NEXT_PUBLIC_AUCTION_API_KEY;
    if (!apiKey) {
      console.error("Missing AUCTION_API_KEY environment variable");
      return false;
    }
    
    // Call our API to send the notification
    const response = await fetch('/api/auction/outbid', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        fid: farcasterUser.fid,
        auctionId: Number(auctionId),
        targetUrl: `https://qrcoin.fun/auction/${auctionId}` // Use qrcoin.fun domain
      })
    });
    
    if (!response.ok) {
      const errorData = await response.json();
      console.error('Failed to send outbid notification:', errorData);
      return false;
    }
    
    const data = await response.json();
    console.log('Outbid notification sent:', data);
    return data.success || false;
  } catch (error) {
    console.error('Error sending outbid notification:', error);
    return false;
  }
}

/**
 * Send auction ending soon notifications to bidders
 * @param address Ethereum address of the bidder to notify
 * @param auctionId The auction ID
 * @returns True if notification was sent, false otherwise
 */
export async function notifyAuctionEndingSoon(
  address: string,
  auctionId: bigint | number
): Promise<boolean> {
  try {
    console.log(`Sending auction ending soon notification to ${address} for auction #${auctionId}`);
    
    // Get the user's Farcaster information
    const farcasterUser = await getFarcasterUser(address);
    
    // If we don't have a Farcaster user, we can't send a notification
    if (!farcasterUser || !farcasterUser.fid) {
      console.log(`No Farcaster FID found for address ${address}`);
      return false;
    }
    
    console.log(`Found Farcaster FID ${farcasterUser.fid} for bidder ${address}`);
    
    // Get the API key from environment
    const apiKey = process.env.NEXT_PUBLIC_AUCTION_API_KEY;
    if (!apiKey) {
      console.error("Missing AUCTION_API_KEY environment variable");
      return false;
    }
    
    // Call our API to send the notification
    const response = await fetch('/api/auction/ending-soon', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        fid: farcasterUser.fid,
        auctionId: Number(auctionId),
        targetUrl: `https://qrcoin.fun/auction/${auctionId}` // Use qrcoin.fun domain
      })
    });
    
    if (!response.ok) {
      const errorData = await response.json();
      console.error('Failed to send auction ending soon notification:', errorData);
      return false;
    }
    
    const data = await response.json();
    console.log('Auction ending soon notification sent:', data);
    return data.success || false;
  } catch (error) {
    console.error('Error sending auction ending soon notification:', error);
    return false;
  }
}

/**
 * Send notification to the winner of an auction
 * @param winnerAddress Ethereum address of the auction winner
 * @param auctionId The auction ID
 * @returns True if the notification was sent, false otherwise
 */
export async function notifyAuctionWon(
  winnerAddress: string,
  auctionId: bigint | number,
): Promise<boolean> {
  try {
    console.log(`Notifying auction winner: ${winnerAddress} for auction #${auctionId}`);
    
    // Get the user's Farcaster information to find their FID
    const farcasterUser = await getFarcasterUser(winnerAddress);
    
    // If we don't have a Farcaster user, we can't send a notification
    if (!farcasterUser || !farcasterUser.fid) {
      console.log(`No Farcaster FID found for address ${winnerAddress}`);
      return false;
    }
    
    console.log(`Found Farcaster FID ${farcasterUser.fid} for winner ${winnerAddress}`);
    
    // Get the API key from environment
    const apiKey = process.env.NEXT_PUBLIC_AUCTION_API_KEY;
    if (!apiKey) {
      console.error("Missing AUCTION_API_KEY environment variable");
      return false;
    }
    
    // Call our API to send the notification
    const response = await fetch('/api/auction/won', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        fid: farcasterUser.fid,
        auctionId: Number(auctionId),
        targetUrl: `https://qrcoin.fun/auction/${auctionId}` // Always use qrcoin.fun domain
      })
    });
    
    if (!response.ok) {
      const errorData = await response.json();
      console.error('Failed to send auction won notification:', errorData);
      return false;
    }
    
    const data = await response.json();
    console.log('Auction won notification sent:', data);
    return data.success || false;
  } catch (error) {
    console.error('Error sending auction won notification:', error);
    return false;
  }
}

/**
 * Send daily winner notifications to all users
 * @param winnerName The name of the auction winner
 * @param auctionId The auction ID
 * @returns Object containing success count and results
 */
export async function notifyDailyWinner(
  winnerName: string,
  auctionId: bigint | number,
): Promise<{ 
  success: boolean; 
  results?: { 
    total: number; 
    results: Array<{ 
      fid: number; 
      result: { state: string } 
    }> 
  } 
}> {
  try {
    console.log(`Sending daily winner notification for ${winnerName} (Auction #${auctionId})`);
    
    // Get the API key from environment
    const apiKey = process.env.NEXT_PUBLIC_AUCTION_API_KEY;
    if (!apiKey) {
      console.error("Missing AUCTION_API_KEY environment variable");
      return { success: false };
    }
    
    // Call our API to send notifications with batch processing
    const response = await fetch('/api/auction/daily-winner', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        winnerName,
        auctionId: Number(auctionId),
        batchSize: 10, // Send in batches of 10
        batchDelayMs: 1000 // 1 second delay between notifications in a batch
      })
    });
    
    if (!response.ok) {
      const errorData = await response.json();
      console.error('Failed to send daily winner notifications:', errorData);
      return { success: false };
    }
    
    const data = await response.json();
    console.log('Daily winner notifications sent:', data);
    return { success: true, results: data };
  } catch (error) {
    console.error('Error sending daily winner notifications:', error);
    return { success: false };
  }
} 