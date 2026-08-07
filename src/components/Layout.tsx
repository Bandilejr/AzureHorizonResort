import React, { ReactNode } from 'react';
import { SafeAreaView, StyleSheet, View, useColorScheme, TouchableOpacity, Text, StatusBar } from 'react-native';
import { getTheme, Theme } from '@/constants/theme';

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 16,
    borderBottomWidth: 1,
  },
  headerCenter: {
    flex: 1,
    alignItems: 'center',
  },
  backButton: {
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  backText: {
    fontSize: 16,
    fontWeight: '600',
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
  },
  subtitle: {
    fontSize: 14,
    marginTop: 2,
  },
  rightContainer: {
    width: 60,
    alignItems: 'flex-end',
  },
});

interface SafeAreaProviderProps {
  children: ReactNode;
  style?: any;
}

export function SafeAreaProvider({ children, style }: SafeAreaProviderProps) {
  const colorScheme = useColorScheme();
  const theme = getTheme(colorScheme as any);
  
  return (
    <SafeAreaView 
      style={[styles.container, { backgroundColor: theme.colors.background }, style]}
    >
      <View style={styles.content}>
        {children}
      </View>
    </SafeAreaView>
  );
}

export function EdgeToSafeArea({ 
  children, 
  style, 
  backgroundColor,
}: {
  children: ReactNode;
  style?: any;
  backgroundColor?: string;
}) {
  const colorScheme = useColorScheme();
  const theme = getTheme(colorScheme as any);
  
  return (
    <SafeAreaView
      style={[
        styles.container,
        { backgroundColor: backgroundColor || theme.colors.background },
        style,
      ]}
    >
      <View style={styles.content}>
        {children}
      </View>
    </SafeAreaView>
  );
}

export function ScreenContainer({ children, style, padding = true }: { 
  children: ReactNode; 
  style?: any; 
  padding?: boolean;
}) {
  const colorScheme = useColorScheme();
  const theme = getTheme(colorScheme as any);
  
  return (
    <View style={[
      styles.container,
      { backgroundColor: theme.colors.background },
      style,
    ]}>
      {padding ? (
        <View style={[
          styles.content,
          { paddingHorizontal: theme.layout.screenPaddingHorizontal }
        ]}>
          {children}
        </View>
      ) : (
        <View style={styles.content}>
          {children}
        </View>
      )}
    </View>
  );
}

export function PageHeader({ 
  title, 
  subtitle, 
  showBack = false, 
  onBack,
  rightElement,
}: {
  title: string;
  subtitle?: string;
  showBack?: boolean;
  onBack?: () => void;
  rightElement?: React.ReactNode;
}) {
  const colorScheme = useColorScheme();
  const theme = getTheme(colorScheme as any);
  
  return (
    <View style={[
      styles.header,
      { 
        backgroundColor: theme.colors.surface,
        borderBottomColor: theme.colors.border,
      }
    ]}>
      {showBack && onBack && (
        <TouchableOpacity style={styles.backButton} onPress={onBack}>
          <Text style={[styles.backText, { color: theme.colors.text }]}>Back</Text>
        </TouchableOpacity>
      )}
      <View style={styles.headerCenter}>
        <Text style={[styles.title, { color: theme.colors.text }]}>{title}</Text>
        {subtitle && (
          <Text style={[styles.subtitle, { color: theme.colors.textSecondary }]}>{subtitle}</Text>
        )}
      </View>
      <View style={styles.rightContainer}>
        {rightElement}
      </View>
    </View>
  );
}