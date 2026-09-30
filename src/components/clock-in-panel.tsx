// Clock-in panel. Layer 11: token-based presentation only — every attendance /
// geofence / device / clock-window call and state derivation is unchanged.
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Platform } from 'react-native';
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
import { getDefaultWorksite, getAttendanceConfig, evaluateGeofence } from '@/services/worksites';
import { DEFAULT_ATTENDANCE_CONFIG, type AttendanceSession, type Worksite, type AttendanceConfig } from '@/types/workforce';
import { WorksiteMap } from '@/components/WorksiteMap';
import { AppText } from '@/components/ui/text';
import { Card } from '@/components/ui/surface';
import { Button } from '@/components/ui/button';
import { StatusPill } from '@/components/ui/status-pill';
import { ListSkeleton } from '@/components/ui/states';

export default function ClockInPanel() {
  const { user, profile } = useAuth();
  const theme = useAppTheme();

  const [punches, setPunches] = useState<PunchRecord[]>([]);
  const [session, setSession] = useState<AttendanceSession | null>(null);
  const [worksite, setWorksite] = useState<Worksite | null>(null);
  const [config, setConfig] = useState<AttendanceConfig | null>(null);
  const [busy, setBusy] = useState(false);
  const [booting, setBooting] = useState(true);
  const [myDistance, setMyDistance] = useState<number | null>(null);
  const [myFix, setMyFix] = useState<PositionFix | null>(null);
  const [myFixAt, setMyFixAt] = useState<number | null>(null);
  const [deviceNote, setDeviceNote] = useState('');

  const [alertConfig, setAlertConfig] = useState<AlertConfig>({ visible: false, title: '', message: '' });
  const showAlert = (c: Omit<AlertConfig, 'visible'>) => setAlertConfig({ ...c, visible: true });

  const identityName = profile?.displayName || user?.displayName || 'Staff Member';
  const employeeId = profile?.employeeId || '—';

  const bootstrap = useCallback(async () => {
    setBooting(true);
    try {
      const [ws, cfg, sess] = await Promise.all([
        getDefaultWorksite(),
        getAttendanceConfig(),
        getTodaysSession().catch(() => null),
      ]);
      setWorksite(ws);
      setConfig(cfg);
      setSession(sess);
      autoCloseOverdueSessions().catch(() => {});
      try {
        const enr = await ensureDeviceEnrollment();
        setDeviceNote(enr.isFirstEnrollment ? 'Device registered for this account.' : 'This device is authorized.');
      } catch (e: any) {
        setDeviceNote(e?.message || 'Device not authorized.');
      }
      if (ws) {
        try {
          if (Platform.OS !== 'web') {
            const { requestForegroundPermissionsAsync } = await import('expo-location');
            const { status } = await requestForegroundPermissionsAsync();
            if (status !== 'granted') throw new Error('Location permission not granted.');
          }
          const pos = await getCurrentPosition();
          setMyFix(pos);
          setMyFixAt(Date.now());
          setMyDistance(haversineMeters(pos.lat, pos.lng, ws.lat, ws.lng));
        } catch {
          setMyFix(null);
          setMyFixAt(null);
          setMyDistance(null);
        }
      }
    } catch (e: any) {
      showAlert({ title: 'Attendance unavailable', message: e?.message || 'Could not load attendance data.', type: 'error' });
    } finally {
      setBooting(false);
    }
  }, []);

  useEffect(() => { bootstrap(); }, [bootstrap]);

  useEffect(() => {
    if (!user?.uid) return;
    return listenTodaysPunches((all) => setPunches(all.filter((p) => p.staffUid === user.uid)), () => {});
  }, [user?.uid]);

  const clockedIn = session?.status === 'clocked_in';

  const geofenceResult = useMemo(() => {
    if (!worksite || !myFix || myFixAt == null) return null;
    return evaluateGeofence(
      { lat: worksite.lat, lng: worksite.lng, radiusM: worksite.radiusM },
      { lat: myFix.lat, lng: myFix.lng, accuracyM: myFix.accuracyM, ageMs: Date.now() - myFixAt },
      config || DEFAULT_ATTENDANCE_CONFIG,
    );
  }, [worksite, myFix, myFixAt, config]);

  const doPunch = async (type: 'in' | 'out') => {
    if (busy) return;
    if (!user) { showAlert({ title: 'Not signed in', message: 'Sign in to clock in/out.', type: 'error' }); return; }
    setBusy(true);
    try {
      if (type === 'in') {
        const res = await clockIn();
        setSession(res.session);
        setMyDistance(res.distanceM);
        showAlert({
          title: 'Clocked In',
          message: `You're clocking in as ${identityName} (${employeeId}).\nDistance: ${formatDistance(res.distanceM)} from ${worksite?.name || 'worksite'}.`,
          type: 'success',
        });
      } else {
        const res = await clockOut();
        setSession(res.session);
        setMyDistance(res.distanceM);
        showAlert({
          title: 'Clocked Out',
          message: `Clocked out at ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}.\nDistance: ${formatDistance(res.distanceM)}.`,
          type: 'success',
        });
      }
      const sess = await getTodaysSession().catch(() => null);
      setSession(sess);
    } catch (e: any) {
      const msg = e?.message || 'Punch failed.';
      if (/device is not authorized|different device|reset/i.test(msg)) {
        showAlert({ title: 'Device not authorized', message: `${msg}\n\nRequest a device reset?`, type: 'warning' });
        setDeviceNote(msg);
      } else {
        showAlert({ title: type === 'in' ? 'Clock-in blocked' : 'Clock-out blocked', message: msg, type: 'error' });
      }
    } finally {
      setBusy(false);
    }
  };

  const onRequestReset = async () => {
    try {
      await requestDeviceReset('Employee requested reset from clock-in panel');
      setDeviceNote('Device reset requested — waiting for administrator approval.');
      showAlert({ title: 'Reset requested', message: 'Your administrator must approve the reset before a new device can enroll.', type: 'info' });
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
            ? { status: 'outside_geofence', label: 'Off site' }
            : geofenceResult.ok
              ? { status: 'verified', label: 'On site' }
              : { status: 'pending', label: 'Location unclear' };

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
        <AppText variant="bodyStrong">{worksite?.name || 'Worksite not configured'}</AppText>
        <AppText variant="caption" tone="secondary">
          {worksite ? `Geofence ${worksite.radiusM}m • ${config?.timezone || 'Africa/Johannesburg'}` : 'Contact your administrator to assign a worksite.'}
        </AppText>
        <AppText variant="caption" tone="secondary">
          Clock window: {config?.clockInBeforeMinutes ?? 15}m before → {config?.clockInAfterMinutes ?? 30}m after shift start
        </AppText>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.space.sm, marginTop: theme.space.xs }}>
          <StatusPill status={clockedIn ? 'clocked_in' : 'scheduled'} label={clockedIn ? 'Clocked in' : 'Ready'} />
          <StatusPill status={locationStatus.status} label={locationStatus.label} />
          <StatusPill status={deviceUnauthorized ? 'pending_reset' : 'active'} label={deviceUnauthorized ? 'Device not authorized' : 'Device verified'} />
        </View>
        {deviceUnauthorized ? (
          <View style={{ marginTop: theme.space.xs }}>
            <Button label="Request device reset" variant="secondary" onPress={onRequestReset} fullWidth={false} />
          </View>
        ) : null}
      </Card>

      {worksite ? (
        <WorksiteMap
          worksite={{ name: worksite.name, lat: worksite.lat, lng: worksite.lng, radiusM: worksite.radiusM }}
          fix={myFix ? { lat: myFix.lat, lng: myFix.lng, accuracyM: myFix.accuracyM, ageMs: myFixAt != null ? Date.now() - myFixAt : 0 } : null}
          result={geofenceResult}
          fixAgeMs={myFixAt != null ? Date.now() - myFixAt : undefined}
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

      {session?.status === 'clocked_in' && session.clockInAt ? (
        <AppText variant="caption" tone="secondary" align="center">
          Clocked in at {new Date(session.clockInAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          {session.clockInDistanceM != null ? ` • ${formatDistance(session.clockInDistanceM)}` : ''}
        </AppText>
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
