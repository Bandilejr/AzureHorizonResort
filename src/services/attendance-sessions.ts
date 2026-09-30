// src/services/attendance-sessions.ts — Session state machine + 13-step clock-in validation.

import { auth, db, recordAttendancePunch } from '@/services/firebase-services';
import {
  collection, doc, getDocs, limit, onSnapshot, query, setDoc,
  updateDoc, where, writeBatch,
} from 'firebase/firestore';
import {
  DEFAULT_ATTENDANCE_CONFIG,
  type AttendanceConfig,
  type AttendanceSession,
  type AttendanceSessionStatus,
} from '@/types/workforce';
import { requireWorkforceIdentity, type WorkforceIdentity } from '@/services/identity';
import { evaluateGeofence, getAttendanceConfig, getDefaultWorksite, getWorksite } from '@/services/worksites';
import { ensureDeviceEnrollment, verifyDeviceBound } from '@/services/device';
import { getCurrentPosition, type PositionFix } from '@/services/attendance';

function requireAuthUser() {
  const u = auth.currentUser;
  if (!u) throw new Error('You must be signed in to clock in/out.');
  return u;
}

function localDateKey(d: Date): string {
  // Prefer worksite timezone wall-clock date (Africa/Johannesburg = SAST, UTC+2).
  try {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Africa/Johannesburg',
      year: 'numeric', month: '2-digit', day: '2-digit',
    }).formatToParts(d);
    const y = parts.find((p) => p.type === 'year')?.value || '';
    const m = parts.find((p) => p.type === 'month')?.value || '';
    const day = parts.find((p) => p.type === 'day')?.value || '';
    if (y && m && day) return `${y}-${m}-${day}`;
  } catch { /* fall through */ }
  const x = new Date(d);
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
}

function atLocalTimeOnDate(dateKey: string, hhmm: string): Date | null {
  const [h, m] = hhmm.split(':').map(Number);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return null;
  // Interpret as Africa/Johannesburg wall clock (UTC+2) without DST in SA.
  const [y, mo, d] = dateKey.split('-').map(Number);
  if (!Number.isFinite(y) || !Number.isFinite(mo) || !Number.isFinite(d)) return null;
  return new Date(Date.UTC(y, mo - 1, d, h - 2, m, 0));
}

export type ClockAction = 'in' | 'out';

export interface ClockResult {
  sessionId: string;
  action: ClockAction;
  distanceM: number;
  withinRadius: boolean;
  session: AttendanceSession;
}

async function findOpenSession(uid: string, dateKey: string): Promise<AttendanceSession | null> {
  const snap = await getDocs(
    query(
      collection(db, 'attendance_sessions'),
      where('employeeUid', '==', uid),
      where('shiftDate', '==', dateKey),
      where('status', 'in', ['scheduled', 'clocked_in']),
      limit(5),
    ),
  );
  const docs = snap.docs;
  if (docs.length === 0) return null;
  const open = docs.find((d) => (d.data() as AttendanceSession).status === 'clocked_in')
    || docs.find((d) => (d.data() as AttendanceSession).status === 'scheduled');
  if (!open) return null;
  return { id: open.id, ...(open.data() as Omit<AttendanceSession, 'id'>) };
}

async function createSession(
  id: WorkforceIdentity,
  worksiteId: string,
  dateKey: string,
  status: AttendanceSessionStatus = 'scheduled',
): Promise<AttendanceSession> {
  const now = new Date().toISOString();
  const session: AttendanceSession = {
    id: `att_${id.uid}_${dateKey}`,
    employeeUid: id.uid,
    employeeId: id.employeeId,
    worksiteId,
    shiftDate: dateKey,
    status,
    exceptionTypes: [],
    updatedAt: now,
    createdAt: now,
  };
  await setDoc(doc(db, 'attendance_sessions', session.id), session, { merge: true });
  return session;
}

/**
 * 13-step clock-in validation (ordered). Throws Error with user-facing message.
 */
async function validateClockIn(
  identity: WorkforceIdentity,
  config: AttendanceConfig,
): Promise<{ worksiteId: string; dateKey: string; fix: PositionFix; deviceCheck: { ok: boolean; deviceId: string }; geofence: ReturnType<typeof evaluateGeofence>; session: AttendanceSession }> {
  // 1–2: auth + workforce already enforced by requireWorkforceIdentity
  const worksite = identity.worksiteId ? await getWorksite(identity.worksiteId) : await getDefaultWorksite();
  if (!worksite) throw new Error('No worksite is configured for attendance. Contact your administrator.');
  if (!worksite.active) throw new Error('Your assigned worksite is inactive.');

  const dateKey = localDateKey(new Date());

  // 3: open session check (no double clock-in)
  const open = await findOpenSession(identity.uid, dateKey);
  if (open && open.status === 'clocked_in') {
    throw new Error('You are already clocked in for this shift.');
  }

  // 4: inactive employee
  if (identity.active === false) throw new Error('Your employee account is inactive.');

  // 5: device enrollment / binding
  const enrolled = await ensureDeviceEnrollment();
  const deviceCheck = await verifyDeviceBound(identity.deviceBinding || enrolled.deviceId);
  if (!deviceCheck.ok) {
    throw new Error('This device is not authorized for your account. Request a device reset from your administrator.');
  }

  // 6: clock window (15 before → 30 after shift start; open punches allowed outside with exception)
  const clockAt = Date.now();
  let exceptionTypes: string[] = [];
  if (open?.scheduledStart) {
    const start = atLocalTimeOnDate(dateKey, open.scheduledStart);
    if (start) {
      const beforeMs = config.clockInBeforeMinutes * 60_000;
      const afterMs = config.clockInAfterMinutes * 60_000;
      if (clockAt < start.getTime() - beforeMs) {
        throw new Error(`You can clock in up to ${config.clockInBeforeMinutes} minutes before your shift starts.`);
      }
      if (clockAt > start.getTime() + afterMs) {
        exceptionTypes = ['late_arrival'];
      }
    }
  }

  // 7: GPS fix (no campus fallback — explicit failure)
  const fix = await getCurrentPosition();
  const ageMs = 0; // live high-accuracy fix from getCurrentPosition
  // 8–11: 4-check geofence
  const geofence = evaluateGeofence(
    { lat: worksite.lat, lng: worksite.lng, radiusM: worksite.radiusM },
    { lat: fix.lat, lng: fix.lng, accuracyM: fix.accuracyM, ageMs },
    { maxAccuracyM: config.maxAccuracyM || worksite.maxAccuracyM, maxFixAgeMs: config.maxFixAgeMs || worksite.maxFixAgeMs },
  );
  if (!geofence.ok) {
    throw new Error(geofence.blockedReason || 'You must be on site to clock in. Off-site punches are blocked.');
  }

  // 12: ensure session exists
  const session = open || (await createSession(identity, worksite.id, dateKey, 'scheduled'));

  // 13: ready
  return { worksiteId: worksite.id, dateKey, fix, deviceCheck, geofence, session: { ...session, exceptionTypes } };
}

export async function clockIn(): Promise<ClockResult> {
  const identity = await requireWorkforceIdentity();
  const config = await getAttendanceConfig();
  const v = await validateClockIn(identity, config);
  const user = requireAuthUser();

  const punchRes = await recordAttendancePunch({
    punchType: 'in',
    lat: v.fix.lat,
    lng: v.fix.lng,
    accuracyM: v.fix.accuracyM,
    staffName: identity.displayName,
    deviceId: v.deviceCheck.deviceId,
    worksiteId: v.worksiteId,
    blockOffsite: true,
    deviceMatchPassed: v.deviceCheck.ok,
    isFirstTimeEnrollment: false,
    biometricPassed: false,
    biometricMethod: 'none',
    overallStatus: 'clocked-in',
  });

  const now = new Date().toISOString();
  const session: AttendanceSession = {
    ...v.session,
    worksiteId: v.worksiteId,
    status: 'clocked_in',
    clockInAt: now,
    clockInDistanceM: punchRes.data.distanceM,
    deviceId: v.deviceCheck.deviceId,
    deviceMatchPassed: true,
    exceptionTypes: Array.from(new Set([...(v.session.exceptionTypes || []), ...(punchRes.data.withinRadius ? [] : ['outside_geofence'])])),
    lastPunchType: 'in',
    updatedAt: now,
  };
  await setDoc(doc(db, 'attendance_sessions', session.id), session, { merge: true });
  await updateDoc(doc(db, 'users', user.uid), { deviceBinding: v.deviceCheck.deviceId, worksiteId: v.worksiteId, updatedAt: now }).catch(() => {});

  return {
    sessionId: session.id,
    action: 'in',
    distanceM: punchRes.data.distanceM,
    withinRadius: punchRes.data.withinRadius,
    session,
  };
}

export async function clockOut(): Promise<ClockResult> {
  const identity = await requireWorkforceIdentity();
  const config = await getAttendanceConfig();
  const dateKey = localDateKey(new Date());
  const open = await findOpenSession(identity.uid, dateKey);
  if (!open || open.status !== 'clocked_in') {
    throw new Error('You are not clocked in.');
  }

  const worksite = await getWorksite(open.worksiteId);
  if (!worksite) throw new Error('Assigned worksite not found for this session.');

  const fix = await getCurrentPosition();
  const geofence = evaluateGeofence(
    worksite,
    { lat: fix.lat, lng: fix.lng, accuracyM: fix.accuracyM, ageMs: 0 },
    { maxAccuracyM: config.maxAccuracyM, maxFixAgeMs: config.maxFixAgeMs },
  );
  if (!geofence.ok) {
    throw new Error(geofence.blockedReason || 'You must be on site to clock out. Off-site punches are blocked.');
  }

  const deviceCheck = await verifyDeviceBound(identity.deviceBinding);
  if (!deviceCheck.ok) {
    throw new Error('Device mismatch. Clock-out blocked. Request a device reset.');
  }

  const punchRes = await recordAttendancePunch({
    punchType: 'out',
    lat: fix.lat,
    lng: fix.lng,
    accuracyM: fix.accuracyM,
    staffName: identity.displayName,
    deviceId: deviceCheck.deviceId,
    worksiteId: open.worksiteId,
    geofence: { lat: worksite.lat, lng: worksite.lng, radiusM: worksite.radiusM },
    blockOffsite: true,
    deviceMatchPassed: true,
    biometricPassed: false,
    biometricMethod: 'none',
    overallStatus: 'clocked-out',
  });

  const now = new Date().toISOString();
  const session: AttendanceSession = {
    ...open,
    status: 'clocked_out',
    clockOutAt: now,
    clockOutDistanceM: punchRes.data.distanceM,
    deviceMatchPassed: true,
    lastPunchType: 'out',
    updatedAt: now,
  };
  await setDoc(doc(db, 'attendance_sessions', session.id), session, { merge: true });

  return {
    sessionId: session.id,
    action: 'out',
    distanceM: punchRes.data.distanceM,
    withinRadius: punchRes.data.withinRadius,
    session,
  };
}

/** Auto-close: scheduled end + 2h → AUTO_CLOSED + exception (never silent normal clock-out). */
export async function autoCloseOverdueSessions(): Promise<number> {
  const config = await getAttendanceConfig();
  const user = auth.currentUser;
  if (!user) return 0;
  const dateKey = localDateKey(new Date());
  const snap = await getDocs(
    query(
      collection(db, 'attendance_sessions'),
      where('status', '==', 'clocked_in'),
      where('employeeUid', '==', user.uid),
      limit(10),
    ),
  );
  let closed = 0;
  const batch = writeBatch(db);
  const now = Date.now();
  for (const d of snap.docs) {
    const s = { id: d.id, ...(d.data() as Omit<AttendanceSession, 'id'>) };
    if (s.shiftDate !== dateKey && s.scheduledEnd) {
      const end = atLocalTimeOnDate(s.shiftDate, s.scheduledEnd);
      if (end && now > end.getTime() + config.autoCloseGraceMinutes * 60_000) {
        const iso = new Date().toISOString();
        batch.update(d.ref, {
          status: 'auto_closed',
          autoClosedAt: iso,
          exceptionTypes: Array.from(new Set([...(s.exceptionTypes || []), 'missing_clock_out'])),
          updatedAt: iso,
        });
        closed++;
      }
    }
    if (s.shiftDate !== dateKey) {
      const iso = new Date().toISOString();
      batch.update(d.ref, {
        status: 'auto_closed',
        autoClosedAt: iso,
        exceptionTypes: Array.from(new Set([...(s.exceptionTypes || []), 'missing_clock_out'])),
        updatedAt: iso,
      });
      closed++;
    }
  }
  if (closed > 0) await batch.commit();
  return closed;
}

export function listenMyTodaySession(cb: (s: AttendanceSession | null) => void, onError?: (e: Error) => void) {
  const user = auth.currentUser;
  if (!user) { cb(null); return () => {}; }
  const dateKey = localDateKey(new Date());
  const q = query(
    collection(db, 'attendance_sessions'),
    where('employeeUid', '==', user.uid),
    where('shiftDate', '==', dateKey),
    limit(5),
  );
  return onSnapshot(
    q,
    (snap) => {
      const docs = snap.docs.map((d) => ({ ...(d.data() as AttendanceSession), id: d.id }));
      cb(docs.find((s) => s.status === 'clocked_in') || docs[0] || null);
    },
    (e) => onError?.(e as Error),
  );
}

export async function getTodaysSession(): Promise<AttendanceSession | null> {
  const user = requireAuthUser();
  const dateKey = localDateKey(new Date());
  return findOpenSession(user.uid, dateKey).then(async (open) => {
    if (open) return open;
    const snap = await getDocs(
      query(
        collection(db, 'attendance_sessions'),
        where('employeeUid', '==', user.uid),
        where('shiftDate', '==', dateKey),
        limit(5),
      ),
    );
    const docs = snap.docs.map((d) => ({ ...(d.data() as AttendanceSession), id: d.id }));
    return docs[0] || null;
  });
}

export { DEFAULT_ATTENDANCE_CONFIG };
