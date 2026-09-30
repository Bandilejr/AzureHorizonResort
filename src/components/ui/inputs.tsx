// src/components/ui/inputs.tsx — text inputs and search.
import React from 'react';
import { View, TextInput, Pressable, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme } from '@/design/use-app-theme';
import { AppText } from './text';

export interface SearchFieldProps {
  value: string;
  onChangeText: (t: string) => void;
  placeholder?: string;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
}

export function SearchField({ value, onChangeText, placeholder = 'Search', style, accessibilityLabel }: SearchFieldProps) {
  const theme = useAppTheme();
  return (
    <View
      style={[
        styles.search,
        {
          backgroundColor: theme.colors.surfaceVariant,
          borderColor: theme.colors.border,
          borderRadius: theme.radius.md,
          paddingHorizontal: theme.space.md,
          gap: theme.space.sm,
          height: 44,
        },
        style,
      ]}
    >
      <Ionicons name="search-outline" size={theme.iconSize.sm} color={theme.colors.textMuted} />
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={theme.colors.textMuted}
        accessibilityLabel={accessibilityLabel ?? placeholder}
        style={[styles.input, { color: theme.colors.text, fontSize: theme.fontSize.body }]}
      />
      {value.length > 0 ? (
        <Pressable onPress={() => onChangeText('')} accessibilityRole="button" accessibilityLabel="Clear search" hitSlop={8}>
          <Ionicons name="close-circle" size={theme.iconSize.sm} color={theme.colors.textMuted} />
        </Pressable>
      ) : null}
    </View>
  );
}

export interface FieldProps {
  label: string;
  value: string;
  onChangeText: (t: string) => void;
  placeholder?: string;
  multiline?: boolean;
  keyboardType?: 'default' | 'numeric' | 'email-address' | 'phone-pad';
  style?: StyleProp<ViewStyle>;
}

export function Field({ label, value, onChangeText, placeholder, multiline, keyboardType, style }: FieldProps) {
  const theme = useAppTheme();
  return (
    <View style={[{ gap: theme.space.xs }, style]}>
      <AppText variant="label" tone="secondary" weight="600">
        {label}
      </AppText>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={theme.colors.textMuted}
        multiline={multiline}
        keyboardType={keyboardType}
        accessibilityLabel={label}
        style={[
          {
            borderWidth: 1,
            borderColor: theme.colors.border,
            borderRadius: theme.radius.md,
            padding: theme.space.md,
            color: theme.colors.text,
            fontSize: theme.fontSize.body,
            backgroundColor: theme.colors.surface,
            minHeight: multiline ? 88 : 46,
            textAlignVertical: multiline ? 'top' : 'center',
          },
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  search: { flexDirection: 'row', alignItems: 'center', borderWidth: 1 },
  input: { flex: 1, padding: 0 },
});

export default SearchField;
