// Sync Queue — offline operation visibility. Layer 12: token-based rebuild.
// Pending + failed items are readable, human-labelled and never show queue IDs.
// (kitchen)/(courier) re-export this screen.
import React, { useState } from 'react';
import { View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useOfflineQueue, type QueueItem, type FailedItem } from '@/services/offline-queue';
import { useAppTheme } from '@/design/use-app-theme';
import { Screen, PageHeader, SectionHeader } from '@/components/ui/screen';
import { Card } from '@/components/ui/surface';
import { ListRow } from '@/components/ui/list-row';
import { StatusPill } from '@/components/ui/status-pill';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/states';
import { AppText } from '@/components/ui/text';
import { CustomAlertModal, type AlertConfig } from '@/components/CustomAlertModal';

function labelForType(t: string): string {
  switch (t) {
    case 'staff_checkin': return 'Staff check-in';
    case 'attendee_checkin': return 'Attendee check-in';
    case 'pre_inspection': return 'Pre-event inspection';
    case 'post_inspection': return 'Post-event inspection';
    case 'damage_report': return 'Damage report';
    case 'live_complaint': return 'Live complaint';
    case 'loyalty_scan': return 'Loyalty scan';
    case 'attendance_punch': return 'Attendance punch';
    case 'donation_collection': return 'Donation collection';
    default: return 'Queued item';
  }
}

function timeLabel(ts: number): string {
  return new Date(ts).toLocaleTimeString('en-ZA', { hour: '2-digit', minute: '2-digit' });
}

export default function SyncQueueScreen() {
  const theme = useAppTheme();
  const { queue, failed, isOnline, retryFailed, discardFailed, removeItem } = useOfflineQueue();
  const [alertConfig, setAlertConfig] = useState<AlertConfig>({ visible: false, title: '', message: '' });

  const act = async (label: string, fn: () => Promise<unknown>) => {
    try { await fn(); }
    catch (e: any) {
      setAlertConfig({ visible: true, title: `${label} failed`, message: e?.message || 'Could not complete.', type: 'error' });
    }
  };

  return (
    <Screen scroll>
      <PageHeader
        title="Sync queue"
        subtitle={isOnline ? 'Online — items sync automatically' : 'Working offline — items will sync when connection returns'}
        showBack
        fallback="/(staff)/staff-dashboard"
        right={<StatusPill status={isOnline ? 'online' : 'offline'} size="sm" />}
      />

      <SectionHeader title={`Pending (${queue.length})`} />
      {queue.length === 0 ? (
        <EmptyState icon="cloud-done-outline" title="Nothing queued" message="Offline scans and punches appear here until they sync." />
      ) : (
        <Card padding="none" style={{ paddingHorizontal: theme.space.lg }}>
          {queue.map((q: QueueItem, i) => (
            <View key={q.id} style={i > 0 ? { borderTopWidth: 1, borderTopColor: theme.colors.border } : undefined}>
              <ListRow
                title={labelForType(q.type)}
                subtitle={`Queued ${timeLabel(q.timestamp)} · will sync when connection returns${q.retries > 0 ? ` · attempt ${q.retries + 1}` : ''}${q.lastError ? `\nLast error: ${q.lastError}` : ''}`}
                status={<StatusPill status={q.status} size="sm" />}
                trailing={
                  <Button label="Discard" variant="ghost" fullWidth={false} onPress={() => act('Discard', () => removeItem(q.id))} />
                }
                showChevron={false}
              />
            </View>
          ))}
        </Card>
      )}

      <SectionHeader title={`Needs attention (${failed.length})`} />
      {failed.length === 0 ? (
        <AppText variant="body" tone="muted">No failed operations.</AppText>
      ) : (
        <Card padding="none" style={{ paddingHorizontal: theme.space.lg }}>
          {failed.map((f: FailedItem, i) => (
            <View key={f.item.id} style={[{ paddingVertical: theme.space.md, gap: theme.space.sm }, i > 0 ? { borderTopWidth: 1, borderTopColor: theme.colors.border } : null]}>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: theme.space.sm }}>
                <AppText variant="bodyStrong" style={{ flex: 1 }}>{labelForType(f.item.type)}</AppText>
                <StatusPill status="failed" size="sm" />
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: theme.space.sm }}>
                <Ionicons name="alert-circle-outline" size={theme.iconSize.sm} color={theme.colors.warningStrong} />
                <AppText variant="caption" color={theme.colors.warningStrong} style={{ flex: 1 }}>
                  Failed {timeLabel(f.failedAt)} after {f.item.retries} attempt(s). {f.error}
                </AppText>
              </View>
              <View style={{ flexDirection: 'row', gap: theme.space.sm }}>
                <Button label="Retry now" fullWidth={false} style={{ flex: 1 }} onPress={() => act('Retry', () => retryFailed(f.item.id))} />
                <Button label="Discard" variant="secondary" fullWidth={false} style={{ flex: 1 }} onPress={() => act('Discard', () => discardFailed(f.item.id))} />
              </View>
            </View>
          ))}
        </Card>
      )}
      <View style={{ height: theme.space['4xl'] }} />
      <CustomAlertModal config={alertConfig} onClose={() => setAlertConfig((p) => ({ ...p, visible: false }))} />
    </Screen>
  );
}
