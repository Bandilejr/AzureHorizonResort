import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  useColorScheme,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '@/context/AuthContext';
import { getTheme } from '@/constants/theme';
import { CustomAlertModal, AlertConfig } from '@/components/CustomAlertModal';
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

export default function ClockInPanel() {
  const { user, profile, signOut } = useAuth();
  const colorScheme = useColorScheme();
  const theme = getTheme(colorScheme as any);
  const S = createStyles(theme);

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

  const [alertConfig, setAlertConfig] = useState<AlertConfig>({
    visible: false,
    title: '',
    message: '',
  });
  const showAlert = (c: Omit<AlertConfig, 'visible'>) =>
    setAlertConfig({ ...c, visible: true });

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
        setDeviceNote(
          enr.isFirstEnrollment
            ? 'Device registered for this account.'
            : 'This device is authorized.',
        );
      } catch (e: any) {
        setDeviceNote(e?.message || 'Device not authorized.');
      }
      if (ws) {
        // Phase 1 (§15/§17): capture the REAL fix (never substituted) for the
        // schematic map; punches re-validate with a fresh fix in the session service.
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
      showAlert({
        title: 'Attendance unavailable',
        message: e?.message || 'Could not load attendance data.',
        type: 'error',
      });
    } finally {
      setBooting(false);
    }
  }, []);

  useEffect(() => {
    bootstrap();
  }, [bootstrap]);

  useEffect(() => {
    if (!user?.uid) return;
    return listenTodaysPunches(
      (all) => setPunches(all.filter((p) => p.staffUid === user.uid)),
      () => {},
    );
  }, [user?.uid]);

  const clockedIn = session?.status === 'clocked_in';

  // Phase 1 (§17): indicative client-side geofence state for the map display.
  // The session service re-validates with a fresh fix — transaction is authoritative.
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
    if (!user) {
      showAlert({ title: 'Not signed in', message: 'Sign in to clock in/out.', type: 'error' });
      return;
    }
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
        showAlert({
          title: 'Device not authorized',
          message: `${msg}\n\nRequest a device reset?`,
          type: 'warning',
        });
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
      showAlert({
        title: 'Reset requested',
        message: 'Your administrator must approve the reset before a new device can enroll.',
        type: 'info',
      });
    } catch (e: any) {
      showAlert({ title: 'Request failed', message: e?.message || 'Could not submit request.', type: 'error' });
    }
  };

  if (booting) {
    return (
      <View style={S.wrap}>
        <ActivityIndicator color={theme.colors.primary} size="large" />
        <Text style={S.muted}>Preparing attendance…</Text>
      </View>
    );
  }

  return (
    <View style={S.wrap}>
      <View style={S.identityCard}>
        <Ionicons name="person-circle" size={28} color={theme.colors.primary} />
        <View style={{ flex: 1, marginLeft: 10 }}>
          <Text style={S.identityLabel}>{`You're clocking in as`}</Text>
          <Text style={S.identityName}>{identityName}</Text>
          <Text style={S.identityMeta}>
            Employee ID {employeeId} • {profile?.employmentType || 'Staff'} • {profile?.department || '—'}
          </Text>
        </View>
      </View>

      <View style={S.metaCard}>
        <Text style={S.metaTitle}>{worksite?.name || 'Worksite not configured'}</Text>
        <Text style={S.metaLine}>
          {worksite
            ? `Geofence ${worksite.radiusM}m • ${config?.timezone || 'Africa/Johannesburg'}`
            : 'Contact your administrator to assign a worksite.'}
        </Text>
        <Text style={S.metaLine}>
          Clock window: {config?.clockInBeforeMinutes ?? 15}m before → {config?.clockInAfterMinutes ?? 30}m after shift start
        </Text>
        <Text style={S.deviceNote}>{deviceNote}</Text>
        {deviceNote && /not authorized|reset|different device/i.test(deviceNote) && (
          <TouchableOpacity style={S.resetBtn} onPress={onRequestReset}>
            <Text style={S.resetBtnText}>Request device reset</Text>
          </TouchableOpacity>
        )}
      </View>

      {worksite && (
        <WorksiteMap
          worksite={{ name: worksite.name, lat: worksite.lat, lng: worksite.lng, radiusM: worksite.radiusM }}
          fix={myFix ? { lat: myFix.lat, lng: myFix.lng, accuracyM: myFix.accuracyM, ageMs: myFixAt != null ? Date.now() - myFixAt : 0 } : null}
          result={geofenceResult}
          fixAgeMs={myFixAt != null ? Date.now() - myFixAt : undefined}
        />
      )}

      <TouchableOpacity
        style={[S.punchBtn, clockedIn ? S.punchOut : S.punchIn, busy ? S.punchDisabled : null]}
        onPress={() => doPunch(clockedIn ? 'out' : 'in')}
        disabled={busy}
      >
        {busy ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <>
            <Ionicons name={clockedIn ? 'log-out-outline' : 'log-in-outline'} size={22} color="#fff" />
            <Text style={S.punchBtnText}>{clockedIn ? 'Clock Out' : 'Clock In'}</Text>
          </>
        )}
      </TouchableOpacity>

      {session?.status === 'clocked_in' && session.clockInAt && (
        <Text style={S.sessionLine}>
          Clocked in at {new Date(session.clockInAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          {session.clockInDistanceM != null ? ` • ${formatDistance(session.clockInDistanceM)}` : ''}
        </Text>
      )}

      {punches.length > 0 && (
        <View style={S.history}>
          <Text style={S.historyTitle}>{`Today's punches`}</Text>
          {punches.slice(0, 6).map((p) => (
            <Text key={p.id} style={S.historyRow}>
              {p.punchType === 'in' ? 'IN ' : 'OUT'}
              {'  '}
              {p.isoTime ? new Date(p.isoTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}
              {typeof p.distanceM === 'number' ? `  • ${formatDistance(p.distanceM)}` : ''}
            </Text>
          ))}
        </View>
      )}

      <CustomAlertModal
        config={alertConfig}
        onClose={() => setAlertConfig((c) => ({ ...c, visible: false }))}
      />
    </View>
  );
}

const createStyles = (theme: any) =>
  StyleSheet.create({
    wrap: { padding: 16, gap: 12 },
    muted: { color: theme.colors.textMuted, textAlign: 'center', marginTop: 8 },
    identityCard: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: theme.colors.surface,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: theme.colors.border,
      padding: 14,
    },
    identityLabel: { fontSize: 11, color: theme.colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.5 },
    identityName: { fontSize: 18, fontWeight: '700', color: theme.colors.text, marginTop: 2 },
    identityMeta: { fontSize: 12, color: theme.colors.textMuted, marginTop: 2 },
    metaCard: {
      backgroundColor: theme.colors.surface,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: theme.colors.border,
      padding: 14,
      gap: 4,
    },
    metaTitle: { fontSize: 15, fontWeight: '700', color: theme.colors.text },
    metaLine: { fontSize: 12, color: theme.colors.textMuted },
    deviceNote: { fontSize: 12, color: theme.colors.textMuted, marginTop: 4 },
    resetBtn: {
      marginTop: 8,
      alignSelf: 'flex-start',
      backgroundColor: theme.colors.errorLight || '#fee2e2',
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderRadius: 8,
    },
    resetBtnText: { color: theme.colors.error, fontWeight: '600', fontSize: 13 },
    punchBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      paddingVertical: 16,
      borderRadius: 14,
    },
    punchIn: { backgroundColor: '#15803d' },
    punchOut: { backgroundColor: '#b91c1c' },
    punchDisabled: { opacity: 0.6 },
    punchBtnText: { color: '#fff', fontSize: 17, fontWeight: '700' },
    sessionLine: { textAlign: 'center', fontSize: 13, color: theme.colors.textMuted },
    history: {
      backgroundColor: theme.colors.surface,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: theme.colors.border,
      padding: 14,
      gap: 4,
    },
    historyTitle: { fontSize: 12, fontWeight: '700', color: theme.colors.textMuted, textTransform: 'uppercase', marginBottom: 4 },
    historyRow: { fontSize: 13, color: theme.colors.text, fontVariant: ['tabular-nums'] },
  });
