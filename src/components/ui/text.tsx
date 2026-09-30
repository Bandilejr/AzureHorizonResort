// src/components/ui/text.tsx — AppText: the single typographic primitive.
// Every redesigned screen renders text through this so type scale, weight,
// tone and dynamic scaling stay consistent.
import React from 'react';
import { Text, type TextProps, type TextStyle } from 'react-native';
import { useAppTheme } from '@/design/use-app-theme';
import { text as textRoles, type Theme } from '@/design/tokens';

export type TextVariant = keyof typeof textRoles;

export type TextTone =
  | 'default'
  | 'secondary'
  | 'muted'
  | 'primary'
  | 'accent'
  | 'inverse'
  | 'success'
  | 'warning'
  | 'error'
  | 'info';

function toneColor(theme: Theme, tone: TextTone): string {
  const c = theme.colors;
  switch (tone) {
    case 'secondary': return c.textSecondary;
    case 'muted': return c.textMuted;
    case 'primary': return c.primary;
    case 'accent': return c.accentStrong;
    case 'inverse': return c.textInverse;
    case 'success': return c.success;
    case 'warning': return c.warning;
    case 'error': return c.error;
    case 'info': return c.info;
    default: return c.text;
  }
}

export interface AppTextProps extends TextProps {
  variant?: TextVariant;
  tone?: TextTone;
  /** Explicit color; overrides `tone`. Prefer a token value. */
  color?: string;
  align?: TextStyle['textAlign'];
  weight?: TextStyle['fontWeight'];
}

export function AppText({
  variant = 'body',
  tone = 'default',
  color,
  align,
  weight,
  style,
  children,
  ...rest
}: AppTextProps) {
  const theme = useAppTheme();
  return (
    <Text
      {...rest}
      allowFontScaling
      style={[
        textRoles[variant],
        { color: color ?? toneColor(theme, tone) },
        align ? { textAlign: align } : null,
        weight ? { fontWeight: weight } : null,
        style,
      ]}
    >
      {children}
    </Text>
  );
}

export default AppText;
