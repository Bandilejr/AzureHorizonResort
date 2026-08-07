import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useColorScheme } from 'react-native';
import React, { useEffect } from 'react';

import { AuthProvider } from '@/context/AuthContext';
import { PermissionsProvider } from '@/context/PermissionsContext';
import { I18nProvider } from '@/i18n/hooks';
import { AnimatedSplashOverlay } from '@/components/animated-icon';
import { RoleBasedTabs } from '@/components/RoleBasedTabs';
import ErrorBoundary from '@/components/ErrorBoundary';

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const colorScheme = useColorScheme();
  
  useEffect(() => {
    console.log('🔵 RootLayout mounted');
    console.log('🔵 Color scheme:', colorScheme);
    console.log('🔵 Running in Expo Go:', __DEV__);
  }, [colorScheme]);

  console.log('🔵 RootLayout rendering...');

  return (
    <Stack>
      <AuthProvider>
        <PermissionsProvider>
          <I18nProvider>
            <AnimatedSplashOverlay />
            <ErrorBoundary>
              <RoleBasedTabs />
            </ErrorBoundary>
          </I18nProvider>
        </PermissionsProvider>
      </AuthProvider>
    </Stack>
  );
}