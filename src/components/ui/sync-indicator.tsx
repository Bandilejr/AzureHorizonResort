// src/components/ui/sync-indicator.tsx — offline is normal: quiet, readable
// state for connectivity and the offline queue. Never a scary red banner.
import React, { useEffect, useState } from 'react';
import { Pressable, View, StyleSheet } from 'react-native';
import NetInfo from '@react-native-community/netinfo';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme } from '@/design/use-app-theme';
import { offlineQueue } from '@/services/offline-queue';
import { AppText } from './text';

let queueInitialized = false;

export interface SyncStatus {
  online: boolean;
  queued: number;
  failed: number;
}

export function useSyncStatus(): SyncStatus {
  const [status, setStatus] = useState<SyncStatus>({ online: true, queued: 0, failed: 0 });
  useEffect(() => {
    if (!queueInitialized) {
      queueInitialized = true;
      offlineQueue.initialize().catch(() => {});
    }
    const unsubQ = offlineQueue.subscribe((q) => setStatus((s) => ({ ...s, queued: q.length })));
    const unsubF = offlineQueue.subscribeFailed((f) => setStatus((s) => ({ ...s, failed: f.length })));
    const unsubNet = NetInfo.addEventListener((n) =>
      setStatus((s) => ({ ...s, online: n.isConnected ?? true })),
    );
    return () => {
      unsubQ();
      unsubF();
      unsubNet();
    };
  }, []);
  return status;
}

export function SyncIndicator({ onPress }: { onPress?: () => void }) {
  const theme = useAppTheme();
  const { online, queued, failed } = useSyncStatus();

  let icon: React.ComponentProps<typeof Ionicons>['name'] = 'checkmark-circle';
  let color: string = theme.colors.success;
  let label = 'Up to date';
  if (!online) {
    icon = 'cloud-offline-outline';
    color = theme.colors.textMuted;
    label = 'Working offline';
  } else if (failed > 0) {
    icon = 'alert-circle-outline';
    color = theme.colors.warning;
    label = `${failed} need${failed === 1 ? 's' : ''} attention`;
  } else if (queued > 0) {
    icon = 'sync-outline';
    color = theme.colors.info;
    label = `Syncing ${queued}`;
  }

  const body = (
    <View style={[styles.wrap, { backgroundColor: theme.colors.surfaceVariant }]}>
      <Ionicons name={icon} size={theme.iconSize.xs} color={color} />
      <AppText variant="micro" color={color} weight="600">
        {label}
      </AppText>
    </View>
  );
  if (!onPress) return body;
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={`Sync status: ${label}`}>
      {body}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderRadius: 9999,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
});

export default SyncIndicator;
