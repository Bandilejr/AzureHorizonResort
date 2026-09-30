/**
 * Phone-based clock-in / clock-out.
 *
 * Identity is ALWAYS auth.currentUser.uid (no staff picker).
 * Off-site punches are BLOCKED (locked decision #1).
 * GPS failure returns an explicit error — never fabricated campus coordinates.
 */
import { Platform } from 'react-native';
import { db } from '@/services/firebase-services';
import {
  collection,
  query,
  where,
  orderBy,
  limit,
  onSnapshot,
  getDocs,
} from 'firebase/firestore';

/** Max distance from the hotel for a punch to count as on-site (legacy hotel screens). */
export const ATTENDANCE_RADIUS_METERS = 400;

// Phase 1 (§13): campus coordinates live ONLY in the worksites collection
// (seeded by scripts/seed_workforce_identity.js) — never scattered in client code.

export type PunchType = 'in' | 'out';

export interface PunchRecord {
  id: string;
  punchType: PunchType;
  timestamp: any; // Firestore Timestamp (server)
  isoTime: string; // ISO mirror written at punch time (easy rendering everywhere)
  staffUid: string;
  staffName: string;
  lat: number;
  lng: number;
  accuracyM: number | null;
  distanceM: number;
  withinRadius: boolean;
}

export interface PositionFix {
  lat: number;
  lng: number;
  accuracyM: number | null;
}

async function getNativePosition(): Promise<PositionFix> {
  const { getCurrentPositionAsync, getLastKnownPositionAsync, Accuracy } = await import('expo-location');

  // A cached "last known" fix can be hours old and miles away (e.g. the phone's
  // fix from the previous day) — trusting it falsely reports the worker as
  // off-site. Only use it if it is genuinely fresh (under 60 seconds).
  const FRESH_MS = 60_000;
  const now = Date.now();
  try {
    const lastKnown = await getLastKnownPositionAsync();
    if (lastKnown && now - lastKnown.timestamp < FRESH_MS) {
      return {
        lat: lastKnown.coords.latitude,
        lng: lastKnown.coords.longitude,
        accuracyM: lastKnown.coords.accuracy ?? null,
      };
    }
  } catch {}

  try {
    // Force a real fix with High accuracy; give GPS enough time to settle.
    const posPromise = getCurrentPositionAsync({ accuracy: Accuracy.High });
    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('Location timeout')), 12000)
    );
    const pos = await Promise.race([posPromise, timeoutPromise]);
    return {
      lat: pos.coords.latitude,
      lng: pos.coords.longitude,
      accuracyM: pos.coords.accuracy ?? null,
    };
  } catch (e) {
    throw new Error(
      'Location unavailable. Enable GPS and try again — punches without a real fix are rejected.',
    );
  }
}

function getWebPosition(): Promise<PositionFix> {
  return new Promise((resolve, reject) => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      reject(new Error('Geolocation not supported by this browser'));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) =>
        resolve({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracyM: pos.coords.accuracy ?? null,
        }),
      (err) => reject(new Error(err.message)),
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 10000 }
    );
  });
}

export async function getCurrentPosition(): Promise<PositionFix> {
  if (Platform.OS === 'web') return getWebPosition();
  return getNativePosition();
}

function toRadians(deg: number): number {
  return (deg * Math.PI) / 180;
}

/** Haversine distance in meters between two lat/lng points. (For client-side indication only; server is authoritative.) */
export function haversineMeters(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const R = 6371000;
  const dLat = toRadians(lat2 - lat1);
  const dLng = toRadians(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function formatDistance(meters: number): string {
  if (meters < 1000) return `${Math.round(meters)} m`;
  return `${(meters / 1000).toFixed(2)} km`;
}

/** Geofence centre used by the server (read for in-app display). */
export async function getHotelGeofence(): Promise<{ lat: number; lng: number; radiusM: number } | null> {
  const { getDoc, doc } = await import('firebase/firestore');
  try {
    const snap = await getDoc(doc(db, 'settings', 'attendance_geofence'));
    if (!snap.exists()) return null;
    const d = snap.data() as any;
    if (typeof d.lat !== 'number' || typeof d.lng !== 'number') return null;
    return { lat: d.lat, lng: d.lng, radiusM: Number(d.radiusM) || ATTENDANCE_RADIUS_METERS };
  } catch {
    return null;
  }
}

function startOfToday(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

/**
 * Live subscription to today's punches (single-field query - no composite index
 * needed; personal view filters client-side).
 */
/**
 * Live subscription to today's punches for the staff dashboard.
 * Returns ALL punches (all roster members) so managers see the full team.
 * The component filters by selected roster member for individual views.
 */
export function listenTodaysPunches(
  onPunches: (punches: PunchRecord[]) => void,
  onError?: (err: Error) => void
) {
  const todayIso = startOfToday().toISOString();
  const q = query(
    collection(db, 'punch_records'),
    limit(200)
  );
  return onSnapshot(
    q,
    (snap) => {
      const todayStartMs = startOfToday().getTime();
      const punches: PunchRecord[] = snap.docs
        .map((d) => {
          const data = d.data() as any;
          return {
            id: d.id,
            ...data,
            isoTime: data.isoTime || (data.timestamp?.toDate ? data.timestamp.toDate().toISOString() : new Date().toISOString()),
          };
        })
        .filter((p) => {
          const pMs = p.isoTime ? new Date(p.isoTime).getTime() : (p.timestamp?.toDate ? p.timestamp.toDate().getTime() : Date.now());
          return pMs >= todayStartMs;
        })
        .sort((a, b) => {
          const tA = a.isoTime ? new Date(a.isoTime).getTime() : 0;
          const tB = b.isoTime ? new Date(b.isoTime).getTime() : 0;
          return tB - tA;
        });
      onPunches(punches);
    },
    (err) => onError?.(err as Error)
  );
}

export function latestClockState(punches: PunchRecord[]): PunchType | null {
  if (punches.length === 0) return null;
  return punches[0].punchType;
}

export function punchTimeLabel(p: PunchRecord): string {
  const t = p.isoTime ? new Date(p.isoTime) : null;
  if (!t || isNaN(t.getTime())) return '--:--';
  return t.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}