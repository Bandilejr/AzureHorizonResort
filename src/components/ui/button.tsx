// src/components/ui/button.tsx — one button family. Contextual labels are the
// caller's responsibility ("Confirm Allocation", never "Submit").
import React from 'react';
import {
  Pressable,
  View,
  ActivityIndicator,
  StyleSheet,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme } from '@/design/use-app-theme';
import { AppText } from './text';

export type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost';
export type ButtonSize = 'md' | 'lg';

export interface ButtonProps {
  label: string;
  onPress: () => void;
  variant?: ButtonVariant;
  size?: ButtonSize;
  disabled?: boolean;
  loading?: boolean;
  icon?: React.ComponentProps<typeof Ionicons>['name'];
  fullWidth?: boolean;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
}

export function Button({
  label,
  onPress,
  variant = 'primary',
  size = 'md',
  disabled = false,
  loading = false,
  icon,
  fullWidth = true,
  style,
  accessibilityLabel,
}: ButtonProps) {
  const theme = useAppTheme();
  const height = size === 'lg' ? 54 : 48;
  const isDisabled = disabled || loading;

  const palette = {
    primary: { bg: theme.colors.primary, fg: theme.colors.textInverse, border: 'transparent' },
    secondary: { bg: 'transparent', fg: theme.colors.primary, border: theme.colors.primary },
    danger: { bg: theme.colors.error, fg: theme.colors.textInverse, border: 'transparent' },
    ghost: { bg: 'transparent', fg: theme.colors.textSecondary, border: 'transparent' },
  } as const;
  const p = palette[variant];

  return (
    <Pressable
      onPress={onPress}
      disabled={isDisabled}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled: isDisabled, busy: loading }}
      style={({ pressed }) => [
        styles.base,
        {
          height,
          backgroundColor: p.bg,
          borderColor: p.border,
          borderWidth: variant === 'secondary' ? 1 : 0,
          borderRadius: theme.radius.md,
          opacity: isDisabled ? 0.5 : pressed ? 0.85 : 1,
          alignSelf: fullWidth ? 'stretch' : 'flex-start',
          paddingHorizontal: fullWidth ? 0 : theme.space.xl,
        },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={p.fg} />
      ) : (
        <View style={[styles.content, { gap: theme.space.sm }]}>
          {icon ? <Ionicons name={icon} size={theme.iconSize.md} color={p.fg} /> : null}
          <AppText variant="bodyStrong" color={p.fg} numberOfLines={1}>
            {label}
          </AppText>
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: { alignItems: 'center', justifyContent: 'center' },
  content: { flexDirection: 'row', alignItems: 'center' },
});

export default Button;
