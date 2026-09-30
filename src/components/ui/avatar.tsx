// src/components/ui/avatar.tsx — initials avatar + role badge.
import React from 'react';
import { Pressable, View, StyleSheet } from 'react-native';
import { useAppTheme } from '@/design/use-app-theme';
import { AppText } from './text';

function initialsFrom(label?: string): string {
  const parts = (label || '').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export interface AvatarProps {
  label?: string;
  size?: number;
  onPress?: () => void;
}

export function Avatar({ label, size = 36, onPress }: AvatarProps) {
  const theme = useAppTheme();
  const body = (
    <View
      style={[
        styles.circle,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: theme.colors.primarySoft,
          borderColor: theme.colors.primaryBorder,
        },
      ]}
    >
      <AppText color={theme.colors.primary} weight="700" style={{ fontSize: Math.round(size * 0.38) }}>
        {initialsFrom(label)}
      </AppText>
    </View>
  );
  if (!onPress) return body;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel="Open profile"
      hitSlop={6}
    >
      {body}
    </Pressable>
  );
}

export interface RoleBadgeProps {
  label: string;
  tone?: 'primary' | 'accent' | 'muted';
}

export function RoleBadge({ label, tone = 'primary' }: RoleBadgeProps) {
  const theme = useAppTheme();
  const map = {
    primary: { bg: theme.colors.primarySoft, fg: theme.colors.primary },
    accent: { bg: theme.colors.accentSoft, fg: theme.colors.accent },
    muted: { bg: theme.colors.surfaceVariant, fg: theme.colors.textSecondary },
  } as const;
  const c = map[tone];
  return (
    <View style={[styles.roleBadge, { backgroundColor: c.bg }]}>
      <AppText variant="micro" color={c.fg} weight="600">
        {label}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  circle: { alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
  roleBadge: {
    alignSelf: 'flex-start',
    borderRadius: 9999,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
});

export default Avatar;
