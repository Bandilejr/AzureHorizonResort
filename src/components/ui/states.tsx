// src/components/ui/states.tsx — empty, error and loading states.
// Empty states say what is empty, why, and what to do next. Loading uses
// layout-preserving skeletons, never full-screen spinners.
import React, { useEffect, useState } from 'react';
import { View, Animated, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme } from '@/design/use-app-theme';
import { AppText } from './text';
import { Button } from './button';

export interface EmptyStateProps {
  icon?: React.ComponentProps<typeof Ionicons>['name'];
  title: string;
  message?: string;
  actionLabel?: string;
  onAction?: () => void;
  style?: StyleProp<ViewStyle>;
}

export function EmptyState({ icon = 'file-tray-outline', title, message, actionLabel, onAction, style }: EmptyStateProps) {
  const theme = useAppTheme();
  return (
    <View style={[styles.center, { paddingVertical: theme.space['4xl'], gap: theme.space.sm }, style]}>
      <Ionicons name={icon} size={36} color={theme.colors.textMuted} />
      <AppText variant="subtitle" align="center">
        {title}
      </AppText>
      {message ? (
        <AppText variant="body" tone="secondary" align="center" style={{ maxWidth: 320 }}>
          {message}
        </AppText>
      ) : null}
      {actionLabel && onAction ? (
        <Button label={actionLabel} onPress={onAction} fullWidth={false} variant="secondary" style={{ marginTop: theme.space.md }} />
      ) : null}
    </View>
  );
}

export interface ErrorStateProps {
  title?: string;
  message: string;
  details?: string;
  onRetry?: () => void;
  style?: StyleProp<ViewStyle>;
}

export function ErrorState({ title = 'Something went wrong', message, details, onRetry, style }: ErrorStateProps) {
  const theme = useAppTheme();
  return (
    <View style={[styles.center, { paddingVertical: theme.space['4xl'], gap: theme.space.sm }, style]}>
      <Ionicons name="alert-circle-outline" size={36} color={theme.colors.error} />
      <AppText variant="subtitle" align="center">
        {title}
      </AppText>
      <AppText variant="body" tone="secondary" align="center" style={{ maxWidth: 320 }}>
        {message}
      </AppText>
      {details ? (
        <AppText variant="micro" tone="muted" align="center" style={{ maxWidth: 320 }}>
          {details}
        </AppText>
      ) : null}
      {onRetry ? (
        <Button label="Try again" onPress={onRetry} fullWidth={false} variant="secondary" style={{ marginTop: theme.space.md }} />
      ) : null}
    </View>
  );
}

export function Skeleton({
  width = '100%',
  height = 16,
  radius = 8,
  style,
}: {
  width?: number | `${number}%`;
  height?: number;
  radius?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const theme = useAppTheme();
  const [opacity] = useState(() => new Animated.Value(0.5));
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 1, duration: 700, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0.5, duration: 700, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [opacity]);
  return (
    <Animated.View
      style={[
        { width, height, borderRadius: radius, backgroundColor: theme.colors.surfaceVariant, opacity },
        style,
      ]}
    />
  );
}

export function ListSkeleton({ rows = 4, style }: { rows?: number; style?: StyleProp<ViewStyle> }) {
  const theme = useAppTheme();
  return (
    <View style={[{ gap: theme.space.md }, style]}>
      {Array.from({ length: rows }).map((_, i) => (
        <View
          key={i}
          style={[
            styles.skeletonRow,
            { backgroundColor: theme.colors.surface, borderColor: theme.colors.border, borderRadius: theme.radius.lg, padding: theme.space.lg, gap: theme.space.sm },
          ]}
        >
          <Skeleton width="60%" height={14} />
          <Skeleton width="35%" height={12} />
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  center: { alignItems: 'center', justifyContent: 'center' },
  skeletonRow: { borderWidth: 1 },
});
