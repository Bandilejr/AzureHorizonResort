import * as functions from "firebase-functions";
import * as admin from "firebase-admin";

const db = admin.firestore();

/**
 * Saves the guest's catering order for a booking.
 *
 * Prices are recomputed on the server from the CURRENT `catering_packages`
 * documents (never from the client), so guests cannot tamper with totals.
 */
export const saveEventCatering = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError("unauthenticated", "User must be authenticated");
  }

  const { bookingId, guestCount, packageIds, dietaryNotes } = data || {};
  if (!bookingId || !Array.isArray(packageIds) || typeof guestCount !== "number") {
    throw new functions.https.HttpsError("invalid-argument", "bookingId, guestCount and packageIds are required");
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

  // Load fresh catalog rows
  const items: any[] = [];
  for (const pid of packageIds) {
    const snap = await db.collection("catering_packages").doc(String(pid)).get();
    if (!snap.exists) continue;
    const pkg = snap.data()!;
    if (pkg.active === false) continue;
    const chargedPeople = Math.max(guestCount, Number(pkg.minPeople) || 0);
    items.push({
      packageId: String(pid),
      name: pkg.name,
      pricePerPerson: Number(pkg.pricePerPerson) || 0,
      minPeople: Number(pkg.minPeople) || 0,
      guests: chargedPeople,
      subtotal: chargedPeople * (Number(pkg.pricePerPerson) || 0),
    });
  }

  const totalAmount = items.reduce((sum, it) => sum + it.subtotal, 0);

  // Upsert: keep ONE catering order per booking so re-saves replace the
  // previous order instead of adding duplicates that would double-charge
  // the guest on the folio.
  const existingSnap = await db
    .collection("event_caterings")
    .where("bookingId", "==", bookingId)
    .get();
  const existing = existingSnap.docs
    .filter((d) => (d.data().status || "draft") !== "cancelled")
    .sort((a, b) => {
      const time = (d: any) => {
        const t = d.data().updatedAt || d.data().createdAt;
        return t && typeof t.toMillis === "function" ? t.toMillis() : 0;
      };
      return time(a) - time(b);
    });
  const latest = existing.length ? existing[existing.length - 1] : null;

  // Saving an empty selection removes the catering order from the booking.
  if (items.length === 0) {
    if (latest) await latest.ref.delete();
    return { id: latest ? latest.id : bookingId, totalAmount: 0, items: 0 };
  }

  const docRef = latest ? latest.ref : db.collection("event_caterings").doc();
  const payload: any = {
    bookingId,
    eventId: booking.eventId || bookingId,
    guestId: context.auth.uid,
    guestCount,
    dietaryNotes: typeof dietaryNotes === "string" ? dietaryNotes : "",
    items,
    totalAmount,
    status: "draft",
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  };
  if (!latest) {
    payload.createdAt = admin.firestore.FieldValue.serverTimestamp();
  }
  await docRef.set(payload, { merge: true });

  return { id: docRef.id, totalAmount, items: items.length };
});