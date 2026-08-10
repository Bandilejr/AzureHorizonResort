import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useColorScheme, View, StatusBar } from 'react-native';
import React, { useEffect } from 'react';

import { AuthProvider } from '@/context/AuthContext';
import { PermissionsProvider } from '@/context/PermissionsContext';
import { I18nProvider } from '@/i18n/hooks';
import ErrorBoundary from '@/components/ErrorBoundary';
import { getTheme } from '@/constants/theme';
import { SafeAreaProvider } from 'react-native-safe-area-context';

export default function RootLayout() {
  const colorScheme = useColorScheme();
  const theme = getTheme(colorScheme as any);

  useEffect(() => {
    // Explicitly hide native splash screen immediately on mount
    SplashScreen.hideAsync().catch(() => {});
  }, [colorScheme]);

  return (
    <ErrorBoundary>
      <SafeAreaProvider>
        <AuthProvider>
          <PermissionsProvider>
            <I18nProvider>
              <View style={{ flex: 1, backgroundColor: theme.colors.background }}>
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
                  <Stack.Screen name="+not-found" />
                </Stack>
              </View>
            </I18nProvider>
          </PermissionsProvider>
        </AuthProvider>
      </SafeAreaProvider>
    </ErrorBoundary>
  );
}