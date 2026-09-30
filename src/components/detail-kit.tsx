// Shared LIST → DETAIL → CONFIRM kit (remediation Phase C, §15–§17).
// Layer 7: rebuilt on the design system. Public API unchanged so the 24
// existing call sites keep working — only the chrome is upgraded.
// Every consequential object: tappable card → DetailModal (KV rows + evidence
// + history) → action → ConfirmBlock (summary + consequences) → execute →
// result → realtime list update.
import React, { useEffect, useRef, useState } from 'react';
import { View, StyleSheet, TouchableOpacity, Modal, ScrollView, Keyboard, PanResponder, Animated, Dimensions, TouchableWithoutFeedback } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme } from '@/design/use-app-theme';
import type { Theme } from '@/design/tokens';
import { AppText } from '@/components/ui/text';
import { StatusPill } from '@/components/ui/status-pill';
import { Button } from '@/components/ui/button';
import { DetailRow } from '@/components/ui/list-row';

export function statusColor(status: string, theme: Theme): string {
  const s = (status || '').toLowerCase();
  if (/approved|verified|completed|published|filled|collected|claimed|scheduled|success/.test(s)) return theme.colors.success;
  if (/pending|awaiting|review|progress|unassigned/.test(s)) return theme.colors.warning;
  if (/reject|fail|cancel|expired|error/.test(s)) return theme.colors.error;
  return theme.colors.primary;
}

export function KV({ label, value }: { label: string; value: string }) {
  return <DetailRow label={label} value={value} />;
}

export function SectionTitle({ children }: { children: React.ReactNode }) {
  const theme = useAppTheme();
  return (
    <AppText variant="micro" tone="muted" weight="700" style={{ letterSpacing: 0.6, textTransform: 'uppercase', marginTop: theme.space.lg, marginBottom: theme.space.xs }}>
      {children}
    </AppText>
  );
}

export function StatusBadge({ status }: { status: string }) {
  return <StatusPill status={status} />;
}

export function DetailModal({ visible, title, onClose, children, actions }: {
  visible: boolean; title: string; onClose: () => void;
  children: React.ReactNode; actions?: React.ReactNode;
}) {
  const theme = useAppTheme();
  const screenH = Dimensions.get('window').height;
  const PEEK = Math.round(screenH * 0.45);
  const FULL = Math.round(screenH * 0.06);
  const [kbOpen, setKbOpen] = useState(false);
  const [kbHeight, setKbHeight] = useState(0);
  const [expanded, setExpanded] = useState(false);
  const translateY = useRef(new Animated.Value(PEEK)).current;
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
    onPanResponderGrant: () => { dragStart.current = posRef.current; },
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
      onRequestClose={() => { if (kbOpen) Keyboard.dismiss(); else close(); }}
    >
      <TouchableWithoutFeedback onPress={close}>
        <View style={[dmStyles.backdrop, { backgroundColor: theme.colors.overlay }]} />
      </TouchableWithoutFeedback>
      <Animated.View
        style={[dmStyles.sheet, { backgroundColor: theme.colors.surface, height: screenH, transform: [{ translateY }] }]}
      >
        <View {...pan.panHandlers} style={dmStyles.grabZone}>
          <View style={[dmStyles.handle, { backgroundColor: theme.colors.border }]} />
          <View style={dmStyles.header}>
            <AppText variant="subtitle" numberOfLines={1} style={{ flex: 1, marginRight: 8 }}>{title}</AppText>
            <TouchableOpacity onPress={close} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} accessibilityRole="button" accessibilityLabel="Close">
              <Ionicons name="close" size={theme.iconSize.lg} color={theme.colors.textMuted} />
            </TouchableOpacity>
          </View>
          <AppText variant="micro" tone="muted" align="center" style={{ marginBottom: 6 }}>
            {expanded ? 'Drag down to shrink' : 'Drag up for full details'}
          </AppText>
        </View>
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ paddingHorizontal: theme.space.lg, paddingBottom: (kbOpen ? kbHeight : 0) + 120 }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {children}
        </ScrollView>
        {actions ? <View style={[dmStyles.actions, { backgroundColor: theme.colors.surface, gap: theme.space.sm, padding: theme.space.lg }]}>{actions}</View> : null}
      </Animated.View>
    </Modal>
  );
}
const dmStyles = StyleSheet.create({
  backdrop: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  sheet: { position: 'absolute', left: 0, right: 0, top: 0, borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingTop: 8 },
  grabZone: { paddingBottom: 4 },
  handle: { width: 44, height: 5, borderRadius: 3, alignSelf: 'center', marginBottom: 8 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 2, paddingHorizontal: 16 },
  actions: { flexDirection: 'row' },
});

export function ModalButton({ label, onPress, kind = 'primary', disabled, busy }: {
  label: string; onPress: () => void; kind?: 'primary' | 'danger' | 'secondary';
  disabled?: boolean; busy?: boolean;
}) {
  return (
    <Button
      label={label}
      onPress={onPress}
      variant={kind === 'secondary' ? 'secondary' : kind === 'danger' ? 'danger' : 'primary'}
      disabled={disabled}
      loading={busy}
      fullWidth={false}
      style={{ flex: 1 }}
    />
  );
}

// Realtime failure banner (§32): never show silent zeros. Keeps last good
// data on screen; Retry re-subscribes (caller bumps a retry key).
export function LiveErrorBanner({ error, onRetry }: { error: string; onRetry: () => void }) {
  const theme = useAppTheme();
  if (!error) return null;
  return (
    <View style={{ backgroundColor: theme.colors.errorSoft, borderRadius: theme.radius.md, padding: theme.space.md, marginBottom: theme.space.sm, flexDirection: 'row', alignItems: 'center', gap: theme.space.sm }}>
      <Ionicons name="cloud-offline-outline" size={theme.iconSize.md} color={theme.colors.errorStrong} />
      <AppText variant="caption" color={theme.colors.errorStrong} style={{ flex: 1 }}>
        Unable to load live data: {error}. Showing last known state.
      </AppText>
      <TouchableOpacity onPress={onRetry} style={{ borderWidth: 1, borderColor: theme.colors.errorStrong, borderRadius: theme.radius.sm, paddingHorizontal: 10, paddingVertical: 6 }} accessibilityRole="button">
        <AppText variant="label" color={theme.colors.errorStrong} weight="700">Retry</AppText>
      </TouchableOpacity>
    </View>
  );
}

export function ConfirmBlock({ title, rows, warning, confirmLabel, danger, onConfirm, onCancel, busy }: {
  title: string; rows: [string, string][]; warning?: string;
  confirmLabel: string; danger?: boolean;
  onConfirm: () => void; onCancel: () => void; busy?: boolean;
}) {
  const theme = useAppTheme();
  return (
    <View>
      <AppText variant="subtitle" style={{ marginBottom: theme.space.sm }}>{title}</AppText>
      {rows.map(([k, v]) => <KV key={k} label={k} value={v} />)}
      {warning ? (
        <View style={{ backgroundColor: theme.colors.warningSoft, borderRadius: theme.radius.md, padding: theme.space.md, marginTop: theme.space.sm, flexDirection: 'row', gap: theme.space.sm }}>
          <Ionicons name="warning-outline" size={theme.iconSize.sm} color={theme.colors.warningStrong} />
          <AppText variant="caption" color={theme.colors.warningStrong} style={{ flex: 1 }}>{warning}</AppText>
        </View>
      ) : null}
      <View style={{ flexDirection: 'row', gap: theme.space.sm, marginTop: theme.space.md }}>
        <ModalButton label="Back" kind="secondary" onPress={onCancel} />
        <ModalButton label={confirmLabel} kind={danger ? 'danger' : 'primary'} onPress={onConfirm} busy={busy} />
      </View>
    </View>
  );
}
