// src/components/ui/progress.tsx — progress bar and ring for real data only.
import React from 'react';
import { View, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { useAppTheme } from '@/design/use-app-theme';
import { AppText } from './text';

export interface ProgressBarProps {
  /** 0..1 */
  value: number;
  tone?: 'primary' | 'accent' | 'success' | 'warning' | 'error';
  height?: number;
  style?: StyleProp<ViewStyle>;
}

export function ProgressBar({ value, tone = 'primary', height = 8, style }: ProgressBarProps) {
  const theme = useAppTheme();
  const pct = Math.max(0, Math.min(1, value));
  const color = {
    primary: theme.colors.primary,
    accent: theme.colors.accent,
    success: theme.colors.success,
    warning: theme.colors.warning,
    error: theme.colors.error,
  }[tone];
  return (
    <View
      accessibilityRole="progressbar"
      style={[
        { height, borderRadius: height / 2, backgroundColor: theme.colors.surfaceVariant, overflow: 'hidden' },
        style,
      ]}
    >
      <View style={{ width: `${pct * 100}%`, height, borderRadius: height / 2, backgroundColor: color }} />
    </View>
  );
}

export interface ProgressRingProps {
  /** 0..1 */
  value: number;
  size?: number;
  strokeWidth?: number;
  tone?: 'primary' | 'accent' | 'success';
  centerLabel?: string;
  centerCaption?: string;
}

export function ProgressRing({
  value,
  size = 96,
  strokeWidth = 10,
  tone = 'primary',
  centerLabel,
  centerCaption,
}: ProgressRingProps) {
  const theme = useAppTheme();
  const pct = Math.max(0, Math.min(1, value));
  const r = (size - strokeWidth) / 2;
  const c = 2 * Math.PI * r;
  const color = {
    primary: theme.colors.primary,
    accent: theme.colors.accent,
    success: theme.colors.success,
  }[tone];
  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={size} height={size} style={StyleSheet.absoluteFill}>
        <Circle cx={size / 2} cy={size / 2} r={r} stroke={theme.colors.surfaceVariant} strokeWidth={strokeWidth} fill="none" />
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={color}
          strokeWidth={strokeWidth}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={`${c} ${c}`}
          strokeDashoffset={c * (1 - pct)}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </Svg>
      {centerLabel ? <AppText variant="subtitle">{centerLabel}</AppText> : null}
      {centerCaption ? (
        <AppText variant="micro" tone="muted">
          {centerCaption}
        </AppText>
      ) : null}
    </View>
  );
}
