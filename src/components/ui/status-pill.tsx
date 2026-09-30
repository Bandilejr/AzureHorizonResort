// src/components/ui/status-pill.tsx — THE status language.
// Every status = icon + label + controlled color + optional context.
// Never color alone. Labels come from the shared formatStatus(); the map below
// uses the EXACT source enum values (types/increment2.ts, types/workforce.ts).
import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme } from '@/design/use-app-theme';
import type { Theme } from '@/design/tokens';
import { formatStatus } from '@/utils/status-labels';
import { AppText } from './text';

type Tone = 'success' | 'warning' | 'error' | 'info' | 'neutral' | 'primary' | 'accent';
type IoniconName = React.ComponentProps<typeof Ionicons>['name'];

interface StatusMeta {
  tone: Tone;
  icon: IoniconName;
}

// Exact enums → tone + icon. Anything unmapped falls back to neutral.
const STATUS_META: Record<string, StatusMeta> = {
  // NPO verification (UC34)
  pending: { tone: 'warning', icon: 'time-outline' },
  under_review: { tone: 'info', icon: 'eye-outline' },
  approved: { tone: 'success', icon: 'checkmark-circle-outline' },
  rejected: { tone: 'error', icon: 'close-circle-outline' },
  // Donation batch (UC35–UC39)
  draft: { tone: 'neutral', icon: 'document-outline' },
  safety_verified_unassigned: { tone: 'info', icon: 'shield-checkmark-outline' },
  allocated_awaiting_claim: { tone: 'warning', icon: 'hourglass-outline' },
  claimed_ready_for_scheduling: { tone: 'primary', icon: 'bookmark-outline' },
  collection_scheduled: { tone: 'info', icon: 'calendar-outline' },
  collected_completed: { tone: 'success', icon: 'checkmark-done-outline' },
  cancelled: { tone: 'neutral', icon: 'ban-outline' },
  // Leave (UC41)
  // pending/approved/rejected covered above
  // Shift swap (UC43)
  pending_peer: { tone: 'warning', icon: 'people-outline' },
  peer_accepted: { tone: 'info', icon: 'person-add-outline' },
  pending_manager: { tone: 'warning', icon: 'briefcase-outline' },
  // Open shift (UC44)
  open: { tone: 'info', icon: 'lock-open-outline' },
  filled: { tone: 'success', icon: 'checkmark-circle-outline' },
  // Roster (UC42)
  validated: { tone: 'info', icon: 'checkmark-outline' },
  published: { tone: 'success', icon: 'megaphone-outline' },
  // Attendance session (UC45)
  scheduled: { tone: 'info', icon: 'calendar-outline' },
  clocked_in: { tone: 'success', icon: 'log-in-outline' },
  clocked_out: { tone: 'neutral', icon: 'log-out-outline' },
  auto_closed: { tone: 'warning', icon: 'alarm-outline' },
  // Attendance exception types
  late_arrival: { tone: 'warning', icon: 'time-outline' },
  early_departure: { tone: 'warning', icon: 'exit-outline' },
  unscheduled_overtime: { tone: 'info', icon: 'add-circle-outline' },
  outside_geofence: { tone: 'error', icon: 'location-outline' },
  missing_clock_out: { tone: 'error', icon: 'help-circle-outline' },
  // Attendance review
  exception_review: { tone: 'warning', icon: 'alert-circle-outline' },
  verified: { tone: 'success', icon: 'shield-checkmark-outline' },
  // Device
  active: { tone: 'success', icon: 'phone-portrait-outline' },
  revoked: { tone: 'error', icon: 'close-circle-outline' },
  pending_reset: { tone: 'warning', icon: 'refresh-outline' },
  // Offline queue
  queued: { tone: 'info', icon: 'cloud-upload-outline' },
  sending: { tone: 'info', icon: 'sync-outline' },
  retrying: { tone: 'warning', icon: 'refresh-outline' },
  failed: { tone: 'error', icon: 'alert-circle-outline' },
  // Collection pass / system (UI states)
  invalid: { tone: 'error', icon: 'close-circle-outline' },
  expired: { tone: 'error', icon: 'timer-outline' },
  stale: { tone: 'warning', icon: 'hourglass-outline' },
  already_used: { tone: 'neutral', icon: 'repeat-outline' },
  offline: { tone: 'neutral', icon: 'cloud-offline-outline' },
  online: { tone: 'success', icon: 'cloud-done-outline' },
  syncing: { tone: 'info', icon: 'sync-outline' },
  up_to_date: { tone: 'success', icon: 'checkmark-circle-outline' },
  // Urgency
  normal: { tone: 'neutral', icon: 'ellipse-outline' },
  urgent: { tone: 'warning', icon: 'flash-outline' },
  critical: { tone: 'error', icon: 'warning-outline' },
};

function toneColors(theme: Theme, tone: Tone): { fg: string; bg: string } {
  const c = theme.colors;
  switch (tone) {
    case 'success': return { fg: c.successStrong, bg: c.successSoft };
    case 'warning': return { fg: c.warningStrong, bg: c.warningSoft };
    case 'error': return { fg: c.errorStrong, bg: c.errorSoft };
    case 'info': return { fg: c.infoStrong, bg: c.infoSoft };
    case 'primary': return { fg: c.primary, bg: c.primarySoft };
    case 'accent': return { fg: c.accent, bg: c.accentSoft };
    default: return { fg: c.textSecondary, bg: c.surfaceVariant };
  }
}

export interface StatusPillProps {
  status: string;
  /** Override the human label (defaults to formatStatus(status)). */
  label?: string;
  size?: 'sm' | 'md';
}

export function StatusPill({ status, label, size = 'md' }: StatusPillProps) {
  const theme = useAppTheme();
  const meta = STATUS_META[status] ?? { tone: 'neutral' as Tone, icon: 'ellipse-outline' as IoniconName };
  const c = toneColors(theme, meta.tone);
  const pad = size === 'sm' ? { paddingHorizontal: 8, paddingVertical: 2 } : { paddingHorizontal: 10, paddingVertical: 4 };
  return (
    <View
      accessibilityLabel={`Status: ${label ?? formatStatus(status)}`}
      style={[styles.pill, { backgroundColor: c.bg, gap: 4 }, pad]}
    >
      <Ionicons name={meta.icon} size={size === 'sm' ? 12 : 14} color={c.fg} />
      <AppText variant={size === 'sm' ? 'micro' : 'caption'} color={c.fg} weight="600">
        {label ?? formatStatus(status)}
      </AppText>
    </View>
  );
}

export interface StatusRowProps {
  status: string;
  label?: string;
  context?: string;
  style?: object;
}

export function StatusRow({ status, label, context, style }: StatusRowProps) {
  const theme = useAppTheme();
  return (
    <View style={[styles.row, { gap: theme.space.sm }, style]}>
      <StatusPill status={status} label={label} />
      {context ? (
        <AppText variant="caption" tone="secondary" numberOfLines={1} style={{ flex: 1 }}>
          {context}
        </AppText>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  pill: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', borderRadius: 9999 },
  row: { flexDirection: 'row', alignItems: 'center' },
});

export default StatusPill;
