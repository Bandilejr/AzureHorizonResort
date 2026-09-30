// src/components/ui/screen.tsx — screen containers, page header, section header.
import React, { type ReactNode } from 'react';
import {
  View,
  ScrollView,
  Pressable,
  StyleSheet,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAppTheme } from '@/design/use-app-theme';
import { goBack } from '@/utils/navigation';
import { AppText } from './text';
import { IconButton } from './icon-button';

export interface ScreenProps {
  children: ReactNode;
  scroll?: boolean;
  padded?: boolean;
  style?: StyleProp<ViewStyle>;
  contentContainerStyle?: StyleProp<ViewStyle>;
}

export function Screen({
  children,
  scroll = false,
  padded = true,
  style,
  contentContainerStyle,
}: ScreenProps) {
  const theme = useAppTheme();
  const insets = useSafeAreaInsets();
  const padding = padded ? theme.space.lg : 0;

  if (scroll) {
    return (
      <ScrollView
        style={[{ flex: 1, backgroundColor: theme.colors.background }, style]}
        contentContainerStyle={[
          { padding, paddingBottom: insets.bottom + theme.space['4xl'] },
          contentContainerStyle,
        ]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {children}
      </ScrollView>
    );
  }
  return (
    <View style={[{ flex: 1, backgroundColor: theme.colors.background, padding }, style]}>
      {children}
    </View>
  );
}

export interface PageHeaderProps {
  title: string;
  subtitle?: string;
  showBack?: boolean;
  onBack?: () => void;
  fallback?: string;
  right?: ReactNode;
  style?: StyleProp<ViewStyle>;
}

export function PageHeader({
  title,
  subtitle,
  showBack = false,
  onBack,
  fallback = '/',
  right,
  style,
}: PageHeaderProps) {
  const theme = useAppTheme();
  const router = useRouter();
  return (
    <View style={[styles.pageHeader, { gap: theme.space.sm, marginBottom: theme.space.lg }, style]}>
      {showBack ? (
        <IconButton
          name="arrow-back"
          accessibilityLabel="Go back"
          onPress={() => (onBack ? onBack() : goBack(router, fallback))}
        />
      ) : null}
      <View style={{ flex: 1 }}>
        <AppText variant="title" numberOfLines={1}>
          {title}
        </AppText>
        {subtitle ? (
          <AppText variant="caption" tone="secondary" numberOfLines={1}>
            {subtitle}
          </AppText>
        ) : null}
      </View>
      {right}
    </View>
  );
}

export interface SectionHeaderProps {
  title: string;
  actionLabel?: string;
  onAction?: () => void;
  style?: StyleProp<ViewStyle>;
}

export function SectionHeader({ title, actionLabel, onAction, style }: SectionHeaderProps) {
  const theme = useAppTheme();
  return (
    <View
      style={[
        styles.sectionHeader,
        { marginTop: theme.space['2xl'], marginBottom: theme.space.sm },
        style,
      ]}
    >
      <AppText variant="micro" tone="muted" weight="700" style={styles.sectionTitle}>
        {title}
      </AppText>
      {actionLabel && onAction ? (
        <Pressable onPress={onAction} accessibilityRole="button" hitSlop={8}>
          <AppText variant="label" tone="primary" weight="600">
            {actionLabel}
          </AppText>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  pageHeader: { flexDirection: 'row', alignItems: 'center' },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sectionTitle: { textTransform: 'uppercase', letterSpacing: 0.6 },
});

export default Screen;
