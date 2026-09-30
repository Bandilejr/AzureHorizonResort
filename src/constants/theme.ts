// src/constants/theme.ts — COMPATIBILITY SHIM.
//
// The single source of truth is now `src/design/tokens.ts`. This file
// re-exports the token system and additionally exposes the legacy API
// (Spacing, BorderRadius, Typography, Shadows, Layout, Transitions) so the
// pre-existing 90+ screens keep compiling while they are migrated layer by
// layer. New/redesigned UI must import from `@/design/tokens` directly.
import { Platform, StatusBar, useColorScheme } from 'react-native';
import {
  Colors,
  lightColors,
  darkColors,
  space,
  radius,
  fontFamily,
  fontWeight,
  fontSize,
  lineHeight,
  text,
  elevation,
  motion,
  layout,
  zIndex,
  iconSize,
  lightTheme as baseLightTheme,
  darkTheme as baseDarkTheme,
  BottomTabInset,
  MaxContentWidth,
  type ColorScheme,
  type ThemeColor,
} from '@/design/tokens';

// New token system (preferred for all new/redesigned UI).
export {
  Colors,
  lightColors,
  darkColors,
  space,
  radius,
  fontFamily,
  fontWeight,
  fontSize,
  lineHeight,
  text,
  elevation,
  motion,
  zIndex,
  iconSize,
  BottomTabInset,
  MaxContentWidth,
  Platform,
  StatusBar,
  useColorScheme,
};
export type { ColorScheme, ThemeColor };

// ─────────────────────────────────────────────────────────────────────────────
// LEGACY TOKENS (frozen; do not extend — migrate off these).
// ─────────────────────────────────────────────────────────────────────────────
export const Spacing = {
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
} as const;

export const BorderRadius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  full: 9999,
} as const;

export const Typography = {
  fontSizes: {
    xs: 12,
    sm: 14,
    md: 16,
    lg: 18,
    xl: 20,
    xxl: 24,
    xxxl: 32,
    display: 42,
  },
  fontWeights: {
    regular: '400',
    medium: '500',
    semiBold: '600',
    bold: '700',
    extraBold: '800',
  },
  lineHeights: {
    tight: 1.2,
    normal: 1.5,
    relaxed: 1.75,
  },
  fontFamilies: {
    sans: fontFamily.sans,
    serif: 'serif',
    mono: fontFamily.mono,
  },
} as const;

export const Fonts = {
  sans: fontFamily.sans,
  serif: 'serif',
  mono: fontFamily.mono,
} as const;

export const Shadows = {
  sm: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  md: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  lg: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15,
    shadowRadius: 16,
    elevation: 8,
  },
  xl: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 16 },
    shadowOpacity: 0.2,
    shadowRadius: 24,
    elevation: 12,
  },
} as const;

export const Layout = {
  screenPadding: 16,
  screenPaddingHorizontal: 16,
  screenPaddingVertical: 16,
  contentMaxWidth: 600,
  headerHeight: 56,
  tabBarHeight: 80,
  fabSize: 56,
} as const;

export const ZIndex = zIndex;

export const Transitions = {
  fast: 150,
  normal: 250,
  slow: 350,
} as const;

// ─────────────────────────────────────────────────────────────────────────────
// MERGED THEME (new tokens + legacy keys) — consumed by getTheme().
// ─────────────────────────────────────────────────────────────────────────────
const legacyExtensions = {
  spacing: Spacing,
  borderRadius: BorderRadius,
  typography: Typography,
  shadows: Shadows,
  transitions: Transitions,
} as const;

export const lightTheme = {
  ...baseLightTheme,
  ...legacyExtensions,
  layout: { ...baseLightTheme.layout, ...Layout },
  zIndex,
} as const;

export const darkTheme = {
  ...baseDarkTheme,
  ...legacyExtensions,
  layout: { ...baseDarkTheme.layout, ...Layout },
  zIndex,
} as const;

export type Theme = typeof lightTheme | typeof darkTheme;

export const getTheme = (colorScheme: ColorScheme | 'unspecified' | null | undefined): Theme =>
  colorScheme === 'dark' ? darkTheme : lightTheme;
