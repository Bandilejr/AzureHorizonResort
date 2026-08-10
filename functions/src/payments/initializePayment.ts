import * as functions from "firebase-functions";
import * as admin from "firebase-admin";

const db = admin.firestore();

const PAYSTACK_SECRET_KEY = process.env.PAYSTACK_SECRET_KEY || "";
const PAYSTACK_BASE_URL = "https://api.paystack.co";

/**
 * Initializes a Paystack transaction for an event booking deposit/full payment.
 *
 * Amount is always taken from the stored booking (never from the client) and
 * converted to the smallest currency unit (cents) for Paystack.
 */
export const initializePayment = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError("unauthenticated", "User must be authenticated");
  }

  if (!PAYSTACK_SECRET_KEY) {
    throw new functions.https.HttpsError(
      "unavailable",
      "Payment provider is not configured on the server (PAYSTACK_SECRET_KEY missing)"
    );
  }

  const { bookingId, payMode } = data || {};
  if (!bookingId || !["deposit", "full"].includes(payMode)) {
    throw new functions.https.HttpsError("invalid-argument", "bookingId and payMode (deposit|full) are required");
  }

  const bookingRef = db.collection("event_bookings").doc(bookingId);
  const bookingSnap = await bookingRef.get();
  if (!bookingSnap.exists) {
    throw new functions.https.HttpsError("not-found", "Booking not found");
  }
  const booking = bookingSnap.data()!;

  if (booking.guestId !== context.auth.uid) {
    throw new functions.https.HttpsError("permission-denied", "Booking does not belong to user");
  }

  // A confirmed booking is settled; a cash-on-arrival one is marked settled;
  // anything already fully paid cannot be initialised again.
  if (booking.status === "confirmed" || booking.status === "deposit_paid") {
    throw new functions.https.HttpsError("already-exists", "Booking is already paid");
  }

  const amountCents =
    payMode === "deposit"
      ? Math.round(Number(booking.depositRequired || 0) * 100)
      : Math.round(Number(booking.totalAmount || 0) * 100);

  if (!amountCents || amountCents <= 0) {
    throw new functions.https.HttpsError("invalid-argument", "Booking has no payable amount");
  }

  const reference = `AZR-${bookingId.slice(0, 8)}-${Date.now().toString(36).toUpperCase()}`;

  const guestSnap = await db.collection("users").where("uid", "==", context.auth.uid).limit(1).get();
  const guestData = guestSnap.docs[0]?.data();
  const email = booking.guestEmail || guestData?.email || context.auth.token.email || "";

  const response = await fetch(`${PAYSTACK_BASE_URL}/transaction/initialize`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${PAYSTACK_SECRET_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      email,
      amount: amountCents,
      reference,
      currency: "ZAR",
      metadata: { bookingId, payMode },
      callback_url: "azurehotel://payment-return",
    }),
  });

  const body: any = await response.json();
  if (!response.ok || !body.status || !body.data?.authorization_url) {
    console.error("Paystack initialize failed:", response.status, JSON.stringify(body));
    throw new functions.https.HttpsError("internal", "Payment provider could not initialise a transaction");
  }

  await db.collection("payments").doc(reference).set({
    bookingId,
    guestId: context.auth.uid,
    amountCents,
    payMode,
    status: "pending",
    paystackReference: body.data.reference,
    accessCode: body.data.access_code || "",
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  return {
    authorizationUrl: body.data.authorization_url,
    reference: body.data.reference,
    accessCode: body.data.access_code || "",
    amountCents,
  };
});