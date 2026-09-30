// Shared LIST → DETAIL → CONFIRM kit (remediation Phase C, §15–§17).
// Every consequential object uses: tappable card → DetailModal (KV rows +
// evidence + history) → action → ConfirmBlock (summary + consequences) →
// execute → result alert → realtime list update.
import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Modal, ScrollView, ActivityIndicator, useColorScheme, Keyboard, PanResponder, Animated, Dimensions, TouchableWithoutFeedback } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { getTheme } from '@/constants/theme';
import { formatStatus } from '@/utils/status-labels';

export function statusColor(status: string, theme: any): string {
  const s = (status || '').toLowerCase();
  if (/approved|verified|completed|published|filled|collected|claimed|scheduled|success/.test(s)) return theme.colors.success || '#16a34a';
  if (/pending|awaiting|review|progress|unassigned/.test(s)) return theme.colors.warning || '#d97706';
  if (/reject|fail|cancel|expired|error/.test(s)) return theme.colors.error || '#dc2626';
  return theme.colors.primary;
}

export function KV({ label, value }: { label: string; value: string }) {
  const colorScheme = useColorScheme();
  const theme = getTheme(colorScheme as any);
  return (
    <View style={kvStyles.row}>
      <Text style={[kvStyles.label, { color: theme.colors.textMuted }]}>{label}</Text>
      <Text style={[kvStyles.value, { color: theme.colors.text }]}>{value || '—'}</Text>
    </View>
  );
}
const kvStyles = StyleSheet.create({
  row: { flexDirection: 'row', justifyContent: 'space-between', gap: 12, paddingVertical: 5 },
  label: { fontSize: 12, fontWeight: '600', flex: 1 },
  value: { fontSize: 13, textAlign: 'right', flex: 2 },
});

export function SectionTitle({ children }: { children: React.ReactNode }) {
  const colorScheme = useColorScheme();
  const theme = getTheme(colorScheme as any);
  return <Text style={{ fontSize: 13, fontWeight: '800', color: theme.colors.primary, marginTop: 14, marginBottom: 4 }}>{children}</Text>;
}

export function StatusBadge({ status }: { status: string }) {
  const colorScheme = useColorScheme();
  const theme = getTheme(colorScheme as any);
  const c = statusColor(status, theme);
  return (
    <View style={{ alignSelf: 'flex-start', backgroundColor: c + '1A', borderRadius: 12, paddingHorizontal: 10, paddingVertical: 4, marginBottom: 6 }}>
      <Text style={{ color: c, fontWeight: '700', fontSize: 12 }}>{formatStatus(status)}</Text>
    </View>
  );
}

export function DetailModal({ visible, title, onClose, children, actions }: {
  visible: boolean; title: string; onClose: () => void;
  children: React.ReactNode; actions?: React.ReactNode;
}) {
  const colorScheme = useColorScheme();
  const theme = getTheme(colorScheme as any);
  const screenH = Dimensions.get('window').height;
  // Snap points (sheet top offset): peek 45% / full 6% of screen height.
  const PEEK = Math.round(screenH * 0.45);
  const FULL = Math.round(screenH * 0.06);
  const [kbOpen, setKbOpen] = useState(false);
  const [kbHeight, setKbHeight] = useState(0);
  const [expanded, setExpanded] = useState(false);
  const translateY = useRef(new Animated.Value(PEEK)).current;
  // Mirror of the animated position (native driver doesn't update _value).
  const posRef = useRef(PEEK);
  const dragStart = useRef(PEEK);
  const dismissed = useRef(false);

  const snapTo = (y: number, cb?: () => void) => {
    posRef.current = y;
    Animated.spring(translateY, { toValue: y, useNativeDriver: true, damping: 26, stiffness: 260 }).start(({ finished }) => {
      if (finished && cb) cb();
    });
  };
  const close = () => {
    if (dismissed.current) return;
    dismissed.current = true;
    Animated.timing(translateY, { toValue: screenH, duration: 220, useNativeDriver: true }).start(() => {
      dismissed.current = false;
      onClose();
    });
  };

  // Reset position each time the sheet opens.
  useEffect(() => {
    if (visible) {
      posRef.current = screenH;
      translateY.setValue(screenH);
      setExpanded(false);
      requestAnimationFrame(() => snapTo(PEEK));
    }
  }, [visible]);

  useEffect(() => {
    const show = Keyboard.addListener('keyboardDidShow', (e) => {
      setKbOpen(true);
      setKbHeight(e.endCoordinates?.height || 0);
      dragStart.current = FULL;
      setExpanded(true);
      snapTo(FULL);
    });
    const hide = Keyboard.addListener('keyboardDidHide', () => {
      setKbOpen(false);
      setKbHeight(0);
    });
    return () => { show.remove(); hide.remove(); };
  }, []);

  const pan = useRef(PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dy) > 6,
    onPanResponderGrant: () => {
      dragStart.current = posRef.current;
    },
    onPanResponderMove: (_, g) => {
      const next = Math.min(Math.max(dragStart.current + g.dy, FULL - 40), screenH);
      translateY.setValue(next);
    },
    onPanResponderRelease: (_, g) => {
      const y = Math.min(Math.max(dragStart.current + g.dy, FULL), screenH);
      if (g.vy > 0.9 || y > screenH * 0.72) { close(); return; }
      if (g.vy < -0.9 || y < screenH * 0.28) { dragStart.current = FULL; setExpanded(true); snapTo(FULL); return; }
      const target = y < (PEEK + FULL) / 2 ? FULL : PEEK;
      dragStart.current = target;
      setExpanded(target === FULL);
      snapTo(target);
    },
  })).current;

  if (!visible) return null;
  return (
    <Modal
      visible transparent animationType="none" statusBarTranslucent
      // System back with an open keyboard hides the keyboard only — never
      // nuke a half-filled form (device-verified trap).
      onRequestClose={() => { if (kbOpen) Keyboard.dismiss(); else close(); }}
    >
      <TouchableWithoutFeedback onPress={close}>
        <View style={dmStyles.backdrop} />
      </TouchableWithoutFeedback>
      <Animated.View
        style={[dmStyles.sheet, { backgroundColor: theme.colors.surface, height: screenH, transform: [{ translateY }] }]}
      >
        <View {...pan.panHandlers} style={dmStyles.grabZone}>
          <View style={[dmStyles.handle, { backgroundColor: theme.colors.border }]} />
          <View style={dmStyles.header}>
            <Text style={[dmStyles.title, { color: theme.colors.text }]}>{title}</Text>
            <TouchableOpacity onPress={close} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Ionicons name="close" size={24} color={theme.colors.textMuted} />
            </TouchableOpacity>
          </View>
          <Text style={[dmStyles.hint, { color: theme.colors.textMuted }]}>
            {expanded ? 'Drag down to shrink' : 'Drag up for full details'}
          </Text>
        </View>
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: (kbOpen ? kbHeight : 0) + 120 }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {children}
        </ScrollView>
        {actions && <View style={[dmStyles.actions, { backgroundColor: theme.colors.surface }]}>{actions}</View>}
      </Animated.View>
    </Modal>
  );
}
const dmStyles = StyleSheet.create({
  backdrop: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)' },
  sheet: {
    position: 'absolute', left: 0, right: 0, top: 0,
    borderTopLeftRadius: 16, borderTopRightRadius: 16,
    paddingTop: 8,
  },
  grabZone: { paddingBottom: 4 },
  handle: { width: 44, height: 5, borderRadius: 3, alignSelf: 'center', marginBottom: 8 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 2, paddingHorizontal: 16 },
  hint: { fontSize: 11, textAlign: 'center', marginBottom: 6 },
  title: { fontSize: 18, fontWeight: '800', flex: 1, marginRight: 8 },
  actions: { flexDirection: 'row', gap: 8, padding: 16, paddingTop: 12 },
});

export function ModalButton({ label, onPress, kind = 'primary', disabled, busy }: {
  label: string; onPress: () => void; kind?: 'primary' | 'danger' | 'secondary';
  disabled?: boolean; busy?: boolean;
}) {
  const colorScheme = useColorScheme();
  const theme = getTheme(colorScheme as any);
  const bg = kind === 'danger' ? theme.colors.error : kind === 'secondary' ? 'transparent' : theme.colors.primary;
  return (
    <TouchableOpacity
      onPress={onPress} disabled={disabled || busy}
      style={[mbStyles.btn, { backgroundColor: bg, opacity: disabled ? 0.5 : 1,
        borderWidth: kind === 'secondary' ? 1 : 0, borderColor: theme.colors.primary, flex: 1 }]}
    >
      {busy ? <ActivityIndicator color={kind === 'secondary' ? theme.colors.primary : '#fff'} /> : (
        <Text style={[mbStyles.text, { color: kind === 'secondary' ? theme.colors.primary : '#fff' }]}>{label}</Text>
      )}
    </TouchableOpacity>
  );
}
const mbStyles = StyleSheet.create({
  btn: { padding: 13, borderRadius: 10, alignItems: 'center' },
  text: { fontWeight: '700' },
});

// Realtime failure banner (§32): never show silent zeros. Keeps last good
// data on screen; Retry re-subscribes (caller bumps a retry key).
export function LiveErrorBanner({ error, onRetry }: { error: string; onRetry: () => void }) {
  const colorScheme = useColorScheme();
  const theme = getTheme(colorScheme as any);
  if (!error) return null;
  return (
    <View style={{ backgroundColor: (theme.colors.error || '#dc2626') + '1A', borderRadius: 8, padding: 12, marginBottom: 8, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
      <Ionicons name={"cloud-offline-outline" as any} size={20} color={theme.colors.error || '#dc2626'} />
      <Text style={{ color: theme.colors.error || '#dc2626', fontSize: 12, flex: 1 }}>
        Unable to load live data: {error}. Showing last known state.
      </Text>
      <TouchableOpacity onPress={onRetry} style={{ borderWidth: 1, borderColor: theme.colors.error || '#dc2626', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6 }}>
        <Text style={{ color: theme.colors.error || '#dc2626', fontWeight: '700', fontSize: 12 }}>Retry</Text>
      </TouchableOpacity>
    </View>
  );
}
export function ConfirmBlock({ title, rows, warning, confirmLabel, danger, onConfirm, onCancel, busy }: {
  title: string; rows: [string, string][]; warning?: string;
  confirmLabel: string; danger?: boolean;
  onConfirm: () => void; onCancel: () => void; busy?: boolean;
}) {
  const colorScheme = useColorScheme();
  const theme = getTheme(colorScheme as any);
  return (
    <View>
      <Text style={{ fontSize: 15, fontWeight: '800', color: theme.colors.text, marginBottom: 6 }}>{title}</Text>
      {rows.map(([k, v]) => <KV key={k} label={k} value={v} />)}
      {!!warning && (
        <View style={{ backgroundColor: (theme.colors.warning || '#d97706') + '1A', borderRadius: 8, padding: 10, marginTop: 8 }}>
          <Text style={{ color: theme.colors.warning || '#d97706', fontSize: 12 }}>{warning}</Text>
        </View>
      )}
      <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
        <ModalButton label="Back" kind="secondary" onPress={onCancel} />
        <ModalButton label={confirmLabel} kind={danger ? 'danger' : 'primary'} onPress={onConfirm} busy={busy} />
      </View>
    </View>
  );
}