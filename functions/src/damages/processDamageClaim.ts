import * as functions from "firebase-functions";
import * as admin from "firebase-admin";

const db = admin.firestore();

/**
 * Processes a damage claim from post-event inspection.
 * Assigns maintenance technician, generates invoice, tracks resolution.
 */
export const processDamageClaim = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError("unauthenticated", "User must be authenticated");
  }

  // Verify user is event_manager or admin
  const userRef = db.collection("users").doc(context.auth.uid);
  const userSnap = await userRef.get();

  if (!userSnap.exists) {
    throw new functions.https.HttpsError("not-found", "User profile not found");
  }

  const userData = userSnap.data()!;
  if (userData.subRole !== "event_manager" && userData.role !== "admin") {
    throw new functions.https.HttpsError("permission-denied", "Only event managers can process damage claims");
  }

  const { inspectionId, damageItems, assignedTechnicianId } = data;

  if (!inspectionId || !damageItems || !Array.isArray(damageItems)) {
    throw new functions.https.HttpsError("invalid-argument", "Missing required fields");
  }

  // Get inspection
  const inspectionRef = db.collection("event_inspections").doc(inspectionId);
  const inspectionSnap = await inspectionRef.get();

  if (!inspectionSnap.exists) {
    throw new functions.https.HttpsError("not-found", "Inspection not found");
  }

  const inspectionData = inspectionSnap.data()!;
  const eventId = inspectionData.eventId;

  // Get event to find guest
  const eventRef = db.collection("event_bookings").doc(eventId);
  const eventSnap = await eventRef.get();

  if (!eventSnap.exists) {
    throw new functions.https.HttpsError("not-found", "Event not found");
  }

  const eventData = eventSnap.data()!;
  const guestId = eventData.guestId;

  // Calculate total damage cost
  const totalCost = damageItems.reduce((sum: number, item: any) => sum + (item.estimatedCost || 0), 0);

  // Create damage record
  const damageRef = await db.collection("damage_records").add({
    eventId,
    inspectionId,
    guestId,
    reportedBy: context.auth.uid,
    items: damageItems,
    totalCost,
    status: "recorded",
    assignedTechnicianId: assignedTechnicianId || null,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  // If technician assigned, create work order
  if (assignedTechnicianId) {
    await db.collection("maintenance_work_orders").add({
      damageRecordId: damageRef.id,
      technicianId: assignedTechnicianId,
      eventId,
      items: damageItems,
      status: "assigned",
      assignedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
  }

  // Generate invoice for guest
  const invoiceRef = await db.collection("invoices").add({
    guestId,
    eventId,
    damageRecordId: damageRef.id,
    type: "damage",
    amount: totalCost,
    status: "pending",
    items: damageItems,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    dueDate: admin.firestore.Timestamp.fromDate(new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)), // 7 days
  });

  // Notify guest (would trigger email via extension)
  await db.collection("notifications").add({
    userId: guestId,
    type: "damage_invoice",
    title: "Damage Invoice",
    message: `A damage invoice of R${totalCost.toLocaleString()} has been issued for your event.`,
    referenceId: invoiceRef.id,
    read: false,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  // Update inspection status
  await inspectionRef.update({
    damageRecorded: true,
    damageRecordId: damageRef.id,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  return {
    damageRecordId: damageRef.id,
    invoiceId: invoiceRef.id,
    totalCost,
    status: "recorded",
  };
});