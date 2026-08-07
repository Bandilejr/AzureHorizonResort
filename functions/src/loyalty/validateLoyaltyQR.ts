import * as functions from "firebase-functions";
import * as admin from "firebase-admin";
import * as crypto from "crypto";

const db = admin.firestore();
const LOYALTY_HMAC_SECRET = process.env.LOYALTY_HMAC_SECRET || "";

/**
 * Validates a loyalty QR code scanned by staff.
 * Returns current loyalty profile if valid.
 */
export const validateLoyaltyQR = functions.https.onCall(async (data, context) => {
  // Staff must be authenticated
  if (!context.auth) {
    throw new functions.https.HttpsError("unauthenticated", "Staff must be authenticated");
  }

  // Verify staff role
  const staffRef = db.collection("users").doc(context.auth.uid);
  const staffSnap = await staffRef.get();

  if (!staffSnap.exists) {
    throw new functions.https.HttpsError("not-found", "Staff profile not found");
  }

  const staffData = staffSnap.data()!;
  const allowedRoles = ["event_manager", "front_desk", "admin"];
  if (!allowedRoles.includes(staffData.subRole) && staffData.role !== "admin") {
    throw new functions.https.HttpsError("permission-denied", "Insufficient permissions");
  }

  const { qrPayload } = data;

  if (!qrPayload) {
    throw new functions.https.HttpsError("invalid-argument", "QR payload required");
  }

  let payload: any;
  try {
    payload = typeof qrPayload === "string" ? JSON.parse(qrPayload) : qrPayload;
  } catch {
    throw new functions.https.HttpsError("invalid-argument", "Invalid QR format");
  }

  const { guestId, points, tier, ts, nonce, sig } = payload;

  if (!guestId || !sig) {
    throw new functions.https.HttpsError("invalid-argument", "Invalid QR payload structure");
  }

  // Verify timestamp is recent (within 60 seconds for rotation tolerance)
  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - ts) > 60) {
    return {
      valid: false,
      reason: "expired",
      message: "QR code has expired, please refresh",
    };
  }

  // Verify signature
  const payloadForVerification = { ...payload };
  delete payloadForVerification.sig;

  const expectedSig = crypto
    .createHmac("sha256", LOYALTY_HMAC_SECRET)
    .update(JSON.stringify(payloadForVerification))
    .digest("hex");

  if (sig !== expectedSig) {
    return {
      valid: false,
      reason: "invalid_signature",
      message: "Invalid QR code signature",
    };
  }

  // Get current user profile from Firestore (source of truth)
  const userRef = db.collection("users").doc(guestId);
  const userSnap = await userRef.get();

  if (!userSnap.exists) {
    return {
      valid: false,
      reason: "user_not_found",
      message: "Guest profile not found",
    };
  }

  const userData = userSnap.data()!;

  // Return current loyalty info (not from QR which could be stale)
  return {
    valid: true,
    guest: {
      id: guestId,
      name: userData.displayName || "Guest",
      email: userData.email,
      loyaltyPoints: userData.loyaltyPoints || 0,
      loyaltyTier: userData.loyaltyTier || "bronze",
      photoURL: userData.photoURL || "",
      roomNumber: userData.roomNumber || "N/A",
      status: userData.status || "guest",
    },
    scannedAt: admin.firestore.FieldValue.serverTimestamp(),
  };
});