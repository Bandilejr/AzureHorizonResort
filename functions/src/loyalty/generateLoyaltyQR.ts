import * as functions from "firebase-functions";
import * as admin from "firebase-admin";
import * as crypto from "crypto";

const db = admin.firestore();
const LOYALTY_HMAC_SECRET = process.env.LOYALTY_HMAC_SECRET || "";

/**
 * Generates a rotating HMAC-signed loyalty QR payload.
 * Called by guest app every 30 seconds for display.
 */
export const generateLoyaltyQR = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError("unauthenticated", "User must be authenticated");
  }

  // Get current user profile
  const userRef = db.collection("users").doc(context.auth.uid);
  const userSnap = await userRef.get();

  if (!userSnap.exists) {
    throw new functions.https.HttpsError("not-found", "User profile not found");
  }

  const userData = userSnap.data()!;
  const points = userData.loyaltyPoints || 0;
  const tier = userData.loyaltyTier || "bronze";

  // Generate payload with timestamp and nonce
  const timestamp = Math.floor(Date.now() / 1000);
  const nonce = crypto.randomBytes(16).toString("hex");

  const payload = {
    guestId: context.auth.uid,
    points,
    tier,
    ts: timestamp,
    nonce,
  };

  // Sign with HMAC
  const signature = crypto
    .createHmac("sha256", LOYALTY_HMAC_SECRET)
    .update(JSON.stringify(payload))
    .digest("hex");

  return {
    qrPayload: {
      ...payload,
      sig: signature,
    },
    // Client should rotate every 30 seconds
    rotateInterval: 30000,
  };
});