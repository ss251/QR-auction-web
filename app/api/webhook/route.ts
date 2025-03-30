import {
  ParseWebhookEvent,
  parseWebhookEvent,
  verifyAppKeyWithNeynar,
} from "@farcaster/frame-node";
import { NextRequest } from "next/server";
import {
  deleteUserNotificationDetails,
  setUserNotificationDetails,
} from "@/lib/kv";
import { sendFrameNotification } from "@/lib/notifs";

export async function POST(request: NextRequest) {
  console.log("📥 Received webhook request");
  const requestJson = await request.json();
  console.log("🔍 Request JSON:", JSON.stringify(requestJson, null, 2));

  let data;
  try {
    console.log("🔐 Verifying webhook event with Neynar");
    data = await parseWebhookEvent(requestJson, verifyAppKeyWithNeynar);

    console.log("✅ Verified webhook data:", JSON.stringify(data, null, 2));
  } catch (e: unknown) {
    const error = e as ParseWebhookEvent.ErrorType;

    console.error("❌ Error verifying webhook:", error);

    switch (error.name) {
      case "VerifyJsonFarcasterSignature.InvalidDataError":
      case "VerifyJsonFarcasterSignature.InvalidEventDataError":
        // The request data is invalid
        return Response.json(
          { success: false, error: error.message },
          { status: 400 }
        );
      case "VerifyJsonFarcasterSignature.InvalidAppKeyError":
        // The app key is invalid
        return Response.json(
          { success: false, error: error.message },
          { status: 401 }
        );
      case "VerifyJsonFarcasterSignature.VerifyAppKeyError":
        // Internal error verifying the app key (caller may want to try again)
        return Response.json(
          { success: false, error: error.message },
          { status: 500 }
        );
    }
  }

  const fid = data.fid;
  const event = data.event;
  console.log(`📊 Processing event '${event.event}' for FID ${fid}`);

  switch (event.event) {
    case "frame_added":
      if (event.notificationDetails) {
        console.log("💾 Storing notification details:", event.notificationDetails);
        try {
          await setUserNotificationDetails(fid, event.notificationDetails);
          console.log("💾 Successfully stored notification details");
          
          console.log("📬 Sending welcome notification");
          const result = await sendFrameNotification({
            fid,
            title: "Welcome to $QR",
            body: "Bid for the QR to point to your site next!",
          });
          console.log("📬 Welcome notification result:", result);
        } catch (error) {
          console.error("❌ Error handling frame_added event:", error);
        }
      } else {
        console.log("🚫 No notification details, deleting any existing ones");
        await deleteUserNotificationDetails(fid);
      }

      break;
    case "frame_removed":
      console.log("🗑️ User removed frame, deleting notification details");
      await deleteUserNotificationDetails(fid);
      break;
    case "notifications_enabled":
      console.log("🔔 Notifications enabled, storing details:", event.notificationDetails);
      try {
        await setUserNotificationDetails(fid, event.notificationDetails);
        console.log("🔔 Successfully stored notification details for enabled notifications");
        
        console.log("📬 Sending notification enabled confirmation");
        const result = await sendFrameNotification({
          fid,
          title: "Notifications Enabled",
          body: "You'll get updates about auctions and bids",
        });
        console.log("📬 Notification enabled confirmation result:", result);
      } catch (error) {
        console.error("❌ Error handling notifications_enabled event:", error);
      }
      break;
    case "notifications_disabled":
      console.log("🔕 Notifications disabled, deleting details");
      await deleteUserNotificationDetails(fid);
      break;
  }

  console.log("✅ Webhook processing complete");
  return Response.json({ success: true });
}
