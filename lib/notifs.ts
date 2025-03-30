import {
  SendNotificationRequest,
  sendNotificationResponseSchema,
} from "@farcaster/frame-sdk";
import { getUserNotificationDetails } from "./kv";

const appUrl = process.env.NEXT_PUBLIC_HOST_URL || "";

type SendFrameNotificationResult =
  | {
      state: "error";
      error: unknown;
    }
  | { state: "no_token" }
  | { state: "rate_limit" }
  | { state: "success" };

export async function sendFrameNotification({
  fid,
  title,
  body,
  targetUrl,
}: {
  fid: number;
  title: string;
  body: string;
  targetUrl?: string;
}): Promise<SendFrameNotificationResult> {
  const notificationDetails = await getUserNotificationDetails(fid);
  if (!notificationDetails) {
    return { state: "no_token" };
  }

  const response = await fetch(notificationDetails.url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      notificationId: crypto.randomUUID(),
      title,
      body,
      targetUrl: targetUrl || appUrl,
      tokens: [notificationDetails.token],
    } satisfies SendNotificationRequest),
  });

  const responseJson = await response.json();

  if (response.status === 200) {
    const responseBody = sendNotificationResponseSchema.safeParse(responseJson);
    if (responseBody.success === false) {
      // Malformed response
      return { state: "error", error: responseBody.error.errors };
    }

    if (responseBody.data.result.rateLimitedTokens.length) {
      // Rate limited
      return { state: "rate_limit" };
    }

    return { state: "success" };
  } else {
    // Error response
    return { state: "error", error: responseJson };
  }
}

/**
 * Send daily notification about the winning website
 */
export async function sendWinnerNotification({
  fid,
  winnerName,
  auctionId,
}: {
  fid: number;
  winnerName: string;
  auctionId: number;
  targetUrl: string;
}): Promise<SendFrameNotificationResult> {
  return sendFrameNotification({
    fid,
    title: `${winnerName} just won Auction #${auctionId}!`,
    body: "Click here to check out the winning link",
    targetUrl: `${appUrl}/auction/${auctionId}`,
  });
}

/**
 * Send notification to a bidder when they've been outbid
 */
export async function sendOutbidNotification({
  fid,
  auctionId,
}: {
  fid: number;
  auctionId: number;
}): Promise<SendFrameNotificationResult> {
  return sendFrameNotification({
    fid,
    title: "You've been outbid!",
    body: "Bid quickly to regain the lead before the auction ends",
    targetUrl: `${appUrl}/auction/${auctionId}`,
  });
}

/**
 * Send notification when auction is ending soon (5 minutes left)
 */
export async function sendAuctionEndingSoonNotification({
  fid,
  auctionId,
}: {
  fid: number;
  auctionId: number;
}): Promise<SendFrameNotificationResult> {
  return sendFrameNotification({
    fid,
    title: "🚨 5 MINUTES REMAINING IN TODAY'S AUCTION",
    body: "BID NOW!",
    targetUrl: `${appUrl}/auction/${auctionId}`,
  });
}

/**
 * Send notification to winner when they've won the auction
 */
export async function sendAuctionWonNotification({
  fid,
  auctionId,
}: {
  fid: number;
  auctionId: number;
  targetUrl?: string;
}): Promise<SendFrameNotificationResult> {
  return sendFrameNotification({
    fid,
    title: "You won today's auction!",
    body: "The QR now points to your site for the next 24 hours",
    targetUrl: `${appUrl}/auction/${auctionId}`,
  });
}
