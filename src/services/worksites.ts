// src/services/worksites.ts — Worksites + authoritative 4-check geofence.

import { db } from '@/services/firebase-services';
import {
  collection, doc, getDoc, getDocs, setDoc, updateDoc, query, where,
} from 'firebase/firestore';
import {
  DEFAULT_ATTENDANCE_CONFIG, type AttendanceConfig, type GeofenceFix,
  type GeofenceResult, type Worksite,
} from '@/types/workforce';
import { haversineMeters } from '@/services/attendance';

export async function getAttendanceConfig(): Promise<AttendanceConfig> {
  try {
    const snap = await getDoc(doc(db, 'settings', 'attendance_config'));
    if (!snap.exists()) return DEFAULT_ATTENDANCE_CONFIG;
    const d = snap.data() as Partial<AttendanceConfig>;
    return {
      timezone: d.timezone || DEFAULT_ATTENDANCE_CONFIG.timezone,
      clockInBeforeMinutes: Number.isFinite(d.clockInBeforeMinutes)
        ? Number(d.clockInBeforeMinutes)
        : DEFAULT_ATTENDANCE_CONFIG.clockInBeforeMinutes,
      clockInAfterMinutes: Number.isFinite(d.clockInAfterMinutes)
        ? Number(d.clockInAfterMinutes)
        : DEFAULT_ATTENDANCE_CONFIG.clockInAfterMinutes,
      autoCloseGraceMinutes: Number.isFinite(d.autoCloseGraceMinutes)
        ? Number(d.autoCloseGraceMinutes)
        : DEFAULT_ATTENDANCE_CONFIG.autoCloseGraceMinutes,
      maxAccuracyM: Number.isFinite(d.maxAccuracyM)
        ? Number(d.maxAccuracyM)
        : DEFAULT_ATTENDANCE_CONFIG.maxAccuracyM,
      maxFixAgeMs: Number.isFinite(d.maxFixAgeMs)
        ? Number(d.maxFixAgeMs)
        : DEFAULT_ATTENDANCE_CONFIG.maxFixAgeMs,
    };
  } catch {
    return DEFAULT_ATTENDANCE_CONFIG;
  }
}

export async function listActiveWorksites(): Promise<Worksite[]> {
  try {
    const snap = await getDocs(query(collection(db, 'worksites'), where('active', '==', true)));
    return snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Worksite, 'id'>) }));
  } catch {
    return [];
  }
}

export async function getWorksite(id: string): Promise<Worksite | null> {
  try {
    const snap = await getDoc(doc(db, 'worksites', id));
    if (!snap.exists()) return null;
    return { id: snap.id, ...(snap.data() as Omit<Worksite, 'id'>) };
  } catch {
    return null;
  }
}

export async function getDefaultWorksite(): Promise<Worksite | null> {
  const list = await listActiveWorksites();
  if (list.length === 0) return null;
  return list.find((w) => w.id === 'dut_ritson') || list[0];
}

export async function upsertWorksite(w: Omit<Worksite, 'createdAt' | 'updatedAt'> & Partial<Pick<Worksite, 'createdAt'>>): Promise<void> {
  const now = new Date().toISOString();
  const ref = doc(db, 'worksites', w.id);
  const existing = await getDoc(ref);
  if (existing.exists()) {
    await updateDoc(ref, { ...w, updatedAt: now });
  } else {
    await setDoc(ref, { ...w, createdAt: w.createdAt || now, updatedAt: now });
  }
}

/**
 * 4-check geofence (locked decision #8):
 * distance ≤ radius AND accuracy ≤ maxAccuracy AND age ≤ maxAge
 * AND (distance − accuracy) ≤ radius
 */
export function evaluateGeofence(
  worksite: Pick<Worksite, 'lat' | 'lng' | 'radiusM'>,
  fix: GeofenceFix,
  limits: { maxAccuracyM: number; maxFixAgeMs: number },
): GeofenceResult {
  const distanceM = haversineMeters(fix.lat, fix.lng, worksite.lat, worksite.lng);
  const accuracy = fix.accuracyM;
  const accuracyOk = accuracy !== null && accuracy <= limits.maxAccuracyM && accuracy >= 0;
  const ageOk = fix.ageMs >= 0 && fix.ageMs <= limits.maxFixAgeMs;
  const withinRadius = distanceM <= worksite.radiusM;
  const margin =
    accuracy !== null && accuracy > 0
      ? distanceM - accuracy <= worksite.radiusM
      : distanceM <= worksite.radiusM;
  const marginOk = accuracy === null ? false : margin;

  if (!ageOk) {
    return { ok: false, distanceM, withinRadius, accuracyOk, ageOk, marginOk, blockedReason: 'Location fix is too old. Move and try again.' };
  }
  if (!accuracyOk) {
    return { ok: false, distanceM, withinRadius, accuracyOk, ageOk, marginOk, blockedReason: `GPS accuracy is too low (max ${limits.maxAccuracyM}m).` };
  }
  if (!withinRadius) {
    return { ok: false, distanceM, withinRadius, accuracyOk, ageOk, marginOk, blockedReason: `You are ${Math.round(distanceM)}m from the worksite (max ${worksite.radiusM}m). Off-site punches are blocked.` };
  }
  if (!marginOk) {
    return { ok: false, distanceM, withinRadius, accuracyOk, ageOk, marginOk, blockedReason: 'Location accuracy is not reliable enough to confirm you are on site.' };
  }
  return { ok: true, distanceM, withinRadius, accuracyOk, ageOk, marginOk };
}
