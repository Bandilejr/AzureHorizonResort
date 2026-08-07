import * as functions from "firebase-functions";
import * as admin from "firebase-admin";
import * as jwt from "jsonwebtoken";

const db = admin.firestore();
const JWT_PRIVATE_KEY = process.env.JWT_PRIVATE_KEY || "";

/**
 * Generates a signed JWT credential for NFC room key access.
 * Callable from client after successful check-in.
 */
export const generateRoomCredential = functions.https.onCall(async (data, context) => {
  // Verify user is authenticated
  if (!context.auth) {
    throw new functions.https.HttpsError("unauthenticated", "User must be authenticated");
  }

  const { roomId, checkInDate, checkOutDate, bookingId } = data;

  if (!roomId || !checkInDate || !checkOutDate || !bookingId) {
    throw new functions.https.HttpsError("invalid-argument", "Missing required fields");
  }

  // Verify booking belongs to user
  const bookingRef = db.collection("event_bookings").doc(bookingId);
  const bookingSnap = await bookingRef.get();

  if (!bookingSnap.exists) {
    throw new functions.https.HttpsError("not-found", "Booking not found");
  }

  const bookingData = bookingSnap.data()!;
  if (bookingData.guestId !== context.auth.uid) {
    throw new functions.https.HttpsError("permission-denied", "Booking does not belong to user");
  }

  // Verify booking is paid/confirmed
  if (bookingData.status !== "confirmed" && bookingData.status !== "deposit_paid") {
    throw new functions.https.HttpsError("failed-precondition", "Booking not confirmed");
  }

  // Create JWT payload
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    sub: context.auth.uid,
    roomId,
    bookingId,
    iat: now,
    exp: now + 86400, // 24 hours
    type: "room_key",
    checkIn: checkInDate,
    checkOut: checkOutDate,
  };

  // Sign with RS256
  const token = jwt.sign(payload, JWT_PRIVATE_KEY, { algorithm: "RS256" });

  // Store credential reference for revocation
  await db.collection("room_credentials").doc(bookingId).set({
    guestId: context.auth.uid,
    roomId,
    bookingId,
    tokenHash: crypto.createHash("sha256").update(token).digest("hex"),
    issuedAt: admin.firestore.FieldValue.serverTimestamp(),
    expiresAt: admin.firestore.Timestamp.fromDate(new Date((now + 86400) * 1000)),
    revoked: false,
  });

  return { credential: token, expiresIn: 86400 };
});

// Import crypto for token hashing
import * as crypto from "crypto";