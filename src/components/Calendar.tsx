import React, { useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, useColorScheme } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { getTheme } from '@/constants/theme';
import { localDateISO, parseISOLocal } from '@/utils/dates';

export type CalendarIndicator = {
  date: string; // YYYY-MM-DD
  type: 'scheduled' | 'open' | 'pending' | 'conflict' | 'leave' | 'none';
  count?: number;
};

const WEEKDAYS = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'];

function startOfMonth(d: Date) { return new Date(d.getFullYear(), d.getMonth(), 1); }
function daysInMonth(d: Date) { return new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate(); }
// Local calendar date — NEVER toISOString().slice(0,10): that converts to UTC and
// shifts every cell back one day in UTC+2 (e.g. 1 Sep renders as "31 Aug").
function toISO(d: Date) { return localDateISO(d); }
function fromISO(s: string) { return parseISOLocal(s); }

export function Calendar({
  month, // Date object, month to display
  selectedDate, // YYYY-MM-DD or null
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
  const colorScheme = useColorScheme();
  const theme = getTheme(colorScheme as any);
  const styles = createStyles(theme);

  const year = month.getFullYear();
  const mon = month.getMonth();
  const first = startOfMonth(month);
  // Monday-start: getDay 0=Sun -> 6, 1=Mon->0
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

  const dotColor = (t: CalendarIndicator['type']) => {
    switch (t) {
      case 'scheduled': return theme.colors.success; // green
      case 'open': return '#2563eb'; // blue
      case 'pending': return theme.colors.warning; // orange
      case 'conflict': return theme.colors.error; // red
      case 'leave': return '#64748b'; // grey
      default: return 'transparent';
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => onMonthChange(new Date(year, mon - 1, 1))} style={styles.navBtn} accessibilityLabel="Previous month" accessibilityRole="button">
          <Ionicons name="chevron-back" size={20} color={theme.colors.text} />
        </TouchableOpacity>
        <Text style={styles.month}>{monthLabel}</Text>
        <TouchableOpacity onPress={() => onMonthChange(new Date(year, mon + 1, 1))} style={styles.navBtn} accessibilityLabel="Next month" accessibilityRole="button">
          <Ionicons name="chevron-forward" size={20} color={theme.colors.text} />
        </TouchableOpacity>
      </View>
      <View style={styles.weekRow}>
        {WEEKDAYS.map((w) => <Text key={w} style={styles.wd}>{w}</Text>)}
      </View>
      <View style={styles.grid}>
        {cells.map((iso, idx) => {
          if (!iso) return <View key={`e-${idx}`} style={styles.cell} />;
          const ind = map.get(iso);
          const isSelected = iso === selectedDate;
          const isToday = iso === todayISO;
          const type = ind?.type || 'none';
          return (
            <TouchableOpacity key={iso} style={[styles.cell, isSelected && styles.cellSelected]} onPress={() => onSelectDate(iso)} activeOpacity={0.7}>
              <View style={[styles.dayCircle, isToday && styles.todayRing, isSelected && styles.selectedCircle]}>
                <Text style={[styles.dayText, isSelected && styles.dayTextSelected, isToday && !isSelected && styles.dayTextToday]}>{fromISO(iso).getDate()}</Text>
              </View>
              <View style={[styles.dot, { backgroundColor: dotColor(type), opacity: type === 'none' ? 0 : 1 }]} />
              {ind?.count && ind.count > 1 ? <Text style={styles.count}>{ind.count}</Text> : null}
            </TouchableOpacity>
          );
        })}
      </View>
      <View style={styles.legend}>
        <View style={styles.legendItem}><View style={[styles.legendDot, { backgroundColor: theme.colors.success }]} /><Text style={styles.legendText}>Your shift</Text></View>
        <View style={styles.legendItem}><View style={[styles.legendDot, { backgroundColor: '#2563eb' }]} /><Text style={styles.legendText}>Open</Text></View>
        <View style={styles.legendItem}><View style={[styles.legendDot, { backgroundColor: theme.colors.warning }]} /><Text style={styles.legendText}>Pending</Text></View>
        <View style={styles.legendItem}><View style={[styles.legendDot, { backgroundColor: theme.colors.error }]} /><Text style={styles.legendText}>Conflict</Text></View>
        <View style={styles.legendItem}><View style={[styles.legendDot, { backgroundColor: '#64748b' }]} /><Text style={styles.legendText}>Leave</Text></View>
      </View>
    </View>
  );
}

const createStyles = (theme: any) => StyleSheet.create({
  container: { backgroundColor: theme.colors.surface, borderRadius: 16, padding: 12, borderWidth: 1, borderColor: theme.colors.border },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  navBtn: { padding: 8, borderRadius: 20, backgroundColor: theme.colors.surfaceVariant },
  month: { fontSize: 16, fontWeight: '700', color: theme.colors.text, textTransform: 'capitalize' },
  weekRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
  wd: { width: '14.28%', textAlign: 'center', fontSize: 11, fontWeight: '600', color: theme.colors.textMuted, letterSpacing: 0.5 },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  cell: { width: '14.28%', aspectRatio: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 2 },
  dayCircle: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  todayRing: { borderWidth: 1.5, borderColor: theme.colors.primary },
  selectedCircle: { backgroundColor: theme.colors.text, borderWidth: 0 },
  dayText: { fontSize: 14, fontWeight: '500', color: theme.colors.text },
  dayTextSelected: { color: '#fff', fontWeight: '700' },
  dayTextToday: { color: theme.colors.primary, fontWeight: '700' },
  dot: { width: 6, height: 6, borderRadius: 3, marginTop: 2 },
  count: { fontSize: 9, color: theme.colors.textMuted, marginTop: 1, fontWeight: '600' },
  cellSelected: {},
  legend: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginTop: 10, justifyContent: 'center', borderTopWidth: 1, borderColor: theme.colors.border, paddingTop: 8 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  legendDot: { width: 8, height: 8, borderRadius: 4 },
  legendText: { fontSize: 11, color: theme.colors.textMuted, fontWeight: '600' },
});
