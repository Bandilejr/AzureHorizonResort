import * as functions from "firebase-functions";
import * as admin from "firebase-admin";

const db = admin.firestore();

/**
 * Processes a refund request after validation.
 * Called by admin/financial admin after reviewing claim.
 */
export const processRefund = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError("unauthenticated", "User must be authenticated");
  }

  // Verify user is admin or event_manager
  const userRef = db.collection("users").doc(context.auth.uid);
  const userSnap = await userRef.get();

  if (!userSnap.exists) {
    throw new functions.https.HttpsError("not-found", "User profile not found");
  }

  const userData = userSnap.data()!;
  if (userData.role !== "admin" && userData.subRole !== "event_manager") {
    throw new functions.https.HttpsError("permission-denied", "Insufficient permissions");
  }

  const { refundRequestId, action, rejectionReason } = data; // action: "approve" | "reject"

  if (!refundRequestId || !action) {
    throw new functions.https.HttpsError("invalid-argument", "Missing required fields");
  }

  if (!["approve", "reject"].includes(action)) {
    throw new functions.https.HttpsError("invalid-argument", "Action must be approve or reject");
  }

  // Get refund request
  const refundRef = db.collection("refund_requests").doc(refundRequestId);
  const refundSnap = await refundRef.get();

  if (!refundSnap.exists) {
    throw new functions.https.HttpsError("not-found", "Refund request not found");
  }

  const refundData = refundSnap.data()!;

  if (refundData.status !== "pending") {
    throw new functions.https.HttpsError("failed-precondition", "Refund already processed");
  }

  // Verify event exists
  const eventRef = db.collection("event_bookings").doc(refundData.eventId);
  const eventSnap = await eventRef.get();

  if (!eventSnap.exists) {
    throw new functions.https.HttpsError("not-found", "Event not found");
  }

  if (action === "approve") {
    // TODO: Integrate with payment gateway (Paystack) for actual refund
    // For now, simulate refund processing
    const refundAmount = refundData.requestedAmount;

    // Update refund request
    await refundRef.update({
      status: "approved",
      approvedBy: context.auth.uid,
      approvedAt: admin.firestore.FieldValue.serverTimestamp(),
      refundAmount,
    });

    // Create refund transaction record
    await db.collection("refund_transactions").add({
      refundRequestId,
      eventId: refundData.eventId,
      guestId: refundData.guestId,
      amount: refundAmount,
      reason: refundData.reason,
      processedBy: context.auth.uid,
      status: "completed",
      // paymentGatewayRef: "...", // Would come from Paystack
      processedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    // Notify guest
    await db.collection("notifications").add({
      userId: refundData.guestId,
      type: "refund_approved",
      title: "Refund Approved",
      message: `Your refund of R${refundAmount.toLocaleString()} has been approved and will be processed.`,
      referenceId: refundRequestId,
      read: false,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    return {
      success: true,
      status: "approved",
      refundAmount,
    };
  } else {
    // Reject refund
    await refundRef.update({
      status: "rejected",
      rejectedBy: context.auth.uid,
      rejectedAt: admin.firestore.FieldValue.serverTimestamp(),
      rejectionReason: rejectionReason || "No reason provided",
    });

    // Notify guest
    await db.collection("notifications").add({
      userId: refundData.guestId,
      type: "refund_rejected",
      title: "Refund Request Declined",
      message: `Your refund request has been declined. Reason: ${rejectionReason || "Not specified"}`,
      referenceId: refundRequestId,
      read: false,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    return {
      success: true,
      status: "rejected",
    };
  }
});