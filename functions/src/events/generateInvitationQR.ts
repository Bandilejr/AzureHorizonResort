import * as functions from "firebase-functions";
import * as admin from "firebase-admin";
import * as crypto from "crypto";

const db = admin.firestore();
const INVITATION_SIGNING_KEY = process.env.INVITATION_SIGNING_KEY || "";

/**
 * Generates a signed QR code payload for event invitation.
 * Called when guest sends invitations.
 */
export const generateInvitationQR = functions.region("europe-west1").https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError("unauthenticated", "User must be authenticated");
  }

  const { eventId, inviteeEmail, inviteeName } = data;

  if (!eventId || !inviteeEmail) {
    throw new functions.https.HttpsError("invalid-argument", "Missing required fields");
  }

  // Verify event exists and user is host
  const eventRef = db.collection("event_bookings").doc(eventId);
  const eventSnap = await eventRef.get();

  if (!eventSnap.exists) {
    throw new functions.https.HttpsError("not-found", "Event not found");
  }

  const eventData = eventSnap.data()!;
  if (eventData.guestId !== context.auth.uid) {
    throw new functions.https.HttpsError("permission-denied", "Not authorized for this event");
  }

  // Create invitation document
  const invitationRef = db.collection("event_invitations").doc();
  const invitationId = invitationRef.id;

  const payload = {
    invitationId,
    eventId,
    inviteeEmail: inviteeEmail.toLowerCase().trim(),
    inviteeName,
    hostId: context.auth.uid,
    status: "pending",
    issuedAt: Date.now(),
  };

  // Sign payload
  const signature = crypto
    .createHmac("sha256", INVITATION_SIGNING_KEY)
    .update(JSON.stringify(payload))
    .digest("hex");

  const qrPayload = {
    ...payload,
    sig: signature,
  };

  // Save invitation
  await invitationRef.set({
    ...payload,
    signature,
    qrCode: JSON.stringify(qrPayload),
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  return {
    invitationId,
    qrCode: JSON.stringify(qrPayload),
    inviteeEmail,
    inviteeName,
  };
});