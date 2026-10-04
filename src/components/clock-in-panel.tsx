// Clock-in panel. Batch B: token-based presentation only — every attendance /
// geofence / device / clock-window call and state derivation is unchanged.
// Adds: live elapsed timer (30s tick + foreground recompute, no writes),
// inline blocked card with a next step, and a clocked-out hours summary.
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Platform, AppState, Linking } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '@/context/AuthContext';
import { useAppTheme } from '@/design/use-app-theme';
import { CustomAlertModal, type AlertConfig } from '@/components/CustomAlertModal';
import {
  PunchRecord,
  getCurrentPosition,
  haversineMeters,
  formatDistance,
  listenTodaysPunches,
  type PositionFix,
} from '@/services/attendance';
import {
  clockIn,
  clockOut,
  getTodaysSession,
  autoCloseOverdueSessions,
} from '@/services/attendance-sessions';
import { ensureDeviceEnrollment, requestDeviceReset } from '@/services/device';
import { listActiveWorksites, getAttendanceConfig, evaluateGeofence } from '@/services/worksites';
import { mergeWorkforceProfile } from '@/services/identity';
import { DEFAULT_ATTENDANCE_CONFIG, type AttendanceSession, type Worksite, type AttendanceConfig } from '@/types/workforce';
import { WorksiteMap, shortCampusName } from '@/components/WorksiteMap';
import { AppText } from '@/components/ui/text';
import { Card } from '@/components/ui/surface';
import { Button } from '@/components/ui/button';
import { StatusPill } from '@/components/ui/status-pill';
import { ListSkeleton } from '@/components/ui/states';

type BlockKind = 'offsite' | 'stale' | 'inaccurate' | 'unavailable' | 'denied' | 'device' | 'window' | 'other';
interface Block { kind: BlockKind; message: string }

const BLOCK_TITLE: Record<BlockKind, string> = {
  offsite: 'Outside all campuses',
  stale: 'Location is stale',
  inaccurate: 'GPS is inaccurate',
  unavailable: 'Location unavailable',
  denied: 'Location permission needed',
  device: 'Device not authorized',
  window: 'Outside the clock window',
  other: 'Clock-in blocked',
};

function nextStepFor(kind: BlockKind, config: AttendanceConfig | null): string {
  switch (kind) {
    case 'offsite': return 'Move inside one of the campus perimeters and try again.';
    case 'stale': return 'Wait a moment and refresh your location.';
    case 'inaccurate': return 'Move to open sky, then try again.';
    case 'unavailable': return 'Enable GPS and try again.';
    case 'denied': return 'Open Settings to allow location, then try again.';
    case 'device': return 'Request a device reset from your administrator.';
    case 'window': return `You can clock in ${config?.clockInBeforeMinutes ?? 15} min before and up to ${config?.clockInAfterMinutes ?? 30} min after your shift starts.`;
    default: return 'Try again, or contact your administrator.';
  }
}

function classifyBlock(msg: string): BlockKind {
  const m = (msg || '').toLowerCase();
  if (/device|different device|reset|authorized/.test(m)) return 'device';
  if (/too old|stale/.test(m)) return 'stale';
  if (/accuracy|too low|reliable enough/.test(m)) return 'inaccurate';
  if (/off-?site|on site|worksite|off site/.test(m)) return 'offsite';
  if (/clock in up to|before your shift|shift starts|window/.test(m)) return 'window';
  if (/permission|denied/.test(m)) return 'denied';
  if (/location unavailable|enable gps|no real fix/.test(m)) return 'unavailable';
  return 'other';
}

function formatElapsed(ms: number): string {
  const totalMin = Math.floor(Math.max(0, ms) / 60000);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return h > 0 ? `${h}h ${String(m).padStart(2, '0')}m` : `${m}m`;
}

function hoursBetween(a?: string, b?: string): number | null {
  if (!a || !b) return null;
  const ms = new Date(b).getTime() - new Date(a).getTime();
  if (!Number.isFinite(ms) || ms < 0) return null;
  return ms / 3600000;
}

function timeOf(iso?: string): string {
  return iso ? new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—';
}

export default function ClockInPanel() {
  const { user, profile } = useAuth();
  const theme = useAppTheme();

  const [punches, setPunches] = useState<PunchRecord[]>([]);
  const [session, setSession] = useState<AttendanceSession | null>(null);
  const [worksites, setWorksites] = useState<Worksite[]>([]);
  const [config, setConfig] = useState<AttendanceConfig | null>(null);
  const [busy, setBusy] = useState(false);
  const [booting, setBooting] = useState(true);
  const [myDistance, setMyDistance] = useState<number | null>(null);
  const [myFix, setMyFix] = useState<PositionFix | null>(null);
  const [myFixAt, setMyFixAt] = useState<number | null>(null);
  const [locating, setLocating] = useState(false);
  const [deviceNote, setDeviceNote] = useState('');
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [blocked, setBlocked] = useState<Block | null>(null);
  const locationRequestedRef = useRef(false);

  const [alertConfig, setAlertConfig] = useState<AlertConfig>({ visible: false, title: '', message: '' });
  const showAlert = (c: Omit<AlertConfig, 'visible'>) => setAlertConfig({ ...c, visible: true });

  const identityName = profile?.displayName || user?.displayName || 'Staff Member';
  const employeeId = profile?.employeeId || '—';

  // `list` is passed explicitly so the first fix after boot can already
  // measure against every campus (state has not committed yet at that point).
  const loadLocation = useCallback(async (list: Worksite[]) => {
    setLocating(true);
    try {
      // Ask for permission at most once per session; later refreshes rely on the
      // already-granted permission (or surface the denied state).
      if (Platform.OS !== 'web' && !locationRequestedRef.current) {
        const { requestForegroundPermissionsAsync } = await import('expo-location');
        const { status } = await requestForegroundPermissionsAsync();
        locationRequestedRef.current = true;
        if (status !== 'granted') throw new Error('Location permission not granted.');
      }
      const pos = await getCurrentPosition();
      setMyFix(pos);
      setMyFixAt(Date.now());
      let nearest = Infinity;
      for (const w of list) {
        nearest = Math.min(nearest, haversineMeters(pos.lat, pos.lng, w.lat, w.lng));
      }
      setMyDistance(Number.isFinite(nearest) ? nearest : null);
    } catch (e: any) {
      setMyFix(null);
      setMyFixAt(null);
      setMyDistance(null);
      const m = String(e?.message || '');
      if (/permission|denied|not granted/i.test(m)) setBlocked({ kind: 'denied', message: 'Location permission is off.' });
    } finally {
      setLocating(false);
    }
  }, []);

  const bootstrap = useCallback(async () => {
    setBooting(true);
    try {
      const [wsList, cfg, sess] = await Promise.all([
        listActiveWorksites(),
        getAttendanceConfig(),
        getTodaysSession().catch(() => null),
      ]);
      setWorksites(wsList);
      setConfig(cfg);
      setSession(sess);
      autoCloseOverdueSessions().catch(() => {});
      try {
        const enr = await ensureDeviceEnrollment();
        setDeviceNote(enr.isFirstEnrollment ? 'Device registered for this account.' : 'This device is authorized.');
      } catch (e: any) {
        setDeviceNote(e?.message || 'Device not authorized.');
      }
      if (wsList.length) await loadLocation(wsList);
    } catch (e: any) {
      showAlert({ title: 'Attendance unavailable', message: e?.message || 'Could not load attendance data.', type: 'error' });
    } finally {
      setBooting(false);
    }
  }, [loadLocation]);

  useEffect(() => { bootstrap(); }, [bootstrap]);

  useEffect(() => {
    if (!user?.uid) return;
    return listenTodaysPunches((all) => setPunches(all.filter((p) => p.staffUid === user.uid)), () => {});
  }, [user?.uid]);

  const clockedIn = session?.status === 'clocked_in';
  const clockedOut = session?.status === 'clocked_out' || session?.status === 'auto_closed';

  // Live elapsed timer: tick at most every 30s while clocked in; recompute when
  // the app returns to the foreground; cleared on unmount. No writes.
  useEffect(() => {
    if (!clockedIn) return;
    const tick = () => setNowMs(Date.now());
    tick();
    const id = setInterval(tick, 30_000);
    const sub = AppState.addEventListener('change', (s) => { if (s === 'active') tick(); });
    return () => { clearInterval(id); sub.remove(); };
  }, [clockedIn]);

  const elapsedMs = clockedIn && session?.clockInAt ? nowMs - new Date(session.clockInAt).getTime() : 0;

  // Every active campus is checked with the same authoritative 4-check
  // geofence. Inside any perimeter => that campus is the active one.
  const campusResults = useMemo(() => {
    if (!worksites.length || !myFix || myFixAt == null) return [];
    const fixArg = { lat: myFix.lat, lng: myFix.lng, accuracyM: myFix.accuracyM, ageMs: Date.now() - myFixAt };
    const limits = config || DEFAULT_ATTENDANCE_CONFIG;
    return worksites.map((w) => ({ w, res: evaluateGeofence(w, fixArg, limits) }));
  }, [worksites, myFix, myFixAt, config]);

  const activeMatch = campusResults.find((c) => c.res.ok) ?? null;

  const nearestCampus = useMemo(() => {
    if (!campusResults.length) return null;
    return campusResults.reduce((a, b) => (b.res.distanceM < a.res.distanceM ? b : a));
  }, [campusResults]);

  const geofenceResult = activeMatch?.res ?? nearestCampus?.res ?? null;

  const deviceUnauthorized = /not authorized|reset|different device/i.test(deviceNote);

  // Location status derived from the existing GeofenceResult fields (no new states).
  const locationStatus = !myFix
    ? { status: 'pending', label: 'Location unavailable' }
    : !geofenceResult
      ? { status: 'pending', label: 'Checking location' }
      : !geofenceResult.ageOk
        ? { status: 'stale', label: 'Location stale' }
        : !geofenceResult.accuracyOk
          ? { status: 'pending', label: 'GPS inaccurate' }
          : !geofenceResult.withinRadius
            ? { status: 'outside_geofence', label: 'Outside campuses' }
            : geofenceResult.ok
              ? { status: 'verified', label: 'On site' }
              : { status: 'pending', label: 'Location unclear' };

  // Proactive blocker (before any punch attempt): device, off-site, stale, inaccurate.
  const proactive: Block | null = !clockedIn
    ? deviceUnauthorized
      ? { kind: 'device', message: deviceNote || 'This device is not authorized for your account.' }
      : geofenceResult && !geofenceResult.ageOk
        ? { kind: 'stale', message: geofenceResult.blockedReason || 'Location fix is too old.' }
        : geofenceResult && !geofenceResult.accuracyOk
          ? { kind: 'inaccurate', message: geofenceResult.blockedReason || 'GPS accuracy is too low.' }
          : geofenceResult && !geofenceResult.withinRadius
            ? {
                kind: 'offsite',
                message: nearestCampus
                  ? `You are ${Math.round(nearestCampus.res.distanceM)}m from ${nearestCampus.w.name} (max ${nearestCampus.w.radiusM}m). Clock-in is only allowed inside the campus perimeters.`
                  : geofenceResult.blockedReason || 'You are off site.',
              }
            : null
    : null;

  const activeBlock = clockedIn ? null : (blocked ?? proactive);

  const refreshLocation = useCallback(async () => {
    setBlocked(null);
    await loadLocation(worksites);
  }, [worksites, loadLocation]);

  const doPunch = async (type: 'in' | 'out') => {
    if (busy) return;
    if (!user) { showAlert({ title: 'Not signed in', message: 'Sign in to clock in/out.', type: 'error' }); return; }
    setBusy(true);
    setBlocked(null);
    try {
      if (type === 'in') {
        // attendance-sessions validates the punch against the campus assigned to
        // the account, so point that assignment at the campus whose perimeter the
        // fix is inside. Same field the punch itself writes on success; the
        // distance check still runs against that campus afterwards.
        if (activeMatch && profile?.worksiteId !== activeMatch.w.id) {
          await mergeWorkforceProfile({ worksiteId: activeMatch.w.id }).catch(() => {});
        }
        const res = await clockIn();
        setSession(res.session);
        setMyDistance(res.distanceM);
        showAlert({
          title: 'Clocked In',
          message: `You're clocking in as ${identityName} (${employeeId}).\nDistance: ${formatDistance(res.distanceM)} from ${activeMatch?.w.name || 'the campus'}.`,
          type: 'success',
        });
      } else {
        const res = await clockOut();
        setSession(res.session);
        setMyDistance(res.distanceM);
        showAlert({
          title: 'Clocked Out',
          message: `Clocked out at ${timeOf(new Date().toISOString())}.\nDistance: ${formatDistance(res.distanceM)}.`,
          type: 'success',
        });
      }
      const sess = await getTodaysSession().catch(() => null);
      setSession(sess);
    } catch (e: any) {
      const msg = e?.message || 'Punch failed.';
      const kind = classifyBlock(msg);
      setBlocked({ kind, message: msg });
      if (kind === 'device') setDeviceNote(msg);
    } finally {
      setBusy(false);
    }
  };

  const onRequestReset = async () => {
    try {
      await requestDeviceReset('Employee requested reset from clock-in panel');
      setDeviceNote('Device reset requested — waiting for administrator approval.');
      setBlocked({ kind: 'device', message: 'Reset requested — waiting for administrator approval.' });
    } catch (e: any) {
      showAlert({ title: 'Request failed', message: e?.message || 'Could not submit request.', type: 'error' });
    }
  };

  if (booting) {
    return (
      <View style={{ padding: theme.space.lg, gap: theme.space.md }}>
        <ListSkeleton rows={2} />
        <AppText variant="caption" tone="muted" align="center">Preparing attendance…</AppText>
      </View>
    );
  }

  const workedHours = hoursBetween(session?.clockInAt, session?.clockOutAt);

  const blockAction = (() => {
    if (!activeBlock) return null;
    if (activeBlock.kind === 'device') return <Button label="Request device reset" variant="secondary" onPress={onRequestReset} fullWidth={false} />;
    if (activeBlock.kind === 'denied') {
      return (
        <View style={{ flexDirection: 'row', gap: theme.space.sm, flexWrap: 'wrap' }}>
          <Button label="Open Settings" icon="settings-outline" variant="secondary" onPress={() => Linking.openSettings()} fullWidth={false} />
          <Button label="Try again" variant="secondary" onPress={refreshLocation} fullWidth={false} />
        </View>
      );
    }
    if (activeBlock.kind === 'offsite' || activeBlock.kind === 'stale' || activeBlock.kind === 'inaccurate' || activeBlock.kind === 'unavailable') {
      return <Button label="Refresh location" icon="refresh-outline" variant="secondary" onPress={refreshLocation} fullWidth={false} />;
    }
    return null;
  })();

  return (
    <View style={{ padding: theme.space.lg, gap: theme.space.md }}>
      <Card>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.space.md }}>
          <Ionicons name="person-circle" size={28} color={theme.colors.primary} />
          <View style={{ flex: 1 }}>
            <AppText variant="micro" tone="muted" weight="700">{"YOU'RE CLOCKING IN AS"}</AppText>
            <AppText variant="subtitle">{identityName}</AppText>
            <AppText variant="caption" tone="secondary">
              Employee ID {employeeId} • {profile?.employmentType || 'Staff'} • {profile?.department || '—'}
            </AppText>
          </View>
        </View>
      </Card>

      <Card style={{ gap: theme.space.sm }}>
        <AppText variant="bodyStrong">
          {activeMatch
            ? `${activeMatch.w.name} — inside perimeter`
            : worksites.length
              ? `${worksites.length} campus perimeters`
              : 'Worksite not configured'}
        </AppText>
        <AppText variant="caption" tone="secondary">
          {worksites.length
            ? `Clock-in allowed inside: ${worksites
                .map((w) => `${shortCampusName(w.name)} ${w.radiusM}m`)
                .join(' · ')} • ${config?.timezone || 'Africa/Johannesburg'}`
            : 'Contact your administrator to assign a worksite.'}
        </AppText>
        <AppText variant="caption" tone="secondary">
          Clock window: {config?.clockInBeforeMinutes ?? 15}m before → {config?.clockInAfterMinutes ?? 30}m after shift start
        </AppText>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.space.sm, marginTop: theme.space.xs }}>
          <StatusPill status={clockedIn ? 'clocked_in' : 'scheduled'} label={clockedIn ? 'Clocked in' : 'Ready'} />
          <StatusPill status={locationStatus.status} label={locationStatus.label} />
          <StatusPill status={deviceUnauthorized ? 'pending_reset' : 'active'} label={deviceUnauthorized ? 'Device not authorized' : 'Device verified'} />
        </View>
      </Card>

      {activeBlock ? (
        <Card style={{ backgroundColor: theme.colors.warningSoft, borderColor: theme.colors.warningSoft, gap: theme.space.sm }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.space.sm }}>
            <Ionicons name="alert-circle-outline" size={theme.iconSize.md} color={theme.colors.warningStrong} />
            <AppText variant="bodyStrong" color={theme.colors.warningStrong} style={{ flex: 1 }}>{BLOCK_TITLE[activeBlock.kind]}</AppText>
          </View>
          <AppText variant="caption" color={theme.colors.warningStrong}>{activeBlock.message}</AppText>
          <AppText variant="caption" color={theme.colors.warningStrong} weight="600">{nextStepFor(activeBlock.kind, config)}</AppText>
          {blockAction ? <View style={{ marginTop: theme.space.xs }}>{blockAction}</View> : null}
        </Card>
      ) : null}

      {worksites.length ? (
        <WorksiteMap
          worksites={worksites.map((w) => ({ id: w.id, name: w.name, lat: w.lat, lng: w.lng, radiusM: w.radiusM }))}
          activeWorksiteId={activeMatch?.w.id ?? null}
          fix={myFix ? { lat: myFix.lat, lng: myFix.lng, accuracyM: myFix.accuracyM, ageMs: myFixAt != null ? Date.now() - myFixAt : 0 } : null}
          result={geofenceResult}
          fixAgeMs={myFixAt != null ? Date.now() - myFixAt : undefined}
          locating={locating}
        />
      ) : null}

      <Button
        label={clockedIn ? 'Clock Out' : 'Clock In'}
        icon={clockedIn ? 'log-out-outline' : 'log-in-outline'}
        variant={clockedIn ? 'danger' : 'primary'}
        size="lg"
        loading={busy}
        onPress={() => doPunch(clockedIn ? 'out' : 'in')}
      />

      {clockedIn && session?.clockInAt ? (
        <Card style={{ alignItems: 'center', gap: theme.space.xs }}>
          <AppText variant="micro" tone="muted" weight="700">ELAPSED TODAY</AppText>
          <AppText variant="metric" style={{ fontVariant: ['tabular-nums'] }}>{formatElapsed(elapsedMs)}</AppText>
          <AppText variant="caption" tone="secondary">
            Clocked in at {timeOf(session.clockInAt)}
            {session.clockInDistanceM != null ? ` • ${formatDistance(session.clockInDistanceM)}` : ''}
          </AppText>
        </Card>
      ) : null}

      {clockedOut ? (
        <Card style={{ gap: theme.space.xs }}>
          <AppText variant="micro" tone="muted" weight="700">{"TODAY'S SHIFT"}</AppText>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <AppText variant="caption" tone="secondary">Clocked in</AppText>
            <AppText variant="bodyStrong">{timeOf(session?.clockInAt)}</AppText>
          </View>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <AppText variant="caption" tone="secondary">Clocked out</AppText>
            <AppText variant="bodyStrong">{timeOf(session?.clockOutAt || session?.autoClosedAt)}</AppText>
          </View>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <AppText variant="caption" tone="secondary">Hours worked</AppText>
            <AppText variant="bodyStrong">{workedHours != null ? `${workedHours.toFixed(2)} h` : '—'}</AppText>
          </View>
          {session?.status === 'auto_closed' ? (
            <AppText variant="caption" color={theme.colors.warningStrong}>Auto-closed — missing clock-out. A manager will review.</AppText>
          ) : null}
        </Card>
      ) : null}

      {punches.length > 0 ? (
        <Card style={{ gap: theme.space.xs }}>
          <AppText variant="micro" tone="muted" weight="700">{"TODAY'S PUNCHES"}</AppText>
          {punches.slice(0, 6).map((p) => (
            <AppText key={p.id} variant="body" style={{ fontVariant: ['tabular-nums'] }}>
              {p.punchType === 'in' ? 'IN ' : 'OUT'}{'  '}
              {p.isoTime ? new Date(p.isoTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}
              {typeof p.distanceM === 'number' ? `  • ${formatDistance(p.distanceM)}` : ''}
            </AppText>
          ))}
        </Card>
      ) : null}

      <CustomAlertModal config={alertConfig} onClose={() => setAlertConfig((c) => ({ ...c, visible: false }))} />
    </View>
  );
}
