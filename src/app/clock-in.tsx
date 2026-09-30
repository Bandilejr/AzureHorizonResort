// Web clock-in entry — thin wrapper around the shared ClockInPanel.
// Layer 11: token-based presentation; panel logic unchanged.
import React from 'react';
import { View, Linking } from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '@/context/AuthContext';
import ClockInPanel from '@/components/clock-in-panel';
import { useAppTheme } from '@/design/use-app-theme';
import { AppText } from '@/components/ui/text';
import { Card } from '@/components/ui/surface';
import { Button } from '@/components/ui/button';

export default function WebClockInScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const theme = useAppTheme();

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.background }}>
      <View style={{ alignItems: 'center', paddingTop: theme.space['4xl'], paddingBottom: theme.space.md }}>
        <AppText variant="micro" tone="primary" weight="700" style={{ letterSpacing: 2 }}>AZURE HORIZON</AppText>
        <AppText variant="title" style={{ marginTop: theme.space.sm }}>Staff clock in / out</AppText>
        <AppText variant="caption" tone="secondary" style={{ marginTop: 4 }}>GPS-verified — tap on site, no hardware needed</AppText>
      </View>

      {!user ? (
        <Card style={{ margin: theme.space.lg, alignItems: 'center', gap: theme.space.md, backgroundColor: theme.colors.warningSoft, borderColor: theme.colors.warningSoft }}>
          <AppText variant="body" color={theme.colors.warningStrong} align="center">
            Please sign in to clock in/out. Install the Azure Horizon app for the full experience.
          </AppText>
          <Button label="Sign in" onPress={() => router.push('/login' as never)} fullWidth={false} />
        </Card>
      ) : null}

      <ClockInPanel />

      <AppText variant="caption" tone="muted" align="center" style={{ padding: theme.space.lg }} onPress={() => Linking.openURL('https://azurerest.netlify.app')}>
        azurerest.netlify.app
      </AppText>
    </View>
  );
}
