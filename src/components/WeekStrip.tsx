// src/components/WeekStrip.tsx
// Week view: 7 day columns with compact shift blocks + leave/open/swap/conflict
// markers, today marker and selected day. Structure follows the inline-calendar
// "week stripe + agenda" pattern; all visuals come from our tokens.
// Reused by the staff schedule (and available to any roster surface).
import React from 'react';
import { View, TouchableOpacity, StyleSheet } from 'react-native';
import { useAppTheme } from '@/design/use-app-theme';
import type { Theme } from '@/design/tokens';
import { AppText } from '@/components/ui/text';
import { parseISOLocal } from '@/utils/dates';

export type WeekBlockTone = 'shift' | 'leave' | 'open' | 'conflict' | 'pending';
export interface WeekBlock {
  label: string;
  tone: WeekBlockTone;
}
export interface WeekDay {
  date: string; // YYYY-MM-DD
  blocks: WeekBlock[];
  isToday?: boolean;
}

function toneColor(theme: Theme, tone: WeekBlockTone): { bg: string; fg: string } {
  switch (tone) {
    case 'shift': return { bg: theme.colors.primarySoft, fg: theme.colors.primary };
    case 'open': return { bg: theme.colors.infoSoft, fg: theme.colors.infoStrong };
    case 'pending': return { bg: theme.colors.warningSoft, fg: theme.colors.warningStrong };
    case 'conflict': return { bg: theme.colors.errorSoft, fg: theme.colors.errorStrong };
    case 'leave':
    default: return { bg: theme.colors.surfaceVariant, fg: theme.colors.textSecondary };
  }
}

const WEEKDAYS = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'];

export function WeekStrip({
  days,
  selectedDate,
  onSelectDate,
}: {
  days: WeekDay[];
  selectedDate: string;
  onSelectDate: (iso: string) => void;
}) {
  const theme = useAppTheme();
  return (
    <View style={{ backgroundColor: theme.colors.surface, borderRadius: theme.radius.lg, borderWidth: 1, borderColor: theme.colors.border, padding: theme.space.sm }}>
      <View style={{ flexDirection: 'row' }}>
        {days.map((d, i) => {
          const selected = d.date === selectedDate;
          const date = parseISOLocal(d.date);
          return (
            <TouchableOpacity
              key={d.date}
              style={{ flex: 1, alignItems: 'center', gap: 4 }}
              onPress={() => onSelectDate(d.date)}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel={`Select ${d.date}`}
            >
              <AppText variant="micro" tone="muted" weight="600">{WEEKDAYS[i]}</AppText>
              <View
                style={[
                  styles.dayNum,
                  d.isToday && !selected ? { borderWidth: 1.5, borderColor: theme.colors.primary } : null,
                  selected ? { backgroundColor: theme.colors.primary } : null,
                ]}
              >
                <AppText variant="caption" color={selected ? theme.colors.textInverse : d.isToday ? theme.colors.primary : theme.colors.text} weight="700">
                  {date.getDate()}
                </AppText>
              </View>
              <View style={{ width: '100%', gap: 2, minHeight: 44 }}>
                {d.blocks.slice(0, 3).map((b, bi) => {
                  const c = toneColor(theme, b.tone);
                  return (
                    <View key={bi} style={{ backgroundColor: c.bg, borderRadius: theme.radius.xs, paddingHorizontal: 2, paddingVertical: 2 }}>
                      <AppText variant="micro" color={c.fg} weight="600" numberOfLines={1} align="center">{b.label}</AppText>
                    </View>
                  );
                })}
                {d.blocks.length > 3 ? (
                  <AppText variant="micro" tone="muted" align="center">+{d.blocks.length - 3}</AppText>
                ) : null}
              </View>
            </TouchableOpacity>
          );
        })}
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.space.md, justifyContent: 'center', marginTop: theme.space.sm, borderTopWidth: 1, borderColor: theme.colors.border, paddingTop: theme.space.sm }}>
        {([['shift', 'Shift'], ['open', 'Open'], ['pending', 'Swap'], ['leave', 'Leave'], ['conflict', 'Conflict']] as [WeekBlockTone, string][]).map(([tone, label]) => {
          const c = toneColor(theme, tone);
          return (
            <View key={tone} style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: c.fg }} />
              <AppText variant="micro" tone="muted" weight="600">{label}</AppText>
            </View>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  dayNum: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
});

export default WeekStrip;
