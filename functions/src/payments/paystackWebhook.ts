import * as functions from "firebase-functions";
import * as admin from "firebase-admin";
import * as crypto from "crypto";

const db = admin.firestore();

const PAYSTACK_SECRET_KEY = process.env.PAYSTACK_SECRET_KEY || "";

/**
 * Paystack webhook - authoritatively confirms payments server-side.
 * Should be configured in Paystack Dashboard → Settings → Webhooks → URL.
 * Signature-verified with the secret key + Paystack's HMAC scheme.
 */
export const paystackWebhook = functions.https.onRequest(async (req, res) => {
  const signature = (req.headers["x-paystack-signature"] as string) || "";

  // Raw body required to reproduce the exact HMAC payload.
  const bodyRaw = typeof req.body === "string" ? req.body : JSON.stringify(req.body || {});

  if (!PAYSTACK_SECRET_KEY) {
    res.status(500).send("Webhook not configured (PAYSTACK_SECRET_KEY missing)");
    return;
  }

  const expected = crypto
    .createHmac("sha512", PAYSTACK_SECRET_KEY)
    .update(bodyRaw)
    .digest("hex");

  if (!signature || signature !== expected) {
    res.status(401).send("Invalid signature");
    return;
  }

  let event: any;
  try {
    event = typeof req.body === "object" ? req.body : JSON.parse(bodyRaw);
  } catch {
    res.status(400).send("Invalid payload");
    return;
  }

  if (event.event === "charge.success" && event.data?.reference) {
    const reference = event.data.reference;
    const paymentRef = db.collection("payments").doc(reference);
    const paymentSnap = await paymentRef.get();

    if (paymentSnap.exists) {
      const payment = paymentSnap.data()!;
      if (payment.status !== "paid") {
        await paymentRef.update({
          status: "paid",
          webhookConfirmedAt: admin.firestore.FieldValue.serverTimestamp(),
          channel: event.data.channel || "",
          currency: event.data.currency || "ZAR",
        });

        const newStatus = payment.payMode === "full" ? "confirmed" : "deposit_paid";
        await db.collection("event_bookings").doc(payment.bookingId).update({
          status: newStatus,
          paymentReference: reference,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });

        await db.collection("transactions").add({
          bookingId: payment.bookingId,
          guestId: payment.guestId,
          reference,
          amountCents: Number(event.data.amount) || 0,
          currency: event.data.currency || "ZAR",
          channel: event.data.channel || "",
          type: "booking_payment",
          payMode: payment.payMode,
          status: "completed",
          source: "webhook",
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
        });

        await db.collection("notifications").add({
          userId: payment.guestId,
          type: "payment_success",
          title: "Payment received",
          message: `Payment for booking ${payment.bookingId} was confirmed.`,
          referenceId: payment.bookingId,
          read: false,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
        });
      }
    }
  }

  res.status(200).send("OK");
});