import * as functions from "firebase-functions";
import * as admin from "firebase-admin";

const db = admin.firestore();

const PAYSTACK_SECRET_KEY = process.env.PAYSTACK_SECRET_KEY || "";
const PAYSTACK_BASE_URL = "https://api.paystack.co";

async function awardLoyaltyPointsForBooking(guestId: string, bookingId: string, totalAmount: number) {
  const ledgerRef = db.collection("loyalty_award_ledger").doc(bookingId);
  const ledgerSnap = await ledgerRef.get();
  if (ledgerSnap.exists) return; // idempotent: points already awarded for this booking

  const points = Math.floor(totalAmount / 100); // 1 pt per R100 spent
  if (points <= 0) return;

  if (guestId) {
    await db.collection("users").doc(guestId).set(
      { loyaltyPoints: admin.firestore.FieldValue.increment(points) },
      { merge: true }
    );
    await db.collection("loyalty_logs").add({
      guestId,
      points,
      reason: `Points earned from event booking ${bookingId}`,
      bookingId,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });
  }

  await ledgerRef.set({
    bookingId,
    guestId,
    points,
    awardedAt: admin.firestore.FieldValue.serverTimestamp(),
  });
}

/**
 * Verifies a Paystack transaction and - only when Paystack reports success -
 * confirms the booking and awards loyalty points.
 */
export const verifyPayment = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError("unauthenticated", "User must be authenticated");
  }

  if (!PAYSTACK_SECRET_KEY) {
    throw new functions.https.HttpsError(
      "unavailable",
      "Payment provider is not configured on the server (PAYSTACK_SECRET_KEY missing)"
    );
  }

  const { reference } = data || {};
  if (!reference) {
    throw new functions.https.HttpsError("invalid-argument", "payment reference is required");
  }

  const paymentRef = db.collection("payments").doc(reference);
  const paymentSnap = await paymentRef.get();
  if (!paymentSnap.exists) {
    throw new functions.https.HttpsError("not-found", "Payment record not found");
  }
  const payment = paymentSnap.data()!;
  if (payment.guestId !== context.auth.uid) {
    throw new functions.https.HttpsError("permission-denied", "Payment does not belong to user");
  }

  if (payment.status === "paid") {
    return { status: "paid", already: true, payMode: payment.payMode };
  }

  const verifyRes = await fetch(
    `${PAYSTACK_BASE_URL}/transaction/verify/${encodeURIComponent(reference)}`,
    {
      headers: { Authorization: `Bearer ${PAYSTACK_SECRET_KEY}` },
    }
  );
  const verifyBody: any = await verifyRes.json();
  if (!verifyRes.ok || !verifyBody.status) {
    console.error("Paystack verify failed:", verifyRes.status, JSON.stringify(verifyBody));
    throw new functions.https.HttpsError("internal", "Could not verify payment with provider");
  }

  const tx = verifyBody.data;
  if (!tx || tx.status !== "success") {
    return { status: "unpaid", paystackStatus: tx?.status, message: "Payment not confirmed yet" };
  }

  const paidAmountCents = Number(tx.amount) || 0;
  await paymentRef.update({
    status: "paid",
    paystackPaidAt: tx.paid_at || admin.firestore.FieldValue.serverTimestamp(),
    currency: tx.currency,
    channel: tx.channel || "",
    paidAmountCents: paidAmountCents,
    verifiedAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  const bookingRef = db.collection("event_bookings").doc(payment.bookingId);
  const bookingSnap = await bookingRef.get();
  const booking = bookingSnap.data();

  const newStatus = payment.payMode === "full" ? "confirmed" : "deposit_paid";
  await bookingRef.update({
    status: newStatus,
    paymentReference: reference,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  await db.collection("transactions").add({
    bookingId: payment.bookingId,
    guestId: payment.guestId,
    reference,
    amountCents: paidAmountCents,
    currency: tx.currency || "ZAR",
    channel: tx.channel || "",
    type: "booking_payment",
    payMode: payment.payMode,
    status: "completed",
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  await db.collection("notifications").add({
    userId: payment.guestId,
    type: "payment_success",
    title: "Payment received",
    message:
      newStatus === "confirmed"
        ? `Your event booking ${payment.bookingId} is fully confirmed.`
        : `Your deposit for event booking ${payment.bookingId} was received.`,
    referenceId: payment.bookingId,
    read: false,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  await awardLoyaltyPointsForBooking(
    payment.guestId,
    payment.bookingId,
    paidAmountCents > 0 ? paidAmountCents / 100 : Number(booking?.totalAmount || 0)
  );

  return { status: "paid", bookingStatus: newStatus, payMode: payment.payMode };
});