// src/components/ui/timeline.tsx — compact workflow timeline + activity items.
import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme } from '@/design/use-app-theme';
import { AppText } from './text';

export type TimelineState = 'done' | 'current' | 'pending';

export interface TimelineItem {
  label: string;
  time?: string;
  state?: TimelineState;
  description?: string;
}

export function Timeline({ items }: { items: TimelineItem[] }) {
  const theme = useAppTheme();
  return (
    <View style={{ gap: 0 }}>
      {items.map((it, i) => {
        const state = it.state ?? 'pending';
        const color =
          state === 'done' ? theme.colors.success : state === 'current' ? theme.colors.primary : theme.colors.borderStrong;
        const last = i === items.length - 1;
        return (
          <View key={`${it.label}-${i}`} style={[styles.item, { gap: theme.space.md }]}>
            <View style={styles.rail}>
              <View style={[styles.dot, { backgroundColor: color, borderColor: theme.colors.surface }]} />
              {!last ? <View style={[styles.line, { backgroundColor: theme.colors.border }]} /> : null}
            </View>
            <View style={{ flex: 1, paddingBottom: last ? 0 : theme.space.lg, gap: 2 }}>
              <View style={styles.titleRow}>
                <AppText variant={state === 'current' ? 'bodyStrong' : 'body'}>{it.label}</AppText>
                {it.time ? (
                  <AppText variant="micro" tone="muted">
                    {it.time}
                  </AppText>
                ) : null}
              </View>
              {it.description ? (
                <AppText variant="caption" tone="secondary">
                  {it.description}
                </AppText>
              ) : null}
            </View>
          </View>
        );
      })}
    </View>
  );
}

export interface ActivityItemProps {
  icon?: React.ComponentProps<typeof Ionicons>['name'];
  title: string;
  description?: string;
  time?: string;
  tone?: 'default' | 'primary' | 'success' | 'warning' | 'error' | 'info';
}

export function ActivityItem({ icon = 'ellipse', title, description, time, tone = 'default' }: ActivityItemProps) {
  const theme = useAppTheme();
  const fg = {
    default: theme.colors.textSecondary,
    primary: theme.colors.primary,
    success: theme.colors.success,
    warning: theme.colors.warning,
    error: theme.colors.error,
    info: theme.colors.info,
  }[tone];
  return (
    <View style={[styles.activity, { gap: theme.space.md, paddingVertical: theme.space.sm }]}>
      <View style={[styles.activityIcon, { backgroundColor: theme.colors.surfaceVariant }]}>
        <Ionicons name={icon} size={theme.iconSize.sm} color={fg} />
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <AppText variant="bodyStrong" numberOfLines={1}>
          {title}
        </AppText>
        {description ? (
          <AppText variant="caption" tone="secondary" numberOfLines={2}>
            {description}
          </AppText>
        ) : null}
      </View>
      {time ? (
        <AppText variant="micro" tone="muted">
          {time}
        </AppText>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  item: { flexDirection: 'row' },
  rail: { alignItems: 'center', width: 20 },
  dot: { width: 12, height: 12, borderRadius: 6, borderWidth: 2, marginTop: 4 },
  line: { width: 2, flex: 1, marginTop: 2 },
  titleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  activity: { flexDirection: 'row', alignItems: 'center' },
  activityIcon: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
});
