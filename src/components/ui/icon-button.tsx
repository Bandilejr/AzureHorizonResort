// src/components/ui/icon-button.tsx — accessible icon-only control (>=44pt).
import React from 'react';
import { Pressable, View, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme } from '@/design/use-app-theme';
import { AppText } from './text';

export interface IconButtonProps {
  name: React.ComponentProps<typeof Ionicons>['name'];
  onPress?: () => void;
  size?: 'sm' | 'md' | 'lg';
  color?: string;
  badge?: number;
  accessibilityLabel: string;
  style?: StyleProp<ViewStyle>;
}

export function IconButton({
  name,
  onPress,
  size = 'md',
  color,
  badge,
  accessibilityLabel,
  style,
}: IconButtonProps) {
  const theme = useAppTheme();
  const px = size === 'sm' ? theme.iconSize.sm : size === 'lg' ? theme.iconSize.lg : theme.iconSize.md;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      hitSlop={6}
      style={({ pressed }) => [
        {
          width: theme.layout.minTouchTarget,
          height: theme.layout.minTouchTarget,
          alignItems: 'center',
          justifyContent: 'center',
          borderRadius: theme.radius.md,
          backgroundColor: pressed ? theme.colors.surfaceVariant : 'transparent',
        },
        style,
      ]}
    >
      <Ionicons name={name} size={px} color={color ?? theme.colors.textSecondary} />
      {badge != null && badge > 0 ? (
        <View
          style={[
            styles.badge,
            { backgroundColor: theme.colors.error, borderColor: theme.colors.surface },
          ]}
        >
          <AppText variant="micro" color={theme.colors.textInverse} weight="700">
            {badge > 99 ? '99+' : String(badge)}
          </AppText>
        </View>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  badge: {
    position: 'absolute',
    top: 6,
    right: 6,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    borderWidth: 1.5,
    paddingHorizontal: 3,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

export default IconButton;
