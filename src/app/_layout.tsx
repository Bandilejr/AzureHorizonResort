import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useColorScheme, SafeAreaView, StatusBar } from 'react-native';
import React, { useEffect } from 'react';

import { AuthProvider } from '@/context/AuthContext';
import { PermissionsProvider } from '@/context/PermissionsContext';
import { I18nProvider } from '@/i18n/hooks';
import { AnimatedSplashOverlay } from '@/components/animated-icon';
import ErrorBoundary from '@/components/ErrorBoundary';

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const colorScheme = useColorScheme();

  useEffect(() => {
    console.log('🔵 RootLayout mounted');
    console.log('🔵 Color scheme:', colorScheme);
  }, [colorScheme]);

  return (
    <AuthProvider>
      <PermissionsProvider>
        <I18nProvider>
          <AnimatedSplashOverlay />
          <ErrorBoundary>
            <SafeAreaView 
              style={{ flex: 1, backgroundColor: '#f8fafc' }}
            >
              <StatusBar 
                barStyle={colorScheme === 'dark' ? 'light-content' : 'dark-content'} 
              />
              <Stack 
                screenOptions={{
                  headerShown: false,
                }}
              />
            </SafeAreaView>
          </ErrorBoundary>
        </I18nProvider>
      </PermissionsProvider>
    </AuthProvider>
  );
}