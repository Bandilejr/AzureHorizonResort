// src/components/ui/sheets.tsx — picker sheet + confirmation sheet.
// Quick selection and confirmation live in sheets; complex records live in
// full screens.
import React, { useMemo, useState } from 'react';
import { Modal, View, Pressable, ScrollView, StyleSheet, TouchableWithoutFeedback } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme } from '@/design/use-app-theme';
import { AppText } from './text';
import { Button } from './button';
import { SearchField } from './inputs';
import { DetailRow } from './list-row';

export interface PickerOption {
  value: string;
  label: string;
  subtitle?: string;
}

export interface PickerSheetProps {
  visible: boolean;
  title: string;
  options: PickerOption[];
  onSelect: (value: string) => void;
  onClose: () => void;
  searchable?: boolean;
  emptyMessage?: string;
}

export function PickerSheet({
  visible,
  title,
  options,
  onSelect,
  onClose,
  searchable = false,
  emptyMessage = 'No options available.',
}: PickerSheetProps) {
  const theme = useAppTheme();
  const [query, setQuery] = useState('');
  const filtered = useMemo(() => {
    if (!query.trim()) return options;
    const q = query.toLowerCase();
    return options.filter(
      (o) => o.label.toLowerCase().includes(q) || (o.subtitle ?? '').toLowerCase().includes(q),
    );
  }, [options, query]);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <TouchableWithoutFeedback onPress={onClose}>
        <View style={styles.backdrop} />
      </TouchableWithoutFeedback>
      <View
        style={[
          styles.sheet,
          {
            backgroundColor: theme.colors.surface,
            borderTopLeftRadius: theme.radius['2xl'],
            borderTopRightRadius: theme.radius['2xl'],
            maxHeight: '80%',
          },
        ]}
      >
        <View style={[styles.grabber, { backgroundColor: theme.colors.border }]} />
        <View style={[styles.sheetHeader, { paddingHorizontal: theme.space.lg }]}>
          <AppText variant="subtitle" style={{ flex: 1 }} numberOfLines={1}>
            {title}
          </AppText>
          <Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel="Close" hitSlop={8}>
            <Ionicons name="close" size={theme.iconSize.lg} color={theme.colors.textMuted} />
          </Pressable>
        </View>
        {searchable ? (
          <View style={{ paddingHorizontal: theme.space.lg, paddingBottom: theme.space.sm }}>
            <SearchField value={query} onChangeText={setQuery} placeholder="Search" />
          </View>
        ) : null}
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: theme.space['3xl'] }}>
          {filtered.length === 0 ? (
            <AppText variant="body" tone="muted" align="center" style={{ padding: theme.space['2xl'] }}>
              {emptyMessage}
            </AppText>
          ) : (
            filtered.map((o, i) => (
              <Pressable
                key={o.value}
                onPress={() => {
                  onSelect(o.value);
                  onClose();
                }}
                accessibilityRole="button"
                style={({ pressed }) => [
                  styles.option,
                  {
                    paddingHorizontal: theme.space.lg,
                    paddingVertical: theme.space.md,
                    borderTopWidth: i === 0 ? 0 : StyleSheet.hairlineWidth,
                    borderTopColor: theme.colors.border,
                    backgroundColor: pressed ? theme.colors.surfaceVariant : 'transparent',
                  },
                ]}
              >
                <View style={{ flex: 1 }}>
                  <AppText variant="bodyStrong" numberOfLines={1}>
                    {o.label}
                  </AppText>
                  {o.subtitle ? (
                    <AppText variant="caption" tone="secondary" numberOfLines={1}>
                      {o.subtitle}
                    </AppText>
                  ) : null}
                </View>
                <Ionicons name="chevron-forward" size={theme.iconSize.md} color={theme.colors.textMuted} />
              </Pressable>
            ))
          )}
        </ScrollView>
      </View>
    </Modal>
  );
}

export interface ConfirmationSheetProps {
  visible: boolean;
  title: string;
  message?: string;
  rows?: [string, string][];
  warning?: string;
  confirmLabel: string;
  cancelLabel?: string;
  danger?: boolean;
  busy?: boolean;
  onConfirm: () => void;
  onClose: () => void;
}

export function ConfirmationSheet({
  visible,
  title,
  message,
  rows = [],
  warning,
  confirmLabel,
  cancelLabel = 'Back',
  danger = false,
  busy = false,
  onConfirm,
  onClose,
}: ConfirmationSheetProps) {
  const theme = useAppTheme();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <TouchableWithoutFeedback onPress={onClose}>
        <View style={styles.backdrop} />
      </TouchableWithoutFeedback>
      <View
        style={[
          styles.sheet,
          {
            backgroundColor: theme.colors.surface,
            borderTopLeftRadius: theme.radius['2xl'],
            borderTopRightRadius: theme.radius['2xl'],
            padding: theme.space.lg,
            paddingBottom: theme.space['3xl'],
          },
        ]}
      >
        <View style={[styles.grabber, { backgroundColor: theme.colors.border }]} />
        <AppText variant="subtitle" style={{ marginBottom: theme.space.sm }}>
          {title}
        </AppText>
        {message ? (
          <AppText variant="body" tone="secondary" style={{ marginBottom: theme.space.sm }}>
            {message}
          </AppText>
        ) : null}
        {rows.length > 0 ? (
          <View style={{ marginVertical: theme.space.sm }}>
            {rows.map(([k, v]) => (
              <DetailRow key={k} label={k} value={v} />
            ))}
          </View>
        ) : null}
        {warning ? (
          <View
            style={[
              styles.warning,
              { backgroundColor: theme.colors.warningSoft, borderRadius: theme.radius.md, padding: theme.space.md },
            ]}
          >
            <Ionicons name="warning-outline" size={theme.iconSize.sm} color={theme.colors.warningStrong} />
            <AppText variant="caption" color={theme.colors.warningStrong} style={{ flex: 1 }}>
              {warning}
            </AppText>
          </View>
        ) : null}
        <View style={[styles.actions, { gap: theme.space.sm, marginTop: theme.space.lg }]}>
          <Button label={cancelLabel} onPress={onClose} variant="secondary" fullWidth={false} style={{ flex: 1 }} />
          <Button
            label={confirmLabel}
            onPress={onConfirm}
            variant={danger ? 'danger' : 'primary'}
            loading={busy}
            fullWidth={false}
            style={{ flex: 1 }}
          />
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(16,24,40,0.5)' },
  sheet: { position: 'absolute', left: 0, right: 0, bottom: 0 },
  grabber: { width: 44, height: 5, borderRadius: 3, alignSelf: 'center', marginBottom: 12 },
  sheetHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  option: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  warning: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  actions: { flexDirection: 'row' },
});

export default PickerSheet;
