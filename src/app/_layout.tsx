import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useColorScheme, View, StatusBar, Platform } from 'react-native';
import React, { useEffect } from 'react';

import { AuthProvider } from '@/context/AuthContext';
import { PermissionsProvider } from '@/context/PermissionsContext';
import { I18nProvider } from '@/i18n/hooks';
import ErrorBoundary from '@/components/ErrorBoundary';
import { getTheme } from '@/constants/theme';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';

function RootContent() {
  const colorScheme = useColorScheme();
  const theme = getTheme(colorScheme as any);
  const insets = useSafeAreaInsets();

  useEffect(() => {
    // Explicitly hide native splash screen immediately on mount
    SplashScreen.hideAsync().catch(() => {});
  }, [colorScheme]);

  return (
    <View
      style={{
        flex: 1,
        backgroundColor: theme.colors.background,
        // Android is edge-to-edge: push content below the status bar / camera cutout.
        // Screens use RN's built-in SafeAreaView which is iOS-only, so we pad at the root.
        paddingTop: Platform.OS === 'android' ? insets.top : 0,
      }}
    >
      <StatusBar
        translucent
        backgroundColor="transparent"
        barStyle={colorScheme === 'dark' ? 'light-content' : 'dark-content'}
      />
      <Stack
        initialRouteName="index"
        screenOptions={{
          headerShown: false,
        }}
      >
        <Stack.Screen name="index" />
        <Stack.Screen name="login" />
        <Stack.Screen name="register" />
        <Stack.Screen name="staff-login" />
        <Stack.Screen name="(guest)" />
        <Stack.Screen name="(staff)" />
        <Stack.Screen name="(admin)" />
        <Stack.Screen name="(kitchen)" />
        <Stack.Screen name="(npo)" />
        <Stack.Screen name="+not-found" />
      </Stack>
    </View>
  );
}

export default function RootLayout() {
  return (
    <ErrorBoundary>
      <SafeAreaProvider>
        <AuthProvider>
          <PermissionsProvider>
            <I18nProvider>
              <RootContent />
            </I18nProvider>
          </PermissionsProvider>
        </AuthProvider>
      </SafeAreaProvider>
    </ErrorBoundary>
  );
}