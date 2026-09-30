// src/components/ui/list-row.tsx — rows, detail rows and detail sections.
import React, { type ReactNode } from 'react';
import { View, Pressable, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme } from '@/design/use-app-theme';
import { AppText } from './text';

export interface ListRowProps {
  title: string;
  subtitle?: string;
  leading?: ReactNode;
  trailing?: ReactNode;
  status?: ReactNode;
  onPress?: () => void;
  showChevron?: boolean;
}

export function ListRow({
  title,
  subtitle,
  leading,
  trailing,
  status,
  onPress,
  showChevron = !!onPress,
}: ListRowProps) {
  const theme = useAppTheme();
  const body = (
    <View style={[styles.row, { paddingVertical: theme.space.md, gap: theme.space.md }]}>
      {leading ? <View>{leading}</View> : null}
      <View style={{ flex: 1, gap: 2 }}>
        <AppText variant="bodyStrong" numberOfLines={1}>
          {title}
        </AppText>
        {subtitle ? (
          <AppText variant="caption" tone="secondary" numberOfLines={2}>
            {subtitle}
          </AppText>
        ) : null}
        {status ? <View style={{ marginTop: 4 }}>{status}</View> : null}
      </View>
      {trailing}
      {showChevron ? (
        <Ionicons name="chevron-forward" size={theme.iconSize.md} color={theme.colors.textMuted} />
      ) : null}
    </View>
  );
  if (!onPress) return body;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={({ pressed }) => [pressed ? { opacity: 0.7 } : null]}
    >
      {body}
    </Pressable>
  );
}

export function DetailRow({ label, value }: { label: string; value?: string | null }) {
  const theme = useAppTheme();
  return (
    <View style={[styles.detailRow, { gap: theme.space.md, paddingVertical: theme.space.xs }]}>
      <AppText variant="caption" tone="muted" weight="600" style={{ flex: 1 }}>
        {label}
      </AppText>
      <AppText variant="body" style={{ flex: 2, textAlign: 'right' }}>
        {value && value.length > 0 ? value : '—'}
      </AppText>
    </View>
  );
}

export function DetailSection({
  title,
  children,
  action,
}: {
  title: string;
  children: ReactNode;
  action?: ReactNode;
}) {
  const theme = useAppTheme();
  return (
    <View style={{ marginTop: theme.space.xl }}>
      <View style={[styles.sectionHead, { marginBottom: theme.space.sm }]}>
        <AppText variant="micro" tone="muted" weight="700" style={styles.sectionTitle}>
          {title}
        </AppText>
        {action}
      </View>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center' },
  detailRow: { flexDirection: 'row', alignItems: 'flex-start' },
  sectionHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sectionTitle: { textTransform: 'uppercase', letterSpacing: 0.6 },
});

export default ListRow;
