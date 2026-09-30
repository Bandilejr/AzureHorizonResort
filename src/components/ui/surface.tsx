// src/components/ui/surface.tsx — surfaces, cards and dividers.
// Prefer 1px borders + tonal layering over heavy shadows.
import React from 'react';
import { View, Pressable, StyleSheet, type ViewProps, type ViewStyle } from 'react-native';
import { useAppTheme } from '@/design/use-app-theme';
import type { Theme } from '@/design/tokens';

type SpaceKey = keyof Theme['space'];
type RadiusKey = keyof Theme['radius'];
type ElevationKey = keyof Theme['elevation'];

export type SurfaceTone = 'surface' | 'elevated' | 'variant' | 'sunken' | 'primarySoft' | 'transparent';

function toneBg(theme: Theme, tone: SurfaceTone): string {
  const c = theme.colors;
  switch (tone) {
    case 'elevated': return c.surfaceElevated;
    case 'variant': return c.surfaceVariant;
    case 'sunken': return c.surfaceSunken;
    case 'primarySoft': return c.primarySoft;
    case 'transparent': return 'transparent';
    default: return c.surface;
  }
}

export interface SurfaceProps extends ViewProps {
  tone?: SurfaceTone;
  bordered?: boolean;
  radius?: RadiusKey;
  elevation?: ElevationKey;
  padding?: SpaceKey;
  gap?: SpaceKey;
}

export function Surface({
  tone = 'surface',
  bordered = false,
  radius = 'lg',
  elevation = 'none',
  padding,
  gap,
  style,
  children,
  ...rest
}: SurfaceProps) {
  const theme = useAppTheme();
  const s: ViewStyle = {
    backgroundColor: toneBg(theme, tone),
    borderRadius: theme.radius[radius],
    ...(padding ? { padding: theme.space[padding] } : null),
    ...(gap ? { gap: theme.space[gap] } : null),
    ...(bordered ? { borderWidth: 1, borderColor: theme.colors.border } : null),
    ...theme.elevation[elevation],
  };
  return (
    <View style={[s, style]} {...rest}>
      {children}
    </View>
  );
}

export interface CardProps extends SurfaceProps {
  onPress?: () => void;
  disabled?: boolean;
}

export function Card({
  onPress,
  disabled,
  tone = 'surface',
  bordered = true,
  radius = 'lg',
  elevation = 'subtle',
  padding = 'lg',
  gap,
  style,
  children,
  ...rest
}: CardProps) {
  const theme = useAppTheme();
  const base: ViewStyle = {
    backgroundColor: toneBg(theme, tone),
    borderRadius: theme.radius[radius],
    padding: theme.space[padding],
    ...(gap ? { gap: theme.space[gap] } : null),
    ...(bordered ? { borderWidth: 1, borderColor: theme.colors.border } : null),
    ...theme.elevation[elevation],
  };
  if (onPress) {
    return (
      <Pressable
        onPress={onPress}
        disabled={disabled}
        accessibilityRole="button"
        style={({ pressed }) => [base, pressed ? { opacity: 0.85 } : null, disabled ? { opacity: 0.5 } : null, style]}
      >
        {children}
      </Pressable>
    );
  }
  return (
    <View style={[base, style]} {...rest}>
      {children}
    </View>
  );
}

export function Divider({ style }: { style?: ViewStyle }) {
  const theme = useAppTheme();
  return <View style={[styles.divider, { backgroundColor: theme.colors.border }, style]} />;
}

const styles = StyleSheet.create({
  divider: { height: StyleSheet.hairlineWidth, width: '100%' },
});

export default Card;
