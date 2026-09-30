// src/services/device.ts — Stable device registry (Expo SDK 57: no installationId).

import * as SecureStore from 'expo-secure-store';
import * as Application from 'expo-application';
import * as Device from 'expo-device';
import { Platform } from 'react-native';
import { auth, db } from '@/services/firebase-services';
import {
  collection, doc, getDocs, query, setDoc, updateDoc, where, writeBatch, addDoc,
} from 'firebase/firestore';
import type { DeviceRecord, DeviceResetRequest } from '@/types/workforce';

const DEVICE_ID_KEY = 'ff_device_id_v1';

let cachedDeviceId: string | null = null;

function randomHex(bytes = 16): string {
  const arr = new Uint8Array(bytes);
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    crypto.getRandomValues(arr);
  } else {
    for (let i = 0; i < bytes; i++) arr[i] = Math.floor(Math.random() * 256);
  }
  return Array.from(arr, (b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Install-scoped device id: SecureStore-persisted random UUID.
 * Survives app upgrades; changes on uninstall/reinstall (acceptable for UC).
 */
export async function getStableDeviceId(): Promise<string> {
  if (cachedDeviceId) return cachedDeviceId;
  try {
    const existing = await SecureStore.getItemAsync(DEVICE_ID_KEY);
    if (existing) {
      cachedDeviceId = existing;
      return existing;
    }
  } catch { /* SecureStore unavailable on web fallback */ }
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    cachedDeviceId = (crypto as Crypto).randomUUID();
  } else {
    cachedDeviceId = `${randomHex(4)}-${randomHex(2)}-${randomHex(2)}-${randomHex(2)}-${randomHex(6)}`;
  }
  try {
    await SecureStore.setItemAsync(DEVICE_ID_KEY, cachedDeviceId!);
  } catch {
    // web / emulator: keep in-memory for session
  }
  return cachedDeviceId!;
}

export function devicePlatformLabel(): string {
  return Platform.OS;
}

export function deviceModelLabel(): string {
  return Device.modelName || Application.nativeApplicationVersion || 'unknown';
}

async function findActiveDevice(uid: string): Promise<DeviceRecord | null> {
  const snap = await getDocs(query(collection(db, 'devices'), where('employeeUid', '==', uid), where('status', '==', 'active')));
  const docs = snap.docs;
  if (docs.length === 0) return null;
  return { id: docs[0].id, ...(docs[0].data() as Omit<DeviceRecord, 'id'>) };
}

/**
 * Ensure exactly one ACTIVE device per employee (locked decision #7).
 * Returns whether this is a first-time enrollment.
 */
export async function ensureDeviceEnrollment(): Promise<{ deviceId: string; isFirstEnrollment: boolean; device: DeviceRecord }> {
  const user = auth.currentUser;
  if (!user) throw new Error('You must be signed in to register a device.');
  const deviceId = await getStableDeviceId();
  const now = new Date().toISOString();
  const active = await findActiveDevice(user.uid);

  if (active && active.deviceId === deviceId) {
    await updateDoc(doc(db, 'devices', active.id), { lastSeenAt: now, platform: devicePlatformLabel(), model: deviceModelLabel() }).catch(() => {});
    return { deviceId, isFirstEnrollment: false, device: { ...active, lastSeenAt: now } };
  }

  if (active && active.deviceId !== deviceId) {
    const resetSnap = await getDocs(
      query(collection(db, 'deviceResetRequests'), where('employeeUid', '==', user.uid), where('status', '==', 'pending')),
    );
    if (!resetSnap.empty) {
      return { deviceId, isFirstEnrollment: false, device: { ...active, status: 'pending_reset' } };
    }
    throw new Error('Another device is registered for your account. Request a device reset from your administrator.');
  }

  const newRecord: Omit<DeviceRecord, 'id'> = {
    employeeUid: user.uid,
    deviceId,
    platform: devicePlatformLabel(),
    model: deviceModelLabel(),
    status: 'active',
    enrolledAt: now,
    lastSeenAt: now,
  };
  const id = `dev_${user.uid}_${deviceId.slice(0, 8)}`;
  await setDoc(doc(db, 'devices', id), newRecord, { merge: true });
  return { deviceId, isFirstEnrollment: true, device: { id, ...newRecord } };
}

export async function verifyDeviceBound(boundDeviceId: string | null): Promise<{ ok: boolean; deviceId: string; enrolled: boolean }> {
  const user = auth.currentUser;
  if (!user) throw new Error('You must be signed in.');
  const deviceId = await getStableDeviceId();
  if (!boundDeviceId) {
    const { isFirstEnrollment } = await ensureDeviceEnrollment();
    return { ok: true, deviceId, enrolled: true };
  }
  if (boundDeviceId !== deviceId) {
    return { ok: false, deviceId, enrolled: false };
  }
  await ensureDeviceEnrollment();
  return { ok: true, deviceId, enrolled: true };
}

export async function requestDeviceReset(reason: string): Promise<string> {
  const user = auth.currentUser;
  if (!user) throw new Error('You must be signed in.');
  const current = await findActiveDevice(user.uid);
  const newDeviceId = await getStableDeviceId();
  const payload: Omit<DeviceResetRequest, 'id'> = {
    employeeUid: user.uid,
    oldDeviceId: current?.deviceId || 'unknown',
    newDeviceId,
    reason,
    status: 'pending',
    requestedAt: new Date().toISOString(),
  };
  const ref = await addDoc(collection(db, 'deviceResetRequests'), payload);
  if (current) {
    await updateDoc(doc(db, 'devices', current.id), { status: 'pending_reset' }).catch(() => {});
  }
  return ref.id;
}

export async function approveDeviceReset(requestId: string): Promise<void> {
  const user = auth.currentUser;
  if (!user) throw new Error('You must be signed in.');
  const reqRef = doc(db, 'deviceResetRequests', requestId);
  const reqSnap = await import('firebase/firestore').then((m) => m.getDoc(reqRef));
  if (!reqSnap.exists()) throw new Error('Device reset request not found.');
  const resetDoc = reqSnap.data() as DeviceResetRequest;

  const batch = writeBatch(db);
  batch.update(reqRef, {
    status: 'approved',
    decidedAt: new Date().toISOString(),
    decidedBy: user.uid,
  });
  const actives = await getDocs(
    query(
      collection(db, 'devices'),
      where('employeeUid', '==', resetDoc.employeeUid),
      where('status', 'in', ['active', 'pending_reset']),
    ),
  );
  actives.docs.forEach((d) => {
    batch.update(d.ref, {
      status: 'revoked',
      revokedAt: new Date().toISOString(),
      revokedBy: user.uid,
    });
  });
  await batch.commit();
}

export async function listDeviceResetRequests(): Promise<(DeviceResetRequest & { id: string })[]> {
  const snap = await getDocs(query(collection(db, 'deviceResetRequests'), where('status', '==', 'pending')));
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<DeviceResetRequest, 'id'>) }));
}

export async function listDevicesForEmployee(uid: string): Promise<DeviceRecord[]> {
  const snap = await getDocs(query(collection(db, 'devices'), where('employeeUid', '==', uid)));
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<DeviceRecord, 'id'>) }));
}
