import { initializeApp } from 'firebase/app';
import { 
  getFirestore, 
  doc, 
  getDoc, 
  collection, 
  addDoc, 
  onSnapshot,
  query,
  where,
  orderBy,
  limit,
  getDocs,
  updateDoc,
  deleteDoc,
  serverTimestamp,
  Timestamp,
  setDoc,
  runTransaction,
  increment
} from 'firebase/firestore';
import ReactNativeAsyncStorage from '@react-native-async-storage/async-storage';

// @ts-ignore - Bypassing TypeScript dictionary glitch for React Native persistence
import { initializeAuth, getReactNativePersistence, signInWithEmailAndPassword, signOut } from 'firebase/auth';

import { getStorage, ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { getDatabase, ref as rtdbRef, onValue, off } from 'firebase/database';
import { getFunctions } from 'firebase/functions';
import * as Crypto from 'expo-crypto';
import { RoomKeyPayload, buildRoomKeyUri } from './room-key-payload';

// Paste the ACTUAL string values from your web app's .env file here.
// Do not use import.meta.env!
const firebaseConfig = {
  apiKey: "AIzaSyBRt04Rm3Ry9nW_DlTm3TsR8bCzkPvxvSA",
  authDomain: "hotel-management-system-c3526.firebaseapp.com",
  databaseURL: "https://hotel-management-system-c3526-default-rtdb.europe-west1.firebasedatabase.app",
  projectId: "hotel-management-system-c3526",
  storageBucket: "hotel-management-system-c3526.firebasestorage.app",
  messagingSenderId: "7196606684",
  appId: "1:7196606684:web:66cb6e026807b517f17419",
  measurementId: "G-EB3RC1CJCB"
};

// Initialize the Firebase app
const app = initializeApp(firebaseConfig);

// Export Auth and Firestore so our components can use them
export const auth = initializeAuth(app, {
  persistence: getReactNativePersistence(ReactNativeAsyncStorage)
});
export const db = getFirestore(app);
export const rtdb = getDatabase(app);
export const functions = getFunctions(app, "europe-west1");
const storage = getStorage();

// Connect to emulators in development
if (__DEV__) {
  try {
    const { connectAuthEmulator } = require('firebase/auth');
    const { connectFirestoreEmulator } = require('firebase/firestore');
    const { connectFunctionsEmulator } = require('firebase/functions');
    const { connectDatabaseEmulator } = require('firebase/database');
    const { connectStorageEmulator } = require('firebase/storage');
    
    // Emulator runs on localhost for Android emulator, 10.0.2.2 for physical device
    // For iOS simulator use localhost
    const emulatorHost = '10.0.2.2'; // Android emulator
    
    connectAuthEmulator(auth, `http://${emulatorHost}:9099`, { disableWarnings: true });
    connectFirestoreEmulator(db, emulatorHost, 8080);
    connectFunctionsEmulator(functions, emulatorHost, 5001);
    connectDatabaseEmulator(rtdb, emulatorHost, 9000);
    connectStorageEmulator(storage, emulatorHost, 9199);
    
    console.log('🔧 Connected to Firebase Emulators');
  } catch (error) {
    console.warn('Could not connect to emulators:', error);
  }
}

// --- CLIENT-SIDE REPLACEMENTS FOR CLOUD FUNCTIONS ---
// The project runs on the free Spark plan where Cloud Functions cannot be
// deployed, so every "cloud function" flow is implemented here in the app.

const QR_SIGNING_SECRET = process.env.EXPO_PUBLIC_QR_SIGNING_SECRET || "azure-horizon-demo-signing-secret-2026";

async function hmacDigest(payload: any): Promise<string> {
  const digest = await Crypto.digestStringAsync(
    Crypto.CryptoDigestAlgorithm.SHA256,
    QR_SIGNING_SECRET + JSON.stringify(payload)
  );
  return digest;
}

async function requireAuthUser(): Promise<any> {
  const user = auth.currentUser;
  if (!user?.email) {
    throw new Error("User must be authenticated");
  }
  return user;
}

function haversineMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// --- ROOM CREDENTIALS (Digital Key) ---

/**
 * Issues a real room-key credential directly in Firestore (Spark-plan
 * compatible - no Cloud Function involved).
 *
 * The booking owner writes a `room_credentials/<bookingId>` document holding
 * the SHA-256 hash of a random 192-bit token, the room id and an expiry.
 * The token itself is ONLY returned to this device - it is what gets armed
 * onto the NFC HCE tag. A reader verifies by hashing the token it reads and
 * matching it against Firestore, so a captured tag cannot be replayed into
 * another room or after checkout. Firestore rules gate who may write.
 */
export const generateRoomCredential = async (args: {
  roomId: string;
  checkInDate: string;
  checkOutDate: string;
  bookingId: string;
}): Promise<{
  data: {
    credential: string;
    expiresIn: number;
    token: string;
    bookingId: string;
    roomId: string;
  };
}> => {
  const user = await requireAuthUser();
  const { roomId, bookingId } = args;

  const randomBytes = await Crypto.getRandomBytesAsync(24);
  const token = Array.from(randomBytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  const tokenHash = await Crypto.digestStringAsync(
    Crypto.CryptoDigestAlgorithm.SHA256,
    token
  );
  const expiresIn = 12 * 60 * 60; // 12 hours
  const expiresAt = Date.now() + expiresIn * 1000;

  const payload: RoomKeyPayload = {
    v: 1,
    b: bookingId,
    r: roomId,
    t: token,
    e: expiresAt,
  };
  const uri = buildRoomKeyUri(payload);

  await setDoc(
    doc(db, "room_credentials", bookingId),
    {
      guestId: user.uid,
      roomId,
      bookingId,
      tokenHash,
      issuedAt: serverTimestamp(),
      expiresAt,
      revoked: false,
    },
    { merge: true }
  );

  return {
    data: {
      credential: uri,
      expiresIn,
      token,
      bookingId,
      roomId,
    },
  };
};

// --- EVENT INVITATIONS (UC25) ---

export const generateInvitationQR = async (args: {
  eventId: string;
  inviteeEmail: string;
  inviteeName: string;
}): Promise<{ data: { invitationId: string; qrCode: string; inviteeEmail: string; inviteeName: string } }> => {
  const user = await requireAuthUser();
  const { eventId, inviteeEmail, inviteeName } = args;

  if (!eventId || !inviteeEmail) {
    throw new Error("Missing required fields");
  }

  const eventSnap = await getDoc(doc(db, "event_bookings", eventId));
  if (!eventSnap.exists()) {
    throw new Error("Event not found");
  }
  const eventData = eventSnap.data() as any;
  if (eventData.guestId !== user.uid) {
    throw new Error("Not authorized for this event");
  }

  const invitationRef = await addDoc(collection(db, "event_invitations"), {
    eventId,
    inviteeEmail: inviteeEmail.toLowerCase().trim(),
    inviteeName,
    hostId: user.uid,
    status: "pending",
    issuedAt: Date.now(),
    createdAt: serverTimestamp(),
  });

  const payload = {
    invitationId: invitationRef.id,
    eventId,
    inviteeEmail: inviteeEmail.toLowerCase().trim(),
    inviteeName,
    hostId: user.uid,
    status: "pending",
    issuedAt: Date.now(),
  };
  const sig = await hmacDigest(payload);
  const qrCode = JSON.stringify({ ...payload, sig });

  await updateDoc(invitationRef, { qrCode });

  return {
    data: {
      invitationId: invitationRef.id,
      qrCode,
      inviteeEmail: payload.inviteeEmail,
      inviteeName,
    },
  };
};

// --- ATTENDEE CHECK-IN (UC27) ---

export const validateAttendeeQR = async (args: {
  qrPayload: string;
}): Promise<{ data: { valid: boolean; message: string; reason?: string; attendee?: any } }> => {
  const user = await requireAuthUser();

  let payload: any;
  try {
    payload = typeof args.qrPayload === "string" ? JSON.parse(args.qrPayload) : args.qrPayload;
  } catch {
    return { data: { valid: false, message: "Invalid QR format" } };
  }

  const { invitationId, eventId, inviteeEmail, sig } = payload;
  if (!invitationId || !eventId || !inviteeEmail || !sig) {
    return { data: { valid: false, message: "Invalid QR payload structure" } };
  }

  const payloadForVerification: any = { ...payload };
  delete payloadForVerification.sig;
  const expectedSig = await hmacDigest(payloadForVerification);
  if (sig !== expectedSig) {
    return { data: { valid: false, reason: "invalid_signature", message: "Invalid QR signature" } };
  }

  const invitationSnap = await getDoc(doc(db, "event_invitations", invitationId));
  if (!invitationSnap.exists()) {
    return { data: { valid: false, message: "Invitation not found" } };
  }
  const invitationData = invitationSnap.data() as any;

  if (invitationData.eventId !== eventId || invitationData.inviteeEmail !== inviteeEmail) {
    return { data: { valid: false, message: "QR code mismatch" } };
  }

  if (invitationData.status === "checked_in") {
    return { data: { valid: false, reason: "already_checked_in", message: "Attendee already checked in", attendee: invitationData } };
  }
  if (invitationData.status === "declined") {
    return { data: { valid: false, reason: "declined", message: "Invitation was declined", attendee: invitationData } };
  }

  const eventSnap = await getDoc(doc(db, "event_bookings", eventId));
  if (!eventSnap.exists()) {
    return { data: { valid: false, message: "Event not found" } };
  }
  const eventData = eventSnap.data() as any;
  if (eventData.status === 'cancelled' || eventData.status === 'rejected') {
    return { data: { valid: false, reason: 'event_cancelled', message: 'Event reservation has been cancelled or rejected' } };
  }

  await updateDoc(doc(db, "event_invitations", invitationId), {
    status: "checked_in",
    checkedInAt: serverTimestamp(),
    checkedInBy: user.uid,
  });

  await addDoc(collection(db, "attendee_checkins"), {
    eventId,
    invitationId,
    attendeeId: invitationId,
    inviteeEmail,
    inviteeName: invitationData.inviteeName,
    checkedInAt: serverTimestamp(),
    checkedInBy: user.uid,
    method: "qr_scan",
  });

  return {
    data: {
      valid: true,
      message: "Check-in successful",
      attendee: { ...invitationData, invitationId },
    },
  };
};

// --- LOYALTY QR (UC22) ---

export const generateLoyaltyQR = async (
  _args?: {}
): Promise<{ data: { qrPayload: any; rotateInterval: number } }> => {
  const user = await requireAuthUser();

  const userSnap = await getDoc(doc(db, "users", user.email!.toLowerCase().trim()));
  if (!userSnap.exists()) {
    throw new Error("User profile not found");
  }
  const userData = userSnap.data() as any;

  const timestamp = Math.floor(Date.now() / 1000);
  const nonce = Math.random().toString(36).slice(2) + Date.now().toString(36);

  const payload = {
    guestId: user.uid,
    email: user.email!.toLowerCase().trim(),
    points: userData.loyaltyPoints || 0,
    tier: userData.loyaltyTier || "bronze",
    ts: timestamp,
    nonce,
  };

  const sig = await hmacDigest(payload);

  return {
    data: {
      qrPayload: { ...payload, sig },
      rotateInterval: 30000,
    },
  };
};

export const validateLoyaltyQR = async (args: {
  qrPayload: string;
}): Promise<{ data: { valid: boolean; guest?: any; reason?: string; message?: string } }> => {
  const user = await requireAuthUser();

  let payload: any;
  try {
    payload = typeof args.qrPayload === "string" ? JSON.parse(args.qrPayload) : args.qrPayload;
  } catch {
    return { data: { valid: false, message: "Invalid QR format" } };
  }

  const { guestId, email, ts, sig } = payload;
  if (!guestId || !sig) {
    return { data: { valid: false, message: "Invalid QR payload structure" } };
  }

  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - ts) > 60) {
    return { data: { valid: false, reason: "expired", message: "QR code has expired, please refresh" } };
  }

  const payloadForVerification: any = { ...payload };
  delete payloadForVerification.sig;
  const expectedSig = await hmacDigest(payloadForVerification);
  if (sig !== expectedSig) {
    return { data: { valid: false, reason: "invalid_signature", message: "Invalid QR code signature" } };
  }

  const lookupEmail = email || user.email;
  const userSnap = await getDoc(doc(db, "users", String(lookupEmail).toLowerCase().trim()));
  if (!userSnap.exists()) {
    return { data: { valid: false, reason: "user_not_found", message: "Guest profile not found" } };
  }
  const userData = userSnap.data() as any;

  return {
    data: {
      valid: true,
      guest: {
        id: guestId,
        name: userData.name || userData.displayName || "Guest",
        email: userData.email,
        loyaltyPoints: userData.loyaltyPoints || 0,
        loyaltyTier: userData.loyaltyTier || "bronze",
        photoURL: userData.photoURL || "",
        roomNumber: userData.roomNumber || "N/A",
        status: userData.status || "guest",
      },
    },
  };
};

// --- DAMAGE CLAIMS (UC30) ---

export const processDamageClaim = async (args: {
  inspectionId: string;
  damageItems: any[];
  assignedTechnicianId?: string;
}): Promise<{ data: { damageRecordId: string; invoiceId: string; totalCost: number; status: string } }> => {
  const user = await requireAuthUser();

  const inspectionSnap = await getDoc(doc(db, "event_inspections", args.inspectionId));
  if (!inspectionSnap.exists()) {
    throw new Error("Inspection not found");
  }
  const inspection = inspectionSnap.data() as any;

  const totalCost = (args.damageItems || []).reduce(
    (sum, item) => sum + (Number(item.estimatedCost) || 0),
    0
  );

  const recordRef = await addDoc(collection(db, "damage_records"), {
    eventId: inspection.eventId,
    inspectionId: args.inspectionId,
    guestId: inspection.guestId || "",
    reportedBy: user.uid,
    items: args.damageItems || [],
    totalCost,
    assignedTechnicianId: args.assignedTechnicianId || null,
    status: "recorded",
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  const invoiceRef = await addDoc(collection(db, "invoices"), {
    eventId: inspection.eventId,
    guestId: inspection.guestId || "",
    damageRecordId: recordRef.id,
    amount: totalCost,
    status: "pending",
    createdAt: serverTimestamp(),
  });

  return {
    data: {
      damageRecordId: recordRef.id,
      invoiceId: invoiceRef.id,
      totalCost,
      status: "recorded",
    },
  };
};

// --- REFUNDS (UC32, UC33) ---

export const processRefund = async (args: {
  refundRequestId: string;
  action: "approve" | "reject";
  rejectionReason?: string;
}): Promise<{ data: { success: boolean; status: string; refundAmount?: number } }> => {
  const user = await requireAuthUser();

  const requestSnap = await getDoc(doc(db, "refund_requests", args.refundRequestId));
  if (!requestSnap.exists()) {
    throw new Error("Refund request not found");
  }
  const request = requestSnap.data() as any;
  if (request.status !== "pending") {
    throw new Error("Refund already processed");
  }

  const status = args.action === "approve" ? "approved" : "rejected";

  await updateDoc(doc(db, "refund_requests", args.refundRequestId), {
    status,
    reviewedBy: user.uid,
    reviewedAt: serverTimestamp(),
    rejectionReason: args.action === "reject" ? (args.rejectionReason || null) : null,
    updatedAt: serverTimestamp(),
  });

  let refundAmount: number | undefined;
  if (args.action === "approve") {
    refundAmount = Number(request.requestedAmount) || 0;
    await addDoc(collection(db, "refund_transactions"), {
      refundRequestId: args.refundRequestId,
      eventId: request.eventId,
      guestId: request.guestId,
      amount: refundAmount,
      status: "processed",
      processedBy: user.uid,
      processedAt: serverTimestamp(),
    });
  }

  // ── EMAIL DISPATCH & NOTIFICATIONS ──
  try {
    const { generateAndSendInvoice, generateAndSendRefundRejectionEmail } = await import('./invoice-service');
    let guestEmail = request.guestEmail;
    let guestName = request.guestName || 'Guest Resident';
    if (!guestEmail && request.guestId) {
      const uSnap = await getDoc(doc(db, 'users', request.guestId));
      if (uSnap.exists()) {
        const ud = uSnap.data() as any;
        guestEmail = ud.email;
        guestName = ud.displayName || ud.name || guestName;
      }
    }
    guestEmail = guestEmail || 'guest@azurehorizon.com';

    if (args.action === "approve") {
      await generateAndSendInvoice({ type: 'refund', recordId: args.refundRequestId });
    } else if (args.action === "reject") {
      await generateAndSendRefundRejectionEmail({
        requestId: args.refundRequestId,
        guestEmail,
        guestName,
        rejectionReason: args.rejectionReason || 'Did not meet refund eligibility criteria under resort policies.',
        requestedAmount: request.requestedAmount || 0,
      });
    }

    // In-app Notification
    if (request.guestId) {
        await addDoc(collection(db, 'notifications'), {
          senderId: auth.currentUser?.uid || null,
          userId: request.guestId,
        type: 'refund_update',
        title: args.action === 'approve' ? '✅ Refund Approved' : '❌ Refund Request Declined',
        message: args.action === 'approve'
          ? `Your refund request of R ${(request.requestedAmount || 0).toLocaleString()} has been approved and processed.`
          : `Your refund request was declined. Reason: ${args.rejectionReason || 'Policy criteria not met.'}`,
        referenceId: args.refundRequestId,
        targetRoute: '/(guest)/my-bill',
        read: false,
        readAt: null,
        createdAt: serverTimestamp(),
      });
    }
  } catch (err) {
    console.warn('[processRefund Mail Error]', err);
  }

  return { data: { success: true, status, refundAmount } };
};

// --- STAFF ATTENDANCE PUNCH (UC29) ---

// Fallback only (used when a punch carries neither a geofence nor a worksiteId).
// Points at the default DUT Ritson Campus perimeter — never stale coordinates.
const DEFAULT_GEOFENCE = { lat: -29.8510602, lng: 31.0078848, radiusM: 200 };

export const recordAttendancePunch = async (args: {
  punchType: "in" | "out";
  lat: number;
  lng: number;
  accuracyM: number | null;
  staffName: string;
  staffRosterId?: string;
  deviceId?: string;
  worksiteId?: string;
  geofence?: { lat: number; lng: number; radiusM: number };
  blockOffsite?: boolean;
  deviceMatchPassed?: boolean;
  isFirstTimeEnrollment?: boolean;
  biometricPassed?: boolean;
  biometricMethod?: string;
  overallStatus?: 'clocked-in' | 'clocked-out' | 'flagged' | 'blocked';
}): Promise<{ data: { id: string; distanceM: number; withinRadius: boolean; at: string } }> => {
  const user = await requireAuthUser();
  const {
    punchType, lat, lng, accuracyM, staffName,
    staffRosterId, deviceId, worksiteId, geofence, blockOffsite,
    deviceMatchPassed, isFirstTimeEnrollment,
    biometricPassed, biometricMethod, overallStatus
  } = args;

  if (!["in", "out"].includes(punchType)) {
    throw new Error("punchType must be 'in' or 'out'");
  }
  if (typeof lat !== "number" || typeof lng !== "number") {
    throw new Error("Invalid coordinates");
  }

  // Identity: Firebase Auth UID is sole source (no email-key identity).
  const userSnap = await getDoc(doc(db, "users", user.uid));
  if (!userSnap.exists()) {
    throw new Error("User profile not found");
  }
  const userData = userSnap.data() as any;
  if (userData.role === 'guest' || userData.role === 'npo_rep' || !userData.role) {
    throw new Error("Only staff members can clock in/out");
  }
  if (userData.active === false) {
    throw new Error("Your employee account is inactive. Contact your administrator.");
  }

  let fence = geofence;
  if (!fence || (typeof fence.lat !== "number" && !worksiteId)) {
    if (worksiteId) {
      const wsSnap = await getDoc(doc(db, "worksites", worksiteId));
      if (wsSnap.exists()) {
        const w = wsSnap.data() as any;
        fence = { lat: w.lat, lng: w.lng, radiusM: Number(w.radiusM) || 400 };
      }
    }
  }
  if (!fence) {
    const settingsSnap = await getDoc(doc(db, "settings", "attendance_geofence"));
    if (settingsSnap.exists()) {
      const s = settingsSnap.data() as any;
      if (typeof s.lat === "number" && typeof s.lng === "number") {
        fence = { lat: s.lat, lng: s.lng, radiusM: Number(s.radiusM) || DEFAULT_GEOFENCE.radiusM };
      }
    }
  }
  if (!fence) {
    throw new Error("No worksite geofence configured. Contact your administrator.");
  }

  const distanceM = Math.round(haversineMeters(lat, lng, fence.lat, fence.lng));
  const withinRadius = distanceM <= fence.radiusM;
  if (blockOffsite && !withinRadius) {
    throw new Error(
      `You are ${distanceM}m from the worksite (max ${fence.radiusM}m). Off-site punches are blocked.`
    );
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todaysQuery = await getDocs(
    query(
      collection(db, "punch_records"),
      where("staffUid", "==", user.uid),
      where("timestamp", ">=", today),
      orderBy("timestamp", "desc"),
      limit(1)
    )
  );

  const last = todaysQuery.docs[0]?.data() as any;
  if (last) {
    if (punchType === "in" && last.punchType === "in") {
      throw new Error("Already clocked in");
    }
    if (punchType === "out" && last.punchType !== "in") {
      throw new Error("Clock in before clocking out");
    }
  } else if (punchType === "out") {
    throw new Error("Clock in before clocking out");
  }

  const docRef = await addDoc(collection(db, "punch_records"), {
    punchType,
    staffUid: user.uid,
    staffRosterId: staffRosterId || null,
    staffName: staffName || userData.displayName || userData.name || user.uid,
    deviceId: deviceId || 'device_unknown',
    worksiteId: worksiteId || null,
    deviceMatchPassed: deviceMatchPassed === true && !!deviceId,
    isFirstTimeEnrollment: !!isFirstTimeEnrollment,
    biometricPassed: !!biometricPassed,
    biometricMethod: biometricMethod || 'none',
    lat,
    lng,
    accuracyM: typeof accuracyM === "number" ? accuracyM : null,
    distanceM,
    withinRadius,
    overallStatus: overallStatus || (withinRadius ? (punchType === 'in' ? 'clocked-in' : 'clocked-out') : 'blocked'),
    source: "staff_mobile",
    timestamp: serverTimestamp(),
    isoTime: new Date().toISOString(),
  });

  return {
    data: {
      id: docRef.id,
      distanceM,
      withinRadius,
      at: new Date().toISOString(),
    },
  };
};

// --- HELPER FUNCTIONS FOR USER LOOKUPS ---

const findUserProfileByUid = async (uid: string): Promise<any | null> => {
  const usersRef = collection(db, 'users');
  const q = query(usersRef, where('uid', '==', uid));
  const querySnapshot = await getDocs(q);
  if (!querySnapshot.empty) {
    const userDoc = querySnapshot.docs[0];
    return { ...userDoc.data(), id: userDoc.id };
  }
  return null;
};

const findUserProfileByEmail = async (email: string): Promise<any | null> => {
  const cleanEmail = email.trim().toLowerCase();
  
  // 1. Try checking the document ID first (Original logic)
  const emailDocRef = doc(db, 'users', cleanEmail);
  const emailSnap = await getDoc(emailDocRef);
  if (emailSnap.exists()) {
    return { ...emailSnap.data(), id: emailSnap.id };
  }
  
  // 2. Fallback: query the collection by the email field
  const usersRef = collection(db, 'users');
  const q = query(usersRef, where('email', '==', cleanEmail));
  const querySnapshot = await getDocs(q);
  if (!querySnapshot.empty) {
    const userDoc = querySnapshot.docs[0];
    return { ...userDoc.data(), id: userDoc.id };
  }
  return null;
};

// --- AUTHENTICATION FUNCTIONS ---

export const loginMobileUser = async (email: string, password: string) => {
  try {
    const cleanEmail = email.trim().toLowerCase();
    
    // Authenticate with Firebase Auth
    const userCredential = await signInWithEmailAndPassword(auth, cleanEmail, password);
    const user = userCredential.user;

    // Prefer UID lookup because the Firestore user document may not be keyed by email.
    const uidProfile = await findUserProfileByUid(user.uid);
    if (uidProfile) {
      // Update last login time
      const uidUpdates: Record<string, any> = {
        lastLoginAt: serverTimestamp(),
      };
      const uidDisplayName = user.displayName || uidProfile.displayName;
      const uidPhotoURL = user.photoURL || uidProfile.photoURL;
      if (uidDisplayName) uidUpdates.displayName = uidDisplayName;
      if (uidPhotoURL) uidUpdates.photoURL = uidPhotoURL;
      await updateDoc(doc(db, 'users', uidProfile.id), uidUpdates);
      return { uid: user.uid, ...uidProfile };
    }
    
    // Fallback to email lookup
    const emailProfile = user.email ? await findUserProfileByEmail(user.email) : null;
    if (emailProfile) {
      // Update the document with the UID if it was keyed by email
      const emailUpdates: Record<string, any> = {
        uid: user.uid,
        lastLoginAt: serverTimestamp(),
      };
      const emailDisplayName = user.displayName || emailProfile.displayName;
      const emailPhotoURL = user.photoURL || emailProfile.photoURL;
      if (emailDisplayName) emailUpdates.displayName = emailDisplayName;
      if (emailPhotoURL) emailUpdates.photoURL = emailPhotoURL;
      await updateDoc(doc(db, 'users', emailProfile.id), emailUpdates);
      return { uid: user.uid, ...emailProfile };
    }
    
    // Create a new user profile if it doesn't exist
    console.log('Creating new user profile for:', user.uid);
    const newProfile = {
      uid: user.uid,
      email: user.email,
      displayName: user.displayName || 'Guest',
      role: 'guest',
      subRole: null,
      loyaltyPoints: 0,
      loyaltyTier: 'bronze',
      phoneNumber: user.phoneNumber || '',
      photoURL: user.photoURL || '',
      roomNumber: 'N/A',
      status: 'guest',
      preferences: {
        language: 'en',
        notifications: true,
      },
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      lastLoginAt: serverTimestamp(),
    };
    
    const userRef = doc(db, 'users', user.uid);
    await setDoc(userRef, newProfile);
    
    return { ...newProfile };
  } catch (error: any) {
    console.error("Login Error:", error.message);
    throw error;
  }
};

export const logoutMobileUser = async () => {
  await signOut(auth);
};

// --- SERVICE REQUEST FUNCTIONS ---

export const createServiceRequest = async (requestData: any) => {
  try {
    const docRef = await addDoc(collection(db, 'service_requests'), requestData);
    return docRef;
  } catch (error) {
    console.error("Error adding document: ", error);
    throw error;
  }
};

export const listenForServiceRequests = (callback: (requests: any[]) => void) => {
  const q = collection(db, 'service_requests');
  const unsubscribe = onSnapshot(q, (snapshot) => {
    const requests = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));
    callback(requests);
  });
  return unsubscribe;
};

// --- IMAGE UPLOAD FUNCTION ---

export const uploadImage = async (uri: string, pathPrefix: string = 'uploads'): Promise<string> => {
  try {
    const filename = `${pathPrefix}/${Date.now()}_${Math.random().toString(36).substring(7)}.jpg`;
    const storageRef = ref(storage, filename);

    // Read the image once as base64 — it doubles as a universal fallback so we
    // NEVER persist a device-local file:// path that other devices can't load.
    let base64 = '';
    try {
      const FileSystem = require('expo-file-system');
      base64 = await FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.Base64 });
    } catch (fsErr) {
      console.warn('Base64 read failed, trying fetch blob:', fsErr);
    }

    if (base64) {
      try {
        const { uploadString } = require('firebase/storage');
        await uploadString(storageRef, `data:image/jpeg;base64,${base64}`, 'data_url');
        return await getDownloadURL(storageRef);
      } catch (stErr: any) {
        console.warn('Firebase storage uploadString denied or offline, returning data URL:', stErr);
        return `data:image/jpeg;base64,${base64}`;
      }
    }

    // Standard fetch blob fallback (e.g. web where readAsStringAsync may fail)
    try {
      const response = await fetch(uri);
      const blob = await response.blob();
      await uploadBytes(storageRef, blob);
      return await getDownloadURL(storageRef);
    } catch (blobErr: any) {
      console.warn('Blob upload denied or offline, returning data URL:', blobErr);
      if (base64) return `data:image/jpeg;base64,${base64}`;
      return uri;
    }
  } catch (error: any) {
    console.error('Failed to upload image:', error);
    return uri;
  }
};

// --- LOYALTY & REWARDS FUNCTIONS ---

export type LoyaltyLogEntry = {
  id: string;
  guestId: string;
  points: number;
  reason: string;
  createdAt: string;
};

export const getUserProfileForAuthUser = async (user: any) => {
  if (!user) {
    throw new Error('No authenticated user found.');
  }
  const uidProfile = await findUserProfileByUid(user.uid);
  if (uidProfile) {
    return uidProfile;
  }
  if (user.email) {
    const emailProfile = await findUserProfileByEmail(user.email);
    if (emailProfile) {
      return emailProfile;
    }
  }
  throw new Error('User profile not found.');
};

export const listenForLoyaltyLog = (
  guestId: string,
  callback: (entries: LoyaltyLogEntry[]) => void
) => {
  const q = query(collection(db, 'loyalty_logs'), where('guestId', '==', guestId));
  const unsubscribe = onSnapshot(q, (snapshot) => {
    const entries = snapshot.docs.map((docSnap) => ({
      id: docSnap.id,
      ...(docSnap.data() as Omit<LoyaltyLogEntry, 'id'>),
    }));
    callback(entries);
  });
  return unsubscribe;
};

export const calculateLoyaltyTier = (points: number): 'bronze' | 'silver' | 'gold' | 'platinum' => {
  if (points >= 5000) return 'platinum';
  if (points >= 1500) return 'gold';
  if (points >= 500) return 'silver';
  return 'bronze';
};

export const awardLoyaltyPoints = async (
  userDocId: string,
  guestId: string,
  points: number,
  reason: string
) => {
  let userRef = doc(db, 'users', userDocId);
  let userSnap = await getDoc(userRef);

  if (!userSnap.exists() && guestId) {
    userRef = doc(db, 'users', guestId);
    userSnap = await getDoc(userRef);
  }

  if (!userSnap.exists()) {
    throw new Error('User profile not found.');
  }

  const userData = userSnap.data() as Record<string, any>;
  const newPoints = Math.max(0, (userData.loyaltyPoints || 0) + points);
  const newTier = calculateLoyaltyTier(newPoints);

  await updateDoc(userRef, {
    loyaltyPoints: newPoints,
    loyaltyTier: newTier,
    updatedAt: serverTimestamp(),
  });

  await addDoc(collection(db, 'loyalty_logs'), {
    guestId: userSnap.id,
    points,
    reason,
    createdAt: new Date().toISOString(),
  });

  return { newPoints, newTier };
};

// --- EVENT INVITATIONS (UC26) ---

export const createEventInvitation = async (invitationData: {
  eventId: string;
  guestId: string;
  inviteeEmail: string;
  inviteeName: string;
  qrCode: string;
}) => {
  const docRef = await addDoc(collection(db, 'event_invitations'), {
    ...invitationData,
    status: 'pending',
    sentAt: serverTimestamp(),
    createdAt: serverTimestamp(),
  });
  return docRef;
};

export const getEventInvitations = async (eventId: string) => {
  const q = query(collection(db, 'event_invitations'), where('eventId', '==', eventId));
  const snapshot = await getDocs(q);
  return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
};

export const listenForEventInvitations = (
  eventId: string,
  callback: (invitations: any[]) => void
) => {
  const q = query(collection(db, 'event_invitations'), where('eventId', '==', eventId));
  const unsubscribe = onSnapshot(q, (snapshot) => {
    const invitations = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    callback(invitations);
  });
  return unsubscribe;
};

// --- EVENT FEEDBACK (UC32) ---

export const submitEventFeedback = async (feedbackData: {
  eventId: string;
  guestId: string;
  guestName?: string;
  ratings: { venue: number; catering: number; staff: number; setup: number };
  comments: string;
}) => {
  const docRef = await addDoc(collection(db, 'event_feedback'), {
    ...feedbackData,
    submittedAt: serverTimestamp(),
  });

  const avg = Math.round(
    (feedbackData.ratings.venue +
      feedbackData.ratings.catering +
      feedbackData.ratings.staff +
      feedbackData.ratings.setup) /
      4
  );
  await addDoc(collection(db, 'reviews'), {
    guestId: feedbackData.guestId,
    guestName: feedbackData.guestName || 'Anonymous Guest',
    category: 'event',
    rating: Math.min(5, Math.max(1, avg)),
    comments: feedbackData.comments || `Event feedback (${docRef.id})`,
    eventId: feedbackData.eventId,
    helpful: 0,
    createdAt: new Date().toISOString(),
  });

  return docRef;
};

export const getEventFeedback = async (eventId: string) => {
  const q = query(collection(db, 'event_feedback'), where('eventId', '==', eventId));
  const snapshot = await getDocs(q);
  return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
};

export const sanitizeFirestoreData = (data: Record<string, any>): Record<string, any> => {
  const clean: Record<string, any> = {};
  Object.keys(data).forEach((key) => {
    const val = data[key];
    if (val !== undefined) {
      if (val === null) {
        clean[key] = null;
      } else if (Array.isArray(val)) {
        clean[key] = val.filter(v => v !== undefined);
      } else if (typeof val === 'object' && !(val instanceof Date) && val.constructor?.name === 'Object') {
        clean[key] = sanitizeFirestoreData(val);
      } else {
        clean[key] = val;
      }
    }
  });
  return clean;
};

// --- LIVE COMPLAINTS (UC33) ---

export const createLiveComplaint = async (complaintData: {
  eventId?: string;
  guestId: string;
  category: string;
  location: string;
  description: string;
  urgency: 'low' | 'medium' | 'high' | 'critical';
  photos?: string[];
}) => {
  const cleanData = sanitizeFirestoreData({
    eventId: complaintData.eventId || 'general_resort',
    guestId: complaintData.guestId || '',
    category: complaintData.category || 'other',
    location: complaintData.location || 'Resort Grounds',
    description: complaintData.description || '',
    urgency: complaintData.urgency || 'medium',
    photos: complaintData.photos || [],
    status: 'open',
    createdAt: serverTimestamp(),
  });

  const docRef = await addDoc(collection(db, 'live_complaints'), cleanData);
  return docRef;
};

export const listenForLiveComplaints = (
  eventId: string,
  callback: (complaints: any[]) => void
) => {
  const q = query(collection(db, 'live_complaints'), where('eventId', '==', eventId));
  const unsubscribe = onSnapshot(q, (snapshot) => {
    const complaints = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    callback(complaints);
  });
  return unsubscribe;
};

export const updateLiveComplaintStatus = async (
  complaintId: string,
  status: 'open' | 'assigned' | 'in_progress' | 'resolved',
  assignedTo?: string
) => {
  const complaintRef = doc(db, 'live_complaints', complaintId);

  // Fetch complaint data BEFORE updating so we have guestId for the notification
  let complaintData: any = null;
  const snap = await getDoc(complaintRef);
  if (snap.exists()) complaintData = snap.data();

  await updateDoc(complaintRef, {
    status,
    assignedTo: assignedTo || null,
    updatedAt: serverTimestamp(),
    ...(status === 'resolved' && { resolvedAt: serverTimestamp() }),
  });

  // Notify the resident when their complaint status updates
  if (complaintData?.guestId) {
    try {
      const titles: Record<string, string> = {
        assigned: '🔧 Complaint Assigned',
        in_progress: '🛠️ Service In Progress',
        resolved: '✅ Complaint Resolved',
      };
      const messages: Record<string, string> = {
        assigned: `A staff technician has been assigned to your ${complaintData.category || 'live'} complaint.`,
        in_progress: `Maintenance team is currently working on your ${complaintData.category || 'live'} request.`,
        resolved: `Your ${complaintData.category || 'live'} complaint has been resolved by our team.`,
      };

      if (titles[status]) {
          await addDoc(collection(db, 'notifications'), {
            senderId: auth.currentUser?.uid || null,
            userId: complaintData.guestId,
          type: `complaint_${status}`,
          title: titles[status],
          message: messages[status],
          referenceId: complaintId,
          targetRoute: '/(guest)/guest-portal',
          read: false,
          readAt: null,
          createdAt: serverTimestamp(),
        });
      }
    } catch (e) {
      console.warn('Could not send complaint notification:', e);
    }
  }
};

// --- STAFF SHIFT ASSIGNMENTS (UC27) ---

export const createStaffShiftAssignment = async (assignmentData: {
  eventId: string;
  staffId: string;
  subRole: string;
  dutyStation: string;
  shiftStart: string;
  shiftEnd: string;
}) => {
  const docRef = await addDoc(collection(db, 'staff_shift_assignments'), {
    ...assignmentData,
    status: 'assigned',
    createdAt: serverTimestamp(),
  });
  return docRef;
};

export const getStaffShiftAssignments = async (eventId: string) => {
  const q = query(collection(db, 'staff_shift_assignments'), where('eventId', '==', eventId));
  const snapshot = await getDocs(q);
  return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
};

export const listenForStaffShiftAssignments = (
  eventId: string,
  callback: (assignments: any[]) => void
) => {
  const q = query(collection(db, 'staff_shift_assignments'), where('eventId', '==', eventId));
  const unsubscribe = onSnapshot(q, (snapshot) => {
    const assignments = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    callback(assignments);
  });
  return unsubscribe;
};

export const updateStaffCheckIn = async (
  assignmentId: string,
  status: 'checked_in' | 'completed',
  dutyStation?: string
) => {
  const assignmentRef = doc(db, 'staff_shift_assignments', assignmentId);
  await updateDoc(assignmentRef, {
    status,
    dutyStation: dutyStation || null,
    checkedInAt: status === 'checked_in' ? serverTimestamp() : null,
    updatedAt: serverTimestamp(),
  });
};

// --- EVENT INSPECTIONS (UC28, UC30) ---

export const createEventInspection = async (inspectionData: {
  eventId: string;
  type: 'pre_event' | 'post_event';
  inspectorId: string;
  checklistItems: { item: string; status: 'passed' | 'failed' | 'na'; notes?: string; photos?: string[] }[];
  overallStatus: 'approved' | 'needs_attention' | 'failed';
}) => {
  const docRef = await addDoc(collection(db, 'event_inspections'), {
    ...inspectionData,
    completedAt: serverTimestamp(),
    createdAt: serverTimestamp(),
  });

  // Notify the resident who owns the event booking
  try {
    const eventSnap = await getDoc(doc(db, 'event_bookings', inspectionData.eventId));
    if (eventSnap.exists()) {
      const eventData = eventSnap.data() as any;
      if (eventData.guestId) {
        const isPre = inspectionData.type === 'pre_event';
        const statusEmoji =
          inspectionData.overallStatus === 'approved' ? '✅' :
          inspectionData.overallStatus === 'needs_attention' ? '⚠️' : '❌';
        const statusLabel = inspectionData.overallStatus.replace('_', ' ');
          await addDoc(collection(db, 'notifications'), {
            senderId: auth.currentUser?.uid || null,
            userId: eventData.guestId,
          type: 'inspection_update',
          title: `${statusEmoji} ${isPre ? 'Pre-Event' : 'Post-Event'} Inspection: ${statusLabel}`,
          message: isPre
            ? `Your event venue has been inspected. Result: ${statusLabel}. Our team will contact you if anything needs attention.`
            : `Post-event inspection for your booking is complete. Result: ${statusLabel}.`,
          referenceId: inspectionData.eventId,
          targetRoute: '/(guest)/event-booking',
          read: false,
          readAt: null,
          createdAt: serverTimestamp(),
        });
      }
    }
  } catch (e) {
    console.warn('Could not send inspection notification:', e);
  }

  return docRef;
};

export const getEventInspections = async (eventId: string) => {
  const q = query(collection(db, 'event_inspections'), where('eventId', '==', eventId));
  const snapshot = await getDocs(q);
  return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
};

export const listenForEventInspections = (
  eventId: string,
  callback: (inspections: any[]) => void
) => {
  const q = query(collection(db, 'event_inspections'), where('eventId', '==', eventId));
  const unsubscribe = onSnapshot(q, (snapshot) => {
    const inspections = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    callback(inspections);
  });
  return unsubscribe;
};

// --- ATTENDEE CHECK-INS (UC29) ---

export const createAttendeeCheckIn = async (checkInData: {
  eventId: string;
  invitationId: string;
  inviteeEmail: string;
  inviteeName: string;
  method: 'qr_scan' | 'manual';
  staffId: string;
}) => {
  const docRef = await addDoc(collection(db, 'attendee_checkins'), {
    ...checkInData,
    checkedInAt: serverTimestamp(),
  });
  return docRef;
};

export const getAttendeeCheckIns = async (eventId: string) => {
  const q = query(collection(db, 'attendee_checkins'), where('eventId', '==', eventId));
  const snapshot = await getDocs(q);
  return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
};

export const listenForAttendeeCheckIns = (
  eventId: string,
  callback: (checkins: any[]) => void
) => {
  const q = query(collection(db, 'attendee_checkins'), where('eventId', '==', eventId));
  const unsubscribe = onSnapshot(q, (snapshot) => {
    const checkins = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    callback(checkins);
  });
  return unsubscribe;
};

// --- DAMAGE RECORDS (UC30, UC31) ---

export const createDamageRecord = async (damageData: {
  eventId: string;
  inspectionId: string;
  guestId: string;
  reportedBy: string;
  items: { item: string; description: string; estimatedCost: number; photos?: string[] }[];
  totalCost: number;
  assignedTechnicianId?: string;
}) => {
  const docRef = await addDoc(collection(db, 'damage_records'), {
    ...damageData,
    status: 'recorded',
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  // Notify the resident about the damage claim filed against their booking
  if (damageData.guestId) {
    try {
        await addDoc(collection(db, 'notifications'), {
          senderId: auth.currentUser?.uid || null,
          userId: damageData.guestId,
        type: 'damage_record',
        title: '⚠️ Damage Report Filed',
        message: `A damage report has been filed for your event booking. ${damageData.items.length} item(s) recorded. Estimated total: R ${damageData.totalCost.toLocaleString()}. Our team will contact you shortly.`,
        referenceId: docRef.id,
        targetRoute: '/(guest)/event-booking',
        read: false,
        readAt: null,
        createdAt: serverTimestamp(),
      });
    } catch (e) {
      console.warn('Could not send damage notification:', e);
    }
  }

  return docRef;
};

export const getDamageRecords = async (eventId: string) => {
  const q = query(collection(db, 'damage_records'), where('eventId', '==', eventId));
  const snapshot = await getDocs(q);
  return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
};

export const listenForDamageRecords = (
  eventId: string,
  callback: (records: any[]) => void
) => {
  const q = query(collection(db, 'damage_records'), where('eventId', '==', eventId));
  const unsubscribe = onSnapshot(q, (snapshot) => {
    const records = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    callback(records);
  });
  return unsubscribe;
};

export const updateDamageRecordStatus = async (
  recordId: string,
  status: 'recorded' | 'reported' | 'in_repair' | 'resolved',
  assignedTechnicianId?: string
) => {
  const user = auth.currentUser;
  const recordRef = doc(db, 'damage_records', recordId);
  await updateDoc(recordRef, {
    status,
    assignedTechnicianId: assignedTechnicianId || null,
    updatedBy: user?.uid || 'staff',
    updatedByEmail: user?.email || 'staff@azure.com',
    updatedAt: serverTimestamp(),
    ...(status === 'resolved' && { resolvedAt: serverTimestamp() }),
  });

  // NOTE: No invoice is generated here anymore. Once a claim is resolved it is
  // sent to the Admin for adjudication, and the ADMIN issues the guest invoice.
};

// --- REFUND REQUESTS (UC34 / UC32 / UC33) ---

export const createRefundRequest = async (refundData: {
  eventId: string;
  guestId: string;
  reason: string;
  requestedAmount: number;
  incidentLogId?: string;
  totalPaidAmount?: number;
}) => {
  const user = auth.currentUser;
  if (!user || user.uid !== refundData.guestId) {
    throw new Error('Unauthorized: You can only request a refund for your own booking.');
  }

  // 1. Prevent Duplicate Active/Approved Requests for the same event
  const dupQuery = query(
    collection(db, 'refund_requests'),
    where('eventId', '==', refundData.eventId),
    where('guestId', '==', refundData.guestId)
  );
  const dupSnap = await getDocs(dupQuery);
  const existingActive = dupSnap.docs.find(d => {
    const st = d.data().status;
    return st === 'pending' || st === 'approved';
  });

  if (existingActive) {
    throw new Error('A refund request for this booking is already pending or approved.');
  }

  // 2. Validate Refund Amount Cap
  if (refundData.requestedAmount <= 0) {
    throw new Error('Requested refund amount must be greater than R 0.');
  }
  if (refundData.totalPaidAmount && refundData.requestedAmount > refundData.totalPaidAmount) {
    throw new Error(`Requested refund amount (R ${refundData.requestedAmount}) cannot exceed total paid amount (R ${refundData.totalPaidAmount}).`);
  }

  // 3. Check for Outstanding Damage Record Double-Dip (UC30 ↔ UC32)
  const damageQuery = query(collection(db, 'damage_records'), where('eventId', '==', refundData.eventId));
  const damageSnap = await getDocs(damageQuery);
  let totalDamageCost = 0;
  damageSnap.forEach(d => {
    totalDamageCost += d.data().totalCost || 0;
  });

  const cleanData = sanitizeFirestoreData({
    eventId: refundData.eventId || 'general_booking',
    guestId: refundData.guestId || '',
    guestName: (refundData as any).guestName || user.displayName || 'Resident Guest',
    guestEmail: (refundData as any).guestEmail || user.email || 'guest@azurehorizon.com',
    reason: refundData.reason || '',
    requestedAmount: refundData.requestedAmount || 0,
    totalPaidAmount: refundData.totalPaidAmount || refundData.requestedAmount || 0,
    incidentLogId: refundData.incidentLogId || null,
    proofImages: (refundData as any).proofImages || [],
    status: 'pending',
    hasDamageRecord: !damageSnap.empty,
    damageCost: totalDamageCost,
    createdAt: serverTimestamp(),
  });

  const docRef = await addDoc(collection(db, 'refund_requests'), cleanData);
  return docRef;
};

export const getRefundRequests = async (eventId?: string) => {
  let q: any = collection(db, 'refund_requests');
  if (eventId) {
    q = query(q, where('eventId', '==', eventId));
  }
  const snapshot = await getDocs(q);
  return snapshot.docs.map((doc: any) => ({ id: doc.id, ...doc.data() }));
};

export const listenForRefundRequests = (
  callback: (requests: any[]) => void
) => {
  const q = collection(db, 'refund_requests');
  const unsubscribe = onSnapshot(q, (snapshot) => {
    const requests = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    callback(requests);
  });
  return unsubscribe;
};

export const updateRefundRequestStatus = async (
  requestId: string,
  status: 'pending' | 'approved' | 'rejected',
  approvedBy?: string,
  rejectionReason?: string
) => {
  const user = auth.currentUser;
  const adminUid = user?.uid || approvedBy || 'system_admin';
  const adminEmail = user?.email || 'admin@azure.com';

  const requestRef = doc(db, 'refund_requests', requestId);

  // Read request BEFORE updating to capture guestId and amount for notification
  const requestSnap = await getDoc(requestRef);
  const requestData = requestSnap.exists() ? (requestSnap.data() as any) : null;

  await updateDoc(requestRef, {
    status,
    reviewedBy: adminUid,
    reviewedByEmail: adminEmail,
    rejectedBy: status === 'rejected' ? adminUid : null,
    rejectionReason: rejectionReason || null,
    updatedAt: serverTimestamp(),
    ...(status === 'approved' ? { approvedAt: serverTimestamp() } : {}),
    ...(status === 'rejected' ? { rejectedAt: serverTimestamp() } : {}),
  });

  // Notify the resident of the refund decision
  if (requestData?.guestId && status !== 'pending') {
    try {
      const isApproved = status === 'approved';
      const amount = requestData.requestedAmount || 0;
        await addDoc(collection(db, 'notifications'), {
          senderId: auth.currentUser?.uid || null,
          userId: requestData.guestId,
        type: 'refund_update',
        title: isApproved ? '✅ Refund Approved' : '❌ Refund Declined',
        message: isApproved
          ? `Your refund of R ${Number(amount).toLocaleString()} has been approved and is being processed.`
          : `Your refund request was declined. ${rejectionReason ? `Reason: ${rejectionReason}` : 'Please contact reception for more details.'}`,
        referenceId: requestId,
        targetRoute: '/(guest)/reservations',
        read: false,
        readAt: null,
        createdAt: serverTimestamp(),
      });

      if (isApproved) {
        const { generateAndSendInvoice } = await import('./invoice-service');
        await generateAndSendInvoice({ type: 'refund', recordId: requestId });
      }
    } catch (e) {
      console.warn('Could not send refund notification / invoice:', e);
    }
  }
};

// --- ROOM CREDENTIALS (Digital Key) ---

export const revokeRoomCredential = async (bookingId: string) => {
  const credRef = doc(db, 'room_credentials', bookingId);
  await updateDoc(credRef, {
    revoked: true,
    revokedAt: serverTimestamp(),
  });
};

export const getRoomCredential = async (bookingId: string) => {
  const credRef = doc(db, 'room_credentials', bookingId);
  const snap = await getDoc(credRef);
  if (snap.exists()) {
    return { id: snap.id, ...snap.data() };
  }
  return null;
};

// --- NOTIFICATIONS ---

export const createNotification = async (notificationData: {
  userId: string;
  type: string;
  title: string;
  message: string;
  referenceId?: string;
  targetRoute?: string;
}) => {
  // Sender-attributed (rules require senderId == auth.uid; recipients must be
  // user-doc ids — never group literals or emails).
  const senderId = auth.currentUser?.uid || null;
  if (!senderId) throw new Error('You must be signed in to send notifications.');
  const docRef = await addDoc(collection(db, 'notifications'), {
    ...notificationData,
    senderId,
    read: false,
    createdAt: serverTimestamp(),
  });
  return docRef;
};

export const listenForNotifications = (
  userId: string,
  callback: (notifications: any[]) => void,
  onError?: (e: Error) => void
) => {
  const q = query(collection(db, 'notifications'), where('userId', '==', userId));
  const unsubscribe = onSnapshot(q, (snapshot) => {
    const notifications = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    callback(notifications);
  }, (err) => onError?.(err as Error));
  return unsubscribe;
};

export const markNotificationRead = async (notificationId: string) => {
  const notifRef = doc(db, 'notifications', notificationId);
  await updateDoc(notifRef, { read: true, readAt: new Date().toISOString() });
};

export const redeemLoyaltyReward = async (
  userDocId: string,
  guestId: string,
  reward: { title: string; pts: number }
) => {
  const voucherCode = `AZURE-REWARD-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
  const nowMs = Date.now();
  const expiresAtMs = nowMs + (24 * 60 * 60 * 1000); // 24 hours from generation

  const result = await runTransaction(db, async (transaction) => {
    const userRef = doc(db, 'users', userDocId);
    const userSnap = await transaction.get(userRef);
    if (!userSnap.exists()) {
      throw new Error('User profile not found.');
    }
    const userData = userSnap.data() as Record<string, any>;
    const loyaltyPoints = userData.loyaltyPoints || 0;
    const heldPoints = userData.heldPoints || 0;
    const availablePoints = Math.max(0, loyaltyPoints - heldPoints);

    if (availablePoints < reward.pts) {
      throw new Error(`Not enough available points. You have ${availablePoints} available (${heldPoints} points held in pending vouchers).`);
    }

    const newHeldPoints = heldPoints + reward.pts;
    const newAvailablePoints = loyaltyPoints - newHeldPoints;

    // 1. Update heldPoints on user profile (loyaltyPoints remains UNCHANGED!)
    transaction.update(userRef, {
      heldPoints: newHeldPoints,
      updatedAt: serverTimestamp(),
    });

    // 2. Write informational loyalty log doc
    const logRef = doc(collection(db, 'loyalty_logs'));
    transaction.set(logRef, {
      guestId,
      points: 0,
      reason: `Points Held (${reward.pts} pts): ${reward.title}`,
      createdAt: new Date().toISOString(),
    });

    // 3. Write voucher doc with 24h expiration
    const voucherRef = doc(collection(db, 'loyalty_vouchers'));
    transaction.set(voucherRef, {
      voucherCode,
      guestId,
      userDocId,
      rewardTitle: reward.title,
      pointsSpent: reward.pts,
      status: 'pending',
      claimed: false,
      expiresAtMs,
      createdAt: serverTimestamp(),
    });

    return {
      loyaltyPoints,
      heldPoints: newHeldPoints,
      availablePoints: newAvailablePoints,
      voucherCode,
      expiresAtMs,
    };
  });

  return result;
};

export const redeemVoucherByStaff = async (voucherCode: string, staffUid: string) => {
  const q = query(collection(db, 'loyalty_vouchers'), where('voucherCode', '==', voucherCode.trim().toUpperCase()));
  const snap = await getDocs(q);
  if (snap.empty) {
    throw new Error('Invalid or non-existent voucher code.');
  }
  const vDoc = snap.docs[0];
  const data = vDoc.data() as any;
  if (data.status === 'redeemed' || data.claimed) {
    throw new Error('Voucher has already been redeemed.');
  }
  if (data.status === 'expired_refunded') {
    throw new Error('Voucher has expired and held points were released.');
  }
  if (data.expiresAtMs && Date.now() > data.expiresAtMs) {
    throw new Error('Voucher has passed 24-hour expiration window.');
  }

  const pointsToDeduct = Number(data.pointsSpent || 0);

  // Run atomic transaction to finalize deduction: decrease loyaltyPoints AND heldPoints
  await runTransaction(db, async (transaction) => {
    const targetUserId = data.userDocId || data.guestId;
    const userRef = doc(db, 'users', targetUserId);
    const userSnap = await transaction.get(userRef);

    if (userSnap.exists()) {
      const userData = userSnap.data() as Record<string, any>;
      const currentLoyaltyPoints = userData.loyaltyPoints || 0;
      const currentHeldPoints = userData.heldPoints || 0;

      const newLoyaltyPoints = Math.max(0, currentLoyaltyPoints - pointsToDeduct);
      const newHeldPoints = Math.max(0, currentHeldPoints - pointsToDeduct);
      const newTier = calculateLoyaltyTier(newLoyaltyPoints);

      transaction.update(userRef, {
        loyaltyPoints: newLoyaltyPoints,
        heldPoints: newHeldPoints,
        loyaltyTier: newTier,
        updatedAt: serverTimestamp(),
      });
    }

    const voucherDocRef = doc(db, 'loyalty_vouchers', vDoc.id);
    transaction.update(voucherDocRef, {
      claimed: true,
      status: 'redeemed',
      claimedAt: serverTimestamp(),
      claimedByStaff: staffUid,
    });

    const logRef = doc(collection(db, 'loyalty_logs'));
    transaction.set(logRef, {
      guestId: data.guestId,
      points: -pointsToDeduct,
      reason: `Staff Verified Scan: ${data.rewardTitle}`,
      createdAt: new Date().toISOString(),
    });
  });

  return { id: vDoc.id, ...data, status: 'redeemed' };
};

export const checkAndRefundExpiredVouchers = async (guestId: string) => {
  if (!guestId) return;
  try {
    const q = query(
      collection(db, 'loyalty_vouchers'),
      where('guestId', '==', guestId),
      where('status', '==', 'pending')
    );
    const snap = await getDocs(q);
    const nowMs = Date.now();

    for (const d of snap.docs) {
      const vData = d.data() as any;
      if (vData.expiresAtMs && nowMs >= vData.expiresAtMs) {
        const pointsHeld = Number(vData.pointsSpent || 0);
        const targetUserId = vData.userDocId || guestId;

        // Release held points on user profile
        const userRef = doc(db, 'users', targetUserId);
        const userSnap = await getDoc(userRef);
        if (userSnap.exists()) {
          const userData = userSnap.data() as Record<string, any>;
          const currentHeld = userData.heldPoints || 0;
          const newHeld = Math.max(0, currentHeld - pointsHeld);
          await updateDoc(userRef, {
            heldPoints: newHeld,
            updatedAt: serverTimestamp(),
          });
        }

        // Update voucher status
        await updateDoc(doc(db, 'loyalty_vouchers', d.id), {
          status: 'expired_refunded',
          expiredAt: serverTimestamp(),
        });

        // Add log entry
        await addDoc(collection(db, 'loyalty_logs'), {
          guestId: targetUserId,
          points: 0,
          reason: `Voucher Expired: Released ${pointsHeld} Held Points for ${vData.rewardTitle}`,
          createdAt: new Date().toISOString(),
        });

        // Add notification
          await addDoc(collection(db, 'notifications'), {
            senderId: auth.currentUser?.uid || null,
            userId: targetUserId,
          type: 'loyalty_refund',
          title: '🎟️ Voucher Hold Released',
          message: `Your 24h unredeemed voucher for "${vData.rewardTitle}" expired. ${pointsHeld} held points have been released back to your available balance.`,
          referenceId: vData.id,
          targetRoute: '/(guest)/loyalty',
          read: false,
          createdAt: serverTimestamp(),
        });
      }
    }
  } catch (err) {
    console.warn('Error checking expired vouchers:', err);
  }
};


// --- GUEST ACTIVITY AGGREGATION (single live source for "My Activity") ---

export type CateringSelection = {
  id?: string;
  guestId: string;
  bookingId: string;
  expectedAttendance: number;
  items: { id: string; name: string; pricePerPerson: number; quantity: number; total: number }[];
  totalAmount: number;
  status?: string;
  createdAt?: string;
  updatedAt?: string;
};

// Upsert: a guest has exactly ONE catering selection per event booking.
// Re-selecting after confirmation updates the existing doc instead of duplicating.
export const saveEventCatering = async (data: {
  guestId: string;
  bookingId: string;
  expectedAttendance: number;
  items: { id: string; name: string; pricePerPerson: number; quantity: number; total: number }[];
  totalAmount: number;
}) => {
  const existing = await getDocs(
    query(
      collection(db, 'event_caterings'),
      where('bookingId', '==', data.bookingId),
      where('guestId', '==', data.guestId)
    )
  );
  const payload = {
    guestId: data.guestId,
    bookingId: data.bookingId,
    expectedAttendance: data.expectedAttendance,
    items: data.items,
    totalAmount: data.totalAmount,
    status: 'confirmed',
    updatedAt: new Date().toISOString(),
  };
  if (!existing.empty) {
    await updateDoc(existing.docs[0].ref, payload);
    return existing.docs[0].id;
  }
  const ref = await addDoc(collection(db, 'event_caterings'), {
    ...payload,
    createdAt: new Date().toISOString(),
  });
  return ref.id;
};

export const getCateringForBooking = async (bookingId: string): Promise<CateringSelection | null> => {
  const snap = await getDocs(query(collection(db, 'event_caterings'), where('bookingId', '==', bookingId)));
  if (snap.empty) return null;
  return { id: snap.docs[0].id, ...(snap.docs[0].data() as CateringSelection) };
};

// Single source of truth for a booking's money state.
// Always re-derives from the booking doc + the current catering selection,
// so My Activity / payment / catering screens can never show stale totals.
export const deriveBookingPaymentState = (
  booking: any,
  cateringSelectionTotal?: number
) => {
  const venueCost = Math.max(0, Number(booking.totalAmount || booking.venueCost || 0));
  const cateringTotal = Math.max(
    0,
    Number(booking.cateringTotal || cateringSelectionTotal || 0)
  );
  const combinedTotal = venueCost + cateringTotal;
  const depositRequired = Math.round(combinedTotal / 2);
  const amountPaid = Math.max(0, Number(booking.amountPaid || booking.paidAmount || 0));
  const balanceDue = Math.max(0, combinedTotal - amountPaid);
  const paymentStatus: 'none' | 'deposit_paid' | 'paid_in_full' =
    amountPaid >= combinedTotal ? 'paid_in_full' : amountPaid >= depositRequired ? 'deposit_paid' : 'none';
  return {
    venueCost,
    cateringTotal,
    combinedTotal,
    depositRequired,
    amountPaid,
    balanceDue,
    paymentStatus,
  };
};

// Called after a catering selection is saved: keeps booking totals in sync
// (headcount, combined total, deposit, remaining balance).
export const updateEventBookingCateringTotals = async (
  bookingId: string,
  opts: { expectedAttendance: number; cateringTotal: number }
) => {
  const snap = await getDoc(doc(db, 'event_bookings', bookingId));
  if (!snap.exists()) throw new Error('Booking not found');
  const b = snap.data() as any;
  const venueCost = Math.max(0, Number(b.totalAmount || b.venueCost || 0));
  const combinedTotal = venueCost + Math.max(0, opts.cateringTotal);
  const depositRequired = Math.round(combinedTotal / 2);
  const amountPaid = Math.max(0, Number(b.amountPaid || b.paidAmount || 0));
  const balanceDue = Math.max(0, combinedTotal - amountPaid);
  const paymentStatus = amountPaid >= combinedTotal ? 'paid_in_full' : amountPaid >= depositRequired ? 'deposit_paid' : 'none';
  await updateDoc(snap.ref, {
    expectedAttendance: opts.expectedAttendance,
    cateringTotal: Math.max(0, opts.cateringTotal),
    combinedTotal,
    depositRequired,
    balanceDue,
    paymentStatus,
  });
  return { combinedTotal, depositRequired, amountPaid, balanceDue, paymentStatus };
};

// Applied on every successful payment (deposit, balance, or full).
// amountPaid accumulates; balanceDue/paymentStatus are re-derived and the
// lifecycle status only ever moves forward (never downgrades an approved venue).
export const applyEventPayment = async (
  bookingId: string,
  amountPaidNow: number,
  opts: { paymentMethod: string; paymentReference: string; paymentMode: string }
) => {
  const bookingRef = doc(db, 'event_bookings', bookingId);
  await updateDoc(bookingRef, {
    amountPaid: increment(amountPaidNow),
    lastPaymentAt: new Date().toISOString(),
    lastPaymentAmountNow: amountPaidNow,
  });
  const snap = await getDoc(bookingRef);
  if (!snap.exists()) throw new Error('Booking not found');
  const b = snap.data() as any;
  const venueCost = Math.max(0, Number(b.totalAmount || b.venueCost || 0));
  const cateringTotal = Math.max(0, Number(b.cateringTotal || 0));
  const combinedTotal = venueCost + cateringTotal;
  const depositRequired = Math.round(combinedTotal / 2);
  const amountPaid = Math.max(0, Number(b.amountPaid || 0));
  const balanceDue = Math.max(0, combinedTotal - amountPaid);
  const paymentStatus = amountPaid >= combinedTotal ? 'paid_in_full' : amountPaid >= depositRequired ? 'deposit_paid' : 'none';
  const currentStatus = String(b.status || '').toLowerCase();
  const status = ['pending_payment', 'pending'].includes(currentStatus) ? 'confirmed' : b.status;
  await updateDoc(bookingRef, {
    balanceDue,
    paymentStatus,
    status,
    paymentMode: opts.paymentMode,
    paymentReference: opts.paymentReference,
    paymentMethod: opts.paymentMethod,
    paidAt: new Date().toISOString(),
  });
  return { combinedTotal, depositRequired, amountPaid, balanceDue, paymentStatus, status };
};

export type GuestActivity = {
  profile: any | null;
  eventBookings: any[];
  spaBookings: any[];
  tourBookings: any[];
  tableReservations: any[];
  invitations: any[];
  foodOrders: any[];
  catering: any[];
};

export const listenForGuestActivity = (
  guestId: string,
  callback: (activity: GuestActivity) => void
) => {
  const snapshotWithId = (snap: any) =>
    snap.docs.map((d: any) => ({ id: d.id, ...d.data() }));

  const state: GuestActivity = {
    profile: null,
    eventBookings: [],
    spaBookings: [],
    tourBookings: [],
    tableReservations: [],
    invitations: [],
    foodOrders: [],
    catering: [],
  };

  const publish = () => callback({ ...state });

  const eventUnsub = onSnapshot(
    query(collection(db, 'event_bookings'), where('guestId', '==', guestId)),
    (snap) => {
      state.eventBookings = snapshotWithId(snap);
      publish();
    }
  );
  const spaUnsub = onSnapshot(
    query(collection(db, 'spa_bookings'), where('guestId', '==', guestId)),
    (snap) => {
      state.spaBookings = snapshotWithId(snap);
      publish();
    }
  );
  const tourUnsub = onSnapshot(
    query(collection(db, 'tour_bookings'), where('guestId', '==', guestId)),
    (snap) => {
      state.tourBookings = snapshotWithId(snap);
      publish();
    }
  );
  const tableUnsub = onSnapshot(
    query(collection(db, 'table_reservations'), where('guestId', '==', guestId)),
    (snap) => {
      state.tableReservations = snapshotWithId(snap);
      publish();
    }
  );
  const inviteUnsub = onSnapshot(
    query(collection(db, 'event_invitations'), where('hostId', '==', guestId)),
    (snap) => {
      state.invitations = snapshotWithId(snap);
      publish();
    }
  );
  const cateringUnsub = onSnapshot(
    query(collection(db, 'event_caterings'), where('guestId', '==', guestId)),
    (snap) => {
      state.catering = snapshotWithId(snap);
      publish();
    }
  );
  const profileUnsub = onSnapshot(doc(db, 'users', guestId), (snap) => {
    state.profile = snap.exists() ? { id: snap.id, ...snap.data() } : null;
    publish();
  });

  const ordersRef = rtdbRef(rtdb, 'orders');
  const ordersUnsub = onValue(ordersRef, (snap) => {
    const data = snap.val();
    const orders = data ? Object.keys(data).map((key) => ({ id: key, ...data[key] })) : [];
    state.foodOrders = orders.filter((o: any) => o.guestId === guestId);
    publish();
  });

  return () => {
    eventUnsub();
    spaUnsub();
    tourUnsub();
    tableUnsub();
    inviteUnsub();
    cateringUnsub();
    profileUnsub();
    off(ordersRef);
  };
};