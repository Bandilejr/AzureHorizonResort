// Calendar — month grid with status dots/legend. Layer 8: token-based rebuild;
// API and local-date logic unchanged.
import React, { useMemo } from 'react';
import { View, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme } from '@/design/use-app-theme';
import type { Theme } from '@/design/tokens';
import { AppText } from '@/components/ui/text';
import { localDateISO, parseISOLocal } from '@/utils/dates';

export type CalendarIndicator = {
  date: string; // YYYY-MM-DD
  type: 'scheduled' | 'open' | 'pending' | 'conflict' | 'leave' | 'none';
  count?: number;
};

const WEEKDAYS = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'];

function startOfMonth(d: Date) { return new Date(d.getFullYear(), d.getMonth(), 1); }
function daysInMonth(d: Date) { return new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate(); }
function toISO(d: Date) { return localDateISO(d); }
function fromISO(s: string) { return parseISOLocal(s); }

function dotColor(theme: Theme, t: CalendarIndicator['type']): string {
  switch (t) {
    case 'scheduled': return theme.colors.success;
    case 'open': return theme.colors.primary;
    case 'pending': return theme.colors.warning;
    case 'conflict': return theme.colors.error;
    case 'leave': return theme.colors.textMuted;
    default: return 'transparent';
  }
}

export function Calendar({
  month,
  selectedDate,
  indicators = [],
  onSelectDate,
  onMonthChange,
}: {
  month: Date;
  selectedDate: string | null;
  indicators?: CalendarIndicator[];
  onSelectDate: (iso: string) => void;
  onMonthChange: (next: Date) => void;
}) {
  const theme = useAppTheme();

  const year = month.getFullYear();
  const mon = month.getMonth();
  const first = startOfMonth(month);
  const offset = (first.getDay() + 6) % 7;
  const total = daysInMonth(month);
  const todayISO = toISO(new Date());

  const map = useMemo(() => {
    const m = new Map<string, CalendarIndicator>();
    for (const ind of indicators) m.set(ind.date, ind);
    return m;
  }, [indicators]);

  const cells: (string | null)[] = [];
  for (let i = 0; i < offset; i++) cells.push(null);
  for (let d = 1; d <= total; d++) cells.push(toISO(new Date(year, mon, d)));
  while (cells.length % 7 !== 0) cells.push(null);

  const monthLabel = month.toLocaleDateString('en-ZA', { month: 'long', year: 'numeric' });

  const legend: { label: string; type: CalendarIndicator['type'] }[] = [
    { label: 'Your shift', type: 'scheduled' },
    { label: 'Open', type: 'open' },
    { label: 'Pending', type: 'pending' },
    { label: 'Conflict', type: 'conflict' },
    { label: 'Leave', type: 'leave' },
  ];

  return (
    <View style={{ backgroundColor: theme.colors.surface, borderRadius: theme.radius.lg, padding: theme.space.md, borderWidth: 1, borderColor: theme.colors.border }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: theme.space.sm }}>
        <TouchableOpacity onPress={() => onMonthChange(new Date(year, mon - 1, 1))} style={{ padding: 8, borderRadius: theme.radius.pill, backgroundColor: theme.colors.surfaceVariant }} accessibilityLabel="Previous month" accessibilityRole="button">
          <Ionicons name="chevron-back" size={theme.iconSize.md} color={theme.colors.text} />
        </TouchableOpacity>
        <AppText variant="subtitle" style={{ textTransform: 'capitalize' }}>{monthLabel}</AppText>
        <TouchableOpacity onPress={() => onMonthChange(new Date(year, mon + 1, 1))} style={{ padding: 8, borderRadius: theme.radius.pill, backgroundColor: theme.colors.surfaceVariant }} accessibilityLabel="Next month" accessibilityRole="button">
          <Ionicons name="chevron-forward" size={theme.iconSize.md} color={theme.colors.text} />
        </TouchableOpacity>
      </View>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
        {WEEKDAYS.map((w) => (
          <AppText key={w} variant="micro" tone="muted" weight="600" align="center" style={[styles.wd, { letterSpacing: 0.5 }]}>{w}</AppText>
        ))}
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
        {cells.map((iso, idx) => {
          if (!iso) return <View key={`e-${idx}`} style={styles.cell} />;
          const ind = map.get(iso);
          const isSelected = iso === selectedDate;
          const isToday = iso === todayISO;
          const type = ind?.type || 'none';
          return (
            <TouchableOpacity key={iso} style={styles.cell} onPress={() => onSelectDate(iso)} activeOpacity={0.7}>
              <View
                style={[
                  styles.dayCircle,
                  isToday && !isSelected ? { borderWidth: 1.5, borderColor: theme.colors.primary } : null,
                  isSelected ? { backgroundColor: theme.colors.primary } : null,
                ]}
              >
                <AppText
                  variant="body"
                  color={isSelected ? theme.colors.textInverse : isToday ? theme.colors.primary : theme.colors.text}
                  weight={isSelected || isToday ? '700' : '500'}
                >
                  {fromISO(iso).getDate()}
                </AppText>
              </View>
              <View style={{ width: 6, height: 6, borderRadius: 3, marginTop: 2, backgroundColor: dotColor(theme, type), opacity: type === 'none' ? 0 : 1 }} />
              {ind?.count && ind.count > 1 ? <AppText variant="micro" tone="muted" weight="600" style={{ marginTop: 1 }}>{ind.count}</AppText> : null}
            </TouchableOpacity>
          );
        })}
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.space.md, marginTop: theme.space.md, justifyContent: 'center', borderTopWidth: 1, borderColor: theme.colors.border, paddingTop: theme.space.sm }}>
        {legend.map((l) => (
          <View key={l.type} style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: dotColor(theme, l.type) }} />
            <AppText variant="micro" tone="muted" weight="600">{l.label}</AppText>
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wd: { width: '14.28%' },
  cell: { width: '14.28%', aspectRatio: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 2 },
  dayCircle: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
});
