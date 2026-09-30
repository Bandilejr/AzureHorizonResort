// src/components/ui/metric-card.tsx — tappable metric rail tile.
// Contextual by contract: callers pass a full label ("12 Pending NPO Reviews"),
// never a bare number with no meaning.
import React from 'react';
import { View, Pressable, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme } from '@/design/use-app-theme';
import { AppText } from './text';

export interface MetricCardProps {
  value: string | number;
  label: string;
  icon?: React.ComponentProps<typeof Ionicons>['name'];
  tone?: 'default' | 'primary' | 'success' | 'warning' | 'error' | 'info';
  onPress?: () => void;
  loading?: boolean;
}

export function MetricCard({
  value,
  label,
  icon,
  tone = 'default',
  onPress,
  loading = false,
}: MetricCardProps) {
  const theme = useAppTheme();
  const fg = {
    default: theme.colors.text,
    primary: theme.colors.primary,
    success: theme.colors.success,
    warning: theme.colors.warning,
    error: theme.colors.error,
    info: theme.colors.info,
  }[tone];

  const body = (
    <View
      style={[
        styles.card,
        {
          backgroundColor: theme.colors.surface,
          borderColor: theme.colors.border,
          borderRadius: theme.radius.lg,
          padding: theme.space.lg,
          gap: theme.space.sm,
        },
      ]}
    >
      {icon ? <Ionicons name={icon} size={theme.iconSize.md} color={fg} /> : null}
      <AppText variant="metric" color={fg}>
        {loading ? '—' : value}
      </AppText>
      <AppText variant="caption" tone="secondary" numberOfLines={2}>
        {label}
      </AppText>
    </View>
  );

  if (!onPress) return body;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${label}: ${value}`}
      style={({ pressed }) => [{ flex: 1 }, pressed ? { opacity: 0.85 } : null]}
    >
      {body}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { flex: 1, borderWidth: 1 },
});

export default MetricCard;
