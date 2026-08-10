import { Platform, StatusBar, useColorScheme } from 'react-native';

export const BottomTabInset = Platform.select({ ios: 50, android: 80 }) ?? 0;

export const MaxContentWidth = 600;

export const Colors = {
  light: {
    primary: '#c9a227',
    primaryDark: '#b8921f',
    primaryLight: '#fef9e7',
    secondary: '#1e3a5f',
    secondaryDark: '#152a47',
    secondaryLight: '#e8ecf3',
    background: '#f8fafc',
    surface: '#ffffff',
    surfaceVariant: '#f1f5f9',
    border: '#e2e8f0',
    borderStrong: '#cbd5e1',
    text: '#0f172a',
    textSecondary: '#475569',
    textMuted: '#94a3b8',
    textInverse: '#ffffff',
    success: '#16a34a',
    successLight: '#dcfce7',
    warning: '#d97706',
    warningLight: '#fef3c7',
    error: '#dc2626',
    errorLight: '#fef2f2',
    info: '#2563eb',
    infoLight: '#dbeafe',
    overlay: 'rgba(15, 23, 42, 0.5)',
    shadow: 'rgba(15, 23, 42, 0.1)',
  },
  dark: {
    primary: '#e8b92a',
    primaryDark: '#d4a620',
    primaryLight: '#1e2a0a',
    secondary: '#60a5fa',
    secondaryDark: '#3b82f6',
    secondaryLight: '#1e293b',
    background: '#0f172a',
    surface: '#1e293b',
    surfaceVariant: '#334155',
    border: '#334155',
    borderStrong: '#475569',
    text: '#f8fafc',
    textSecondary: '#cbd5e1',
    textMuted: '#64748b',
    textInverse: '#0f172a',
    success: '#22c55e',
    successLight: '#14532e',
    warning: '#fbbf24',
    warningLight: '#422006',
    error: '#ef4444',
    errorLight: '#450a0a',
    info: '#3b82f6',
    infoLight: '#1e3a5f',
    overlay: 'rgba(0, 0, 0, 0.7)',
    shadow: 'rgba(0, 0, 0, 0.3)',
  },
} as const;

export type ColorScheme = 'light' | 'dark';

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
    sans: Platform.select({ ios: 'system-ui', android: 'sans-serif', default: 'system-ui' }),
    serif: 'serif',
    mono: 'monospace',
  },
} as const;

export const Fonts = {
  sans: Platform.select({ ios: 'system-ui', android: 'sans-serif', default: 'system-ui' }),
  serif: 'serif',
  mono: Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' }) ?? 'monospace',
} as const;

export type ThemeColor = keyof typeof Colors.light;

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

export const ZIndex = {
  base: 0,
  dropdown: 100,
  sticky: 200,
  modal: 300,
  toast: 400,
  tooltip: 500,
} as const;

export const Transitions = {
  fast: 150,
  normal: 250,
  slow: 350,
} as const;

export type Theme = {
  colors: typeof Colors.light | typeof Colors.dark;
  spacing: typeof Spacing;
  borderRadius: typeof BorderRadius;
  typography: typeof Typography;
  shadows: typeof Shadows;
  layout: typeof Layout;
  zIndex: typeof ZIndex;
  transitions: typeof Transitions;
};

export const lightTheme: Theme = {
  colors: Colors.light,
  spacing: Spacing,
  borderRadius: BorderRadius,
  typography: Typography,
  shadows: Shadows,
  layout: Layout,
  zIndex: ZIndex,
  transitions: Transitions,
};

export const darkTheme: Theme = {
  colors: Colors.dark,
  spacing: Spacing,
  borderRadius: BorderRadius,
  typography: Typography,
  shadows: Shadows,
  layout: Layout,
  zIndex: ZIndex,
  transitions: Transitions,
};

export const getTheme = (colorScheme: ColorScheme): Theme => {
  return colorScheme === 'dark' ? darkTheme : lightTheme;
};

export { Platform, StatusBar, useColorScheme };