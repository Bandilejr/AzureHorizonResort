// src/design/tokens.ts — FixedFunding design tokens (SINGLE SOURCE OF TRUTH).
//
// North star: "A modern operating system for organizational food-rescue
// operations." Light-first, precise, calm, professional. Futurism comes from
// hierarchy, typography, spacing and state intelligence — never glow.
//
// RULES
//  - Redesigned UI must import from here. No magic numbers/hex in screens.
//  - `src/constants/theme.ts` re-exports these for legacy screens (compat shim)
//    including the old color keys (primaryDark, primaryLight, text, ...).
//  - Palette is light-first; dark is a first-class but secondary mode.
import { Platform } from 'react-native';

// ─────────────────────────────────────────────────────────────────────────────
// COLOR
// ─────────────────────────────────────────────────────────────────────────────
// Brand: sophisticated indigo primary + blue-teal accent. Chosen to support
// enterprise clarity, clinical precision and logistics legibility while
// staying warm enough for hospitality. Gold (#C9A227) is retained ONLY as a
// rare hospitality accent, never as the operational primary.

export const palette = {
  indigo50: '#EEF2FF',
  indigo100: '#E0E7FF',
  indigo200: '#C7D2FE',
  indigo400: '#6E8CFF',
  indigo500: '#2D5BFF',
  indigo600: '#1E43D6',
  indigo700: '#1B36A8',

  teal50: '#E6F6F7',
  teal100: '#CDEDEF',
  teal500: '#0E8C99',
  teal600: '#0A6E78',
  teal400: '#4FC3CE',

  gold500: '#C9A227',

  gray0: '#FFFFFF',
  gray25: '#FCFCFD',
  gray50: '#F9FAFB',
  gray100: '#F2F4F7',
  gray200: '#EAECF0',
  gray300: '#D0D5DD',
  gray400: '#98A2B3',
  gray500: '#667085',
  gray600: '#475467',
  gray700: '#344054',
  gray800: '#1D2939',
  gray900: '#101828',
  gray950: '#0C111D',

  green50: '#ECFDF3',
  green500: '#12B76A',
  green600: '#039855',
  green700: '#027A48',

  amber50: '#FFFAEB',
  amber500: '#F79009',
  amber600: '#DC6803',
  amber700: '#B54708',

  red50: '#FEF3F2',
  red500: '#F04438',
  red600: '#D92D20',
  red700: '#B42318',

  sky50: '#F0F9FF',
  sky500: '#0BA5EC',
  sky600: '#0086C9',
  sky700: '#026AA2',

  night0: '#0B1220',
  night50: '#111A2C',
  night100: '#162034',
  night200: '#1A2438',
  night300: '#243044',
  night400: '#33415A',
} as const;

// Semantic color contract. `light` and `dark` MUST expose identical keys so
// components can read `theme.colors.x` in either scheme.
export const lightColors = {
  // brand
  primary: palette.indigo500,
  primaryPressed: palette.indigo600,
  primarySoft: palette.indigo50,
  primaryBorder: palette.indigo200,
  // accent = icons/large objects (>=3:1). accentStrong = text/labels (>=4.5:1).
  accent: palette.teal500,
  accentStrong: palette.teal600,
  accentSoft: palette.teal50,
  gold: palette.gold500,

  // surfaces
  background: '#F5F7FA',
  surface: palette.gray0,
  surfaceElevated: palette.gray0,
  surfaceVariant: palette.gray100,
  surfaceSunken: palette.gray50,

  // borders
  border: '#E7EAF0',
  borderStrong: palette.gray300,

  // text
  text: palette.gray900,
  textPrimary: palette.gray900,
  textSecondary: palette.gray600,
  textMuted: palette.gray500,
  textInverse: palette.gray0,

  // status — base = icons/large objects (>=3:1 on surface); Strong = text
  // on soft backgrounds (>=4.5:1); Soft = background.
  success: palette.green600,
  successSoft: palette.green50,
  successStrong: palette.green700,
  warning: palette.amber600,
  warningSoft: palette.amber50,
  warningStrong: palette.amber700,
  error: palette.red500,
  errorSoft: palette.red50,
  errorStrong: palette.red700,
  info: palette.sky600,
  infoSoft: palette.sky50,
  infoStrong: palette.sky700,

  // utility
  overlay: 'rgba(16, 24, 40, 0.5)',
  shadow: 'rgba(16, 24, 40, 0.08)',

  // ── legacy aliases (keep old screens compiling) ──
  primaryDark: palette.indigo600,
  primaryLight: palette.indigo50,
  secondary: palette.gray700,
  secondaryDark: palette.gray900,
  secondaryLight: palette.gray100,
  successLight: palette.green50,
  warningLight: palette.amber50,
  errorLight: palette.red50,
  infoLight: palette.sky50,
} as const;

export const darkColors = {
  primary: palette.indigo400,
  primaryPressed: '#93AAFF',
  primarySoft: '#1B2547',
  primaryBorder: '#2E3A66',
  accent: palette.teal400,
  accentStrong: '#7CD9E2',
  accentSoft: '#0C2E33',
  gold: palette.gold500,

  background: palette.night0,
  surface: palette.night50,
  surfaceElevated: palette.night100,
  surfaceVariant: palette.night200,
  surfaceSunken: '#080E1A',

  border: palette.night300,
  borderStrong: palette.night400,

  text: palette.gray100,
  textPrimary: palette.gray100,
  textSecondary: '#C3CAD9',
  textMuted: '#8A97AC',
  textInverse: palette.night0,

  success: '#32D583',
  successSoft: '#0A2E1F',
  successStrong: '#A6F4C5',
  warning: '#FDB022',
  warningSoft: '#3A2408',
  warningStrong: '#FEDF89',
  error: '#F97066',
  errorSoft: '#3A0F0C',
  errorStrong: '#FDA29B',
  info: '#36BFFA',
  infoSoft: '#062C41',
  infoStrong: '#7CD4FD',

  overlay: 'rgba(0, 0, 0, 0.7)',
  shadow: 'rgba(0, 0, 0, 0.4)',

  // legacy aliases
  primaryDark: palette.indigo400,
  primaryLight: '#1B2547',
  secondary: '#C3CAD9',
  secondaryDark: palette.gray0,
  secondaryLight: palette.night200,
  successLight: '#0A2E1F',
  warningLight: '#3A2408',
  errorLight: '#3A0F0C',
  infoLight: '#062C41',
} as const;

export const Colors = { light: lightColors, dark: darkColors } as const;
export type ColorScheme = 'light' | 'dark';
export type ThemeColor = keyof typeof lightColors;

// ─────────────────────────────────────────────────────────────────────────────
// SPACING — 4pt base scale (4, 8, 12, 16, 20, 24, 32, 40)
// ─────────────────────────────────────────────────────────────────────────────
export const space = {
  none: 0,
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  '2xl': 24,
  '3xl': 32,
  '4xl': 40,
} as const;

// ─────────────────────────────────────────────────────────────────────────────
// RADIUS — controls 8 · components 12 · cards 16-20 · hero 20-24 · pill
// ─────────────────────────────────────────────────────────────────────────────
export const radius = {
  none: 0,
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  '2xl': 24,
  pill: 9999,
} as const;

// ─────────────────────────────────────────────────────────────────────────────
// TYPOGRAPHY
// ─────────────────────────────────────────────────────────────────────────────
export const fontFamily = {
  sans: Platform.select({ ios: 'System', android: 'sans-serif', default: 'system-ui' }) as string,
  mono: Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' }) as string,
} as const;

export const fontWeight = {
  regular: '400',
  medium: '500',
  semibold: '600',
  bold: '700',
} as const;

export const fontSize = {
  micro: 11,
  caption: 12,
  label: 13,
  body: 14,
  bodyLg: 15,
  subtitle: 16,
  title: 18,
  section: 20,
  metric: 26,
  display: 32,
} as const;

export const lineHeight = {
  micro: 16,
  caption: 18,
  label: 18,
  body: 20,
  bodyLg: 22,
  subtitle: 24,
  title: 26,
  section: 28,
  metric: 32,
  display: 38,
} as const;

// Composed text roles. Spread directly: `style={[text.title, { color }]}`.
export const text = {
  display: { fontSize: fontSize.display, lineHeight: lineHeight.display, fontWeight: fontWeight.semibold },
  metric: { fontSize: fontSize.metric, lineHeight: lineHeight.metric, fontWeight: fontWeight.semibold },
  title: { fontSize: fontSize.title, lineHeight: lineHeight.title, fontWeight: fontWeight.semibold },
  subtitle: { fontSize: fontSize.subtitle, lineHeight: lineHeight.subtitle, fontWeight: fontWeight.semibold },
  section: { fontSize: fontSize.section, lineHeight: lineHeight.section, fontWeight: fontWeight.semibold },
  body: { fontSize: fontSize.body, lineHeight: lineHeight.body, fontWeight: fontWeight.regular },
  bodyStrong: { fontSize: fontSize.body, lineHeight: lineHeight.body, fontWeight: fontWeight.medium },
  bodyLg: { fontSize: fontSize.bodyLg, lineHeight: lineHeight.bodyLg, fontWeight: fontWeight.regular },
  caption: { fontSize: fontSize.caption, lineHeight: lineHeight.caption, fontWeight: fontWeight.regular },
  label: { fontSize: fontSize.label, lineHeight: lineHeight.label, fontWeight: fontWeight.medium },
  micro: { fontSize: fontSize.micro, lineHeight: lineHeight.micro, fontWeight: fontWeight.medium },
  mono: { fontFamily: fontFamily.mono, fontSize: fontSize.body, lineHeight: lineHeight.body },
} as const;

// ─────────────────────────────────────────────────────────────────────────────
// ELEVATION — prefer 1px borders + tonal layering; shadows are subtle.
// ─────────────────────────────────────────────────────────────────────────────
export const elevation = {
  none: {},
  subtle: {
    shadowColor: '#101828',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  medium: {
    shadowColor: '#101828',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 10,
    elevation: 4,
  },
  high: {
    shadowColor: '#101828',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.12,
    shadowRadius: 24,
    elevation: 10,
  },
} as const;

// ─────────────────────────────────────────────────────────────────────────────
// MOTION
// ─────────────────────────────────────────────────────────────────────────────
export const motion = {
  fast: 150,
  normal: 250,
  deliberate: 350,
} as const;

// ─────────────────────────────────────────────────────────────────────────────
// LAYOUT
// ─────────────────────────────────────────────────────────────────────────────
export const layout = {
  screenPadding: space.lg,
  contentMaxWidth: 600,
  headerHeight: 56,
  tabBarHeight: 64,
  fabSize: 56,
  minTouchTarget: 44,
} as const;

export const zIndex = {
  base: 0,
  dropdown: 100,
  sticky: 200,
  modal: 300,
  toast: 400,
  tooltip: 500,
} as const;

// ─────────────────────────────────────────────────────────────────────────────
// ICONS — one family (Ionicons), one stroke weight.
// ─────────────────────────────────────────────────────────────────────────────
export const iconSize = {
  xs: 14,
  sm: 16,
  md: 20,
  lg: 24,
  xl: 28,
} as const;

// ─────────────────────────────────────────────────────────────────────────────
// THEME
// ─────────────────────────────────────────────────────────────────────────────
export interface Theme {
  scheme: ColorScheme;
  colors: typeof lightColors | typeof darkColors;
  space: typeof space;
  radius: typeof radius;
  fontFamily: typeof fontFamily;
  fontWeight: typeof fontWeight;
  fontSize: typeof fontSize;
  lineHeight: typeof lineHeight;
  text: typeof text;
  elevation: typeof elevation;
  motion: typeof motion;
  layout: typeof layout;
  zIndex: typeof zIndex;
  iconSize: typeof iconSize;
}

export const lightTheme: Theme = {
  scheme: 'light',
  colors: lightColors,
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
};

export const darkTheme: Theme = {
  scheme: 'dark',
  colors: darkColors,
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
};

export const getTheme = (colorScheme: ColorScheme | 'unspecified' | null | undefined): Theme =>
  colorScheme === 'dark' ? darkTheme : lightTheme;

export const BottomTabInset = Platform.select({ ios: 50, android: 80 }) ?? 0;
export const MaxContentWidth = layout.contentMaxWidth;
