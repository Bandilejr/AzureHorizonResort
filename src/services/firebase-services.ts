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
  getDocs,
  updateDoc,
  deleteDoc,
  serverTimestamp,
  Timestamp
} from 'firebase/firestore';
import ReactNativeAsyncStorage from '@react-native-async-storage/async-storage';

// @ts-ignore - Bypassing TypeScript dictionary glitch for React Native persistence
import { initializeAuth, getReactNativePersistence, signInWithEmailAndPassword, signOut } from 'firebase/auth';

import { getStorage, ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { getDatabase } from 'firebase/database';
import { getFunctions, httpsCallable } from 'firebase/functions';

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

// --- CLOUD FUNCTIONS WRAPPERS ---

export const generateRoomCredential = httpsCallable<
  { roomId: string; checkInDate: string; checkOutDate: string; bookingId: string },
  { credential: string; expiresIn: number }
>(functions, "generateRoomCredential");

export const generateInvitationQR = httpsCallable<
  { eventId: string; inviteeEmail: string; inviteeName: string },
  { invitationId: string; qrCode: string; inviteeEmail: string; inviteeName: string }
>(functions, "generateInvitationQR");

export const validateAttendeeQR = httpsCallable<
  { qrPayload: string },
  { valid: boolean; message: string; reason?: string; attendee?: any }
>(functions, "validateAttendeeQR");

export const generateLoyaltyQR = httpsCallable<
  {},
  { qrPayload: any; rotateInterval: number }
>(functions, "generateLoyaltyQR");

export const validateLoyaltyQR = httpsCallable<
  { qrPayload: string },
  { valid: boolean; guest?: any; reason?: string; message?: string }
>(functions, "validateLoyaltyQR");

export const processDamageClaim = httpsCallable<
  { inspectionId: string; damageItems: any[]; assignedTechnicianId?: string },
  { damageRecordId: string; invoiceId: string; totalCost: number; status: string }
>(functions, "processDamageClaim");

export const processRefund = httpsCallable<
  { refundRequestId: string; action: "approve" | "reject"; rejectionReason?: string },
  { success: boolean; status: string; refundAmount?: number }
>(functions, "processRefund");

// --- HELPER FUNCTIONS FOR USER LOOKUPS ---

const findUserProfileByUid = async (uid: string) => {
  const usersRef = collection(db, 'users');
  const q = query(usersRef, where('uid', '==', uid));
  const querySnapshot = await getDocs(q);
  if (!querySnapshot.empty) {
    const userDoc = querySnapshot.docs[0];
    return { ...userDoc.data(), id: userDoc.id };
  }
  return null;
};

const findUserProfileByEmail = async (email: string) => {
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
      return { uid: user.uid, ...uidProfile };
    }
    
    // Fallback to email lookup
    const emailProfile = user.email ? await findUserProfileByEmail(user.email) : null;
    if (emailProfile) {
      return { uid: user.uid, ...emailProfile };
    }
    
    throw new Error("User profile not found in database.");
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

export const uploadImage = async (uri: string, path: string) => {
  try {
    const response = await fetch(uri);
    const blob = await response.blob();
    const storageRef = ref(storage, path);
    const snapshot = await uploadBytes(storageRef, blob);
    const downloadUrl = await getDownloadURL(snapshot.ref);
    return { url: downloadUrl };
  } catch (error) {
    console.error("Error uploading image: ", error);
    throw error;
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

export const awardLoyaltyPoints = async (
  userDocId: string,
  guestId: string,
  points: number,
  reason: string
) => {
  const userRef = doc(db, 'users', userDocId);
  const userSnap = await getDoc(userRef);
  if (!userSnap.exists()) {
    throw new Error('User profile not found.');
  }
  const userData = userSnap.data() as Record<string, any>;
  const newPoints = (userData.loyaltyPoints || 0) + points;
  await updateDoc(userRef, { loyaltyPoints: newPoints });
  await addDoc(collection(db, 'loyalty_logs'), {
    guestId,
    points,
    reason,
    createdAt: new Date().toISOString(),
  });
return newPoints;
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
  ratings: { venue: number; catering: number; staff: number; setup: number };
  comments: string;
}) => {
  const docRef = await addDoc(collection(db, 'event_feedback'), {
    ...feedbackData,
    submittedAt: serverTimestamp(),
  });
  return docRef;
};

export const getEventFeedback = async (eventId: string) => {
  const q = query(collection(db, 'event_feedback'), where('eventId', '==', eventId));
  const snapshot = await getDocs(q);
  return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
};

// --- LIVE COMPLAINTS (UC33) ---

export const createLiveComplaint = async (complaintData: {
  eventId: string;
  guestId: string;
  category: string;
  location: string;
  description: string;
  urgency: 'low' | 'medium' | 'high' | 'critical';
}) => {
  const docRef = await addDoc(collection(db, 'live_complaints'), {
    ...complaintData,
    status: 'open',
    createdAt: serverTimestamp(),
  });
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
  await updateDoc(complaintRef, {
    status,
    assignedTo: assignedTo || null,
    updatedAt: serverTimestamp(),
    ...(status === 'resolved' && { resolvedAt: serverTimestamp() }),
  });
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
  checklistItems: Array<{ item: string; status: 'passed' | 'failed' | 'na'; notes?: string; photos?: string[] }>;
  overallStatus: 'approved' | 'needs_attention' | 'failed';
}) => {
  const docRef = await addDoc(collection(db, 'event_inspections'), {
    ...inspectionData,
    completedAt: serverTimestamp(),
    createdAt: serverTimestamp(),
  });
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
  items: Array<{ item: string; description: string; estimatedCost: number; photos?: string[] }>;
  totalCost: number;
  assignedTechnicianId?: string;
}) => {
  const docRef = await addDoc(collection(db, 'damage_records'), {
    ...damageData,
    status: 'recorded',
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
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
  status: 'recorded' | 'in_repair' | 'resolved',
  assignedTechnicianId?: string
) => {
  const recordRef = doc(db, 'damage_records', recordId);
  await updateDoc(recordRef, {
    status,
    assignedTechnicianId: assignedTechnicianId || null,
    updatedAt: serverTimestamp(),
    ...(status === 'resolved' && { resolvedAt: serverTimestamp() }),
  });
};

// --- REFUND REQUESTS (UC34) ---

export const createRefundRequest = async (refundData: {
  eventId: string;
  guestId: string;
  reason: string;
  requestedAmount: number;
  incidentLogId?: string;
}) => {
  const docRef = await addDoc(collection(db, 'refund_requests'), {
    ...refundData,
    status: 'pending',
    createdAt: serverTimestamp(),
  });
  return docRef;
};

export const getRefundRequests = async (eventId?: string) => {
  let q = collection(db, 'refund_requests');
  if (eventId) {
    q = query(q, where('eventId', '==', eventId));
  }
  const snapshot = await getDocs(q);
  return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
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
  const requestRef = doc(db, 'refund_requests', requestId);
  await updateDoc(requestRef, {
    status,
    approvedBy: approvedBy || null,
    rejectedBy: status === 'rejected' ? (approvedBy || null) : null,
    rejectionReason: rejectionReason || null,
    updatedAt: serverTimestamp(),
    ...(status === 'approved' ? { approvedAt: serverTimestamp() } : {}),
    ...(status === 'rejected' ? { rejectedAt: serverTimestamp() } : {}),
  });
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
}) => {
  const docRef = await addDoc(collection(db, 'notifications'), {
    ...notificationData,
    read: false,
    createdAt: serverTimestamp(),
  });
  return docRef;
};

export const listenForNotifications = (
  userId: string,
  callback: (notifications: any[]) => void
) => {
  const q = query(collection(db, 'notifications'), where('userId', '==', userId));
  const unsubscribe = onSnapshot(q, (snapshot) => {
    const notifications = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    callback(notifications);
  });
  return unsubscribe;
};

export const markNotificationRead = async (notificationId: string) => {
  const notifRef = doc(db, 'notifications', notificationId);
  await updateDoc(notifRef, { read: true });
};

export const redeemLoyaltyReward = async (
  userDocId: string,
  guestId: string,
  reward: { title: string; pts: number }
) => {
  const userRef = doc(db, 'users', userDocId);
  const userSnap = await getDoc(userRef);
  if (!userSnap.exists()) {
    throw new Error('User profile not found.');
  }
  const userData = userSnap.data() as Record<string, any>;
  const currentPoints = userData.loyaltyPoints || 0;
  if (currentPoints < reward.pts) {
    throw new Error('Not enough loyalty points.');
  }
  const newPoints = currentPoints - reward.pts;
  await updateDoc(userRef, { loyaltyPoints: newPoints });
  await addDoc(collection(db, 'loyalty_logs'), {
    guestId,
    points: -reward.pts,
    reason: `Redeemed: ${reward.title}`,
    createdAt: new Date().toISOString(),
  });
  return newPoints;
};