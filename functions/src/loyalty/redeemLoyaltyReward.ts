import * as functions from "firebase-functions";
import * as admin from "firebase-admin";
import * as crypto from "crypto";

const db = admin.firestore();

/**
 * Server-side loyalty reward redemption.
 *
 * Points are deducted by the server in a transaction so the guest can never
 * rewrite their own balance; the voucher code is also generated server-side.
 * Returns the voucher for the client to display.
 */
export const redeemLoyaltyReward = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError("unauthenticated", "User must be authenticated");
  }

  const { rewardTitle, pts, guestId } = data || {};

  const title = String(rewardTitle || "Reward");
  const cost = Number(pts);
  if (!cost || cost <= 0) {
    throw new functions.https.HttpsError("invalid-argument", "Reward points required");
  }

  const targetId = guestId || context.auth.uid;
  if (targetId !== context.auth.uid) {
    throw new functions.https.HttpsError("permission-denied", "Cannot redeem for another user");
  }

  const userRef = db.collection("users").doc(targetId);
  await db.runTransaction(async (tx) => {
    const userSnap = await tx.get(userRef);
    if (!userSnap.exists) {
      throw new functions.https.HttpsError("not-found", "User profile not found");
    }
    const userData = userSnap.data()!;
    const current = userData.loyaltyPoints || 0;
    if (current < cost) {
      throw new functions.https.HttpsError("failed-precondition", "Not enough loyalty points");
    }
    tx.update(userRef, { loyaltyPoints: current - cost });
  });

  const code = `AZR-${crypto.randomBytes(4).toString("hex").toUpperCase()}`;
  const voucherRef = await db.collection("loyalty_vouchers").add({
    guestId: targetId,
    code,
    rewardTitle: title,
    points: cost,
    status: "active",
    redeemedAt: admin.firestore.FieldValue.serverTimestamp(),
    expiresAt: admin.firestore.Timestamp.fromDate(
      new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
    ),
  });

  await db.collection("loyalty_logs").add({
    guestId: targetId,
    points: -cost,
    reason: `Redeemed: ${title}`,
    voucherId: voucherRef.id,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  return { voucherId: voucherRef.id, code, rewardTitle: title, points: -cost };
});