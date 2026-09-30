// src/design/use-app-theme.ts — React hook access to the design tokens.
// Re-renders on system color-scheme change.
import { useColorScheme } from 'react-native';
import { getTheme, type Theme } from './tokens';

export function useAppTheme(): Theme {
  return getTheme(useColorScheme());
}

export { getTheme };
export type { Theme };
