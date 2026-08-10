import * as functions from "firebase-functions";
import * as admin from "firebase-admin";

const db = admin.firestore();

const DEFAULT_GEOFENCE: { lat: number; lng: number; radiusM: number } = {
  lat: 25.2048,
  lng: 55.2708,
  radiusM: 400,
};

const ATTENDANCE_RADIUS_METERS = 400;

function toRadians(deg: number): number {
  return (deg * Math.PI) / 180;
}

function haversineMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000;
  const dLat = toRadians(lat2 - lat1);
  const dLng = toRadians(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * Records an attendance punch for the authenticated STAFF member.
 *
 * The distance in/out check is computed SERVER-side against the geofence
 * centre stored in `settings/attendance_geofence` - the client cannot
 * spoof `withinRadius` because that field is determined here.
 *
 * Business rule (decision B): off-site punches are NOT hard-rejected -
 * they are recorded and flagged `withinRadius: false` so management can
 * audit exceptions.
 */
export const recordAttendancePunch = functions.region("europe-west1").https.onCall(async (data, context) => {
  if (!context.auth?.token?.email) {
    throw new functions.https.HttpsError("unauthenticated", "User must be authenticated");
  }

  const { punchType, lat, lng, accuracyM, staffName } = data || {};

  if (!["in", "out"].includes(punchType)) {
    throw new functions.https.HttpsError("invalid-argument", "punchType must be 'in' or 'out'");
  }
  if (typeof lat !== "number" || typeof lng !== "number") {
    throw new functions.https.HttpsError("invalid-argument", "Invalid coordinates");
  }

  // Staff role enforcement (server-side, not trustable via client)
  const userRef = db.collection("users").doc(context.auth.token.email);
  const userSnap = await userRef.get();
  if (!userSnap.exists) {
    throw new functions.https.HttpsError("not-found", "User profile not found");
  }
  const userData = userSnap.data()!;
  if (userData.role !== "staff") {
    throw new functions.https.HttpsError("permission-denied", "Only staff members can clock in/out");
  }

  // Geofence centre from the settings collection (server as source of truth)
  const settingsRef = db.collection("settings").doc("attendance_geofence");
  const settingsSnap = await settingsRef.get();
  let geofence = DEFAULT_GEOFENCE;
  if (settingsSnap.exists) {
    const s = settingsSnap.data()!;
    if (typeof s.lat === "number" && typeof s.lng === "number") {
      geofence = { lat: s.lat, lng: s.lng, radiusM: Number(s.radiusM) || ATTENDANCE_RADIUS_METERS };
    }
  }

  const distanceM = Math.round(
    haversineMeters(lat, lng, geofence.lat, geofence.lng)
  );
  const withinRadius = distanceM <= geofence.radiusM;

  // Open/close pairing: prevent double punch-in or punch-out without a match
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todaysQuery = await db
    .collection("punch_records")
    .where("staffUid", "==", context.auth.uid)
    .where("timestamp", ">=", today)
    .orderBy("timestamp", "desc")
    .limit(1)
    .get();

  const last = todaysQuery.docs[0]?.data();
  if (last) {
    if (punchType === "in" && last.punchType === "in") {
      throw new functions.https.HttpsError("failed-precondition", "Already clocked in");
    }
    if (punchType === "out" && last.punchType !== "in") {
      throw new functions.https.HttpsError("failed-precondition", "Clock in before clocking out");
    }
  } else if (punchType === "out") {
    throw new functions.https.HttpsError("failed-precondition", "Clock in before clocking out");
  }

  const docRef = await db.collection("punch_records").add({
    punchType,
    staffUid: context.auth.uid,
    staffName: staffName || userData.displayName || context.auth.uid,
    lat,
    lng,
    accuracyM: typeof accuracyM === "number" ? accuracyM : null,
    distanceM,
    withinRadius,
    source: "staff_mobile",
    timestamp: admin.firestore.FieldValue.serverTimestamp(),
    isoTime: new Date().toISOString(),
  });

  return {
    id: docRef.id,
    punchType,
    distanceM,
    withinRadius,
    source: "server",
    at: new Date().toISOString(),
  };
});