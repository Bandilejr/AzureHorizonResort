import * as functions from "firebase-functions";
import * as admin from "firebase-admin";
import * as crypto from "crypto";

const db = admin.firestore();
const INVITATION_SIGNING_KEY = process.env.INVITATION_SIGNING_KEY || "";

/**
 * Validates an attendee QR code at event check-in.
 * Called by staff scanner app.
 */
export const validateAttendeeQR = functions.region("europe-west1").https.onCall(async (data, context) => {
  // Staff must be authenticated
  if (!context.auth?.token?.email) {
    throw new functions.https.HttpsError("unauthenticated", "Staff must be authenticated");
  }

  // Verify staff role
  const staffRef = db.collection("users").doc(context.auth.token.email);
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

  const { invitationId, eventId, inviteeEmail, sig } = payload;

  if (!invitationId || !eventId || !inviteeEmail || !sig) {
    throw new functions.https.HttpsError("invalid-argument", "Invalid QR payload structure");
  }

  // Verify signature
  const payloadForVerification = { ...payload };
  delete payloadForVerification.sig;

  const expectedSig = crypto
    .createHmac("sha256", INVITATION_SIGNING_KEY)
    .update(JSON.stringify(payloadForVerification))
    .digest("hex");

  if (sig !== expectedSig) {
    throw new functions.https.HttpsError("permission-denied", "Invalid QR signature");
  }

  // Verify invitation exists and matches
  const invitationRef = db.collection("event_invitations").doc(invitationId);
  const invitationSnap = await invitationRef.get();

  if (!invitationSnap.exists) {
    throw new functions.https.HttpsError("not-found", "Invitation not found");
  }

  const invitationData = invitationSnap.data()!;

  if (invitationData.eventId !== eventId) {
    throw new functions.https.HttpsError("permission-denied", "QR code for different event");
  }

  if (invitationData.inviteeEmail !== inviteeEmail) {
    throw new functions.https.HttpsError("permission-denied", "QR code mismatch");
  }

  if (invitationData.status === "checked_in") {
    return {
      valid: false,
      reason: "already_checked_in",
      message: "Attendee already checked in",
      attendee: invitationData,
    };
  }

  if (invitationData.status === "declined") {
    return {
      valid: false,
      reason: "declined",
      message: "Invitation was declined",
      attendee: invitationData,
    };
  }

  // Check event is active
  const eventRef = db.collection("event_bookings").doc(eventId);
  const eventSnap = await eventRef.get();

  if (!eventSnap.exists) {
    throw new functions.https.HttpsError("not-found", "Event not found");
  }

  const eventData = eventSnap.data()!;
  const eventDate = new Date(eventData.eventDate);
  const now = new Date();
  const dayDiff = Math.floor((eventDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

  if (dayDiff < 0) {
    return {
      valid: false,
      reason: "event_ended",
      message: "Event has already ended",
      attendee: invitationData,
    };
  }

  // Check in attendee
  await invitationRef.update({
    status: "checked_in",
    checkedInAt: admin.firestore.FieldValue.serverTimestamp(),
    checkedInBy: context.auth.uid,
  });

  // Log check-in
  await db.collection("attendee_checkins").add({
    eventId,
    invitationId,
    attendeeId: invitationId, // Using invitationId as attendeeId
    inviteeEmail,
    inviteeName: invitationData.inviteeName,
    checkedInAt: admin.firestore.FieldValue.serverTimestamp(),
    checkedInBy: context.auth.uid,
    method: "qr_scan",
  });

  return {
    valid: true,
    message: "Check-in successful",
    attendee: {
      ...invitationData,
      invitationId,
    },
  };
});