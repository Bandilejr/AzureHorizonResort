// src/components/profile-screen.tsx — one role-aware Profile/Settings screen.
// Shows identity, role/context, language, device and sync status, and a
// confirmed sign-out. Never renders UIDs, document IDs or config.
import React, { useState } from 'react';
import { View, Pressable, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme } from '@/design/use-app-theme';
import { useAuth } from '@/context/AuthContext';
import { useTranslation } from '@/i18n/hooks';
import { deviceModelLabel, devicePlatformLabel } from '@/services/device';
import { AppText } from '@/components/ui/text';
import { Avatar, RoleBadge } from '@/components/ui/avatar';
import { Screen } from '@/components/ui/screen';
import { Surface } from '@/components/ui/surface';
import { SyncIndicator } from '@/components/ui/sync-indicator';
import { roleLabelFor } from '@/components/ui/app-shell';
import { CustomAlertModal, type AlertConfig } from '@/components/CustomAlertModal';

const LANGUAGES: { code: 'en' | 'zu' | 'af'; label: string }[] = [
  { code: 'en', label: 'English' },
  { code: 'zu', label: 'isiZulu' },
  { code: 'af', label: 'Afrikaans' },
];

export interface ProfileScreenProps {
  /**
   * Fully-qualified, group-scoped route to this area's sync queue.
   * Groups without a sync queue omit it (and the Sync row is hidden).
   */
  syncRoute?: string;
}

export function ProfileScreen({ syncRoute }: ProfileScreenProps = {}) {
  const theme = useAppTheme();
  const router = useRouter();
  const { profile, signOut } = useAuth();
  const { language, setLanguage } = useTranslation();
  const [alert, setAlert] = useState<AlertConfig>({ visible: false, title: '', message: '' });

  const roleText = roleLabelFor(profile?.role, profile?.subRole);
  const contextBits = [profile?.department, profile?.position].filter(Boolean) as string[];

  const confirmSignOut = () =>
    setAlert({
      visible: true,
      title: 'Sign out?',
      message: 'You will need to sign in again to access your work.',
      type: 'warning',
      confirmText: 'Sign out',
      cancelText: 'Stay',
      onConfirm: async () => { await signOut(); router.replace('/'); },
    });

  return (
    <Screen scroll contentContainerStyle={{ paddingTop: theme.space.lg }}>
      <AppText variant="title" style={{ marginBottom: theme.space.lg }}>
        Profile
      </AppText>

      <Surface tone="surface" bordered radius="xl" padding="lg" style={{ gap: theme.space.md }}>
        <View style={[styles.identity, { gap: theme.space.md }]}>
          <Avatar label={profile?.displayName} size={56} />
          <View style={{ flex: 1, gap: 4 }}>
            <AppText variant="subtitle" numberOfLines={1}>
              {profile?.displayName || 'Signed in'}
            </AppText>
            <RoleBadge label={roleText} />
            {profile?.email ? (
              <AppText variant="caption" tone="secondary" numberOfLines={1}>
                {profile.email}
              </AppText>
            ) : null}
          </View>
        </View>
        {contextBits.length > 0 ? (
          <AppText variant="caption" tone="muted">
            {contextBits.join(' · ')}
          </AppText>
        ) : null}
      </Surface>

      <AppText variant="micro" tone="muted" weight="700" style={[styles.section, { marginTop: theme.space['2xl'] }]}>
        PREFERENCES
      </AppText>
      <Surface tone="surface" bordered radius="lg" padding="none">
        <View style={{ padding: theme.space.lg, gap: theme.space.md }}>
          <AppText variant="label" tone="secondary">
            Language
          </AppText>
          <View style={[styles.langRow, { gap: theme.space.sm }]}>
            {LANGUAGES.map((l) => {
              const active = language === l.code;
              return (
                <Pressable
                  key={l.code}
                  onPress={() => setLanguage(l.code)}
                  accessibilityRole="button"
                  style={[
                    styles.langChip,
                    {
                      backgroundColor: active ? theme.colors.primary : theme.colors.surfaceVariant,
                      borderColor: active ? theme.colors.primary : theme.colors.border,
                      borderRadius: theme.radius.pill,
                    },
                  ]}
                >
                  <AppText
                    variant="label"
                    weight="600"
                    color={active ? theme.colors.textInverse : theme.colors.textSecondary}
                  >
                    {l.label}
                  </AppText>
                </Pressable>
              );
            })}
          </View>
        </View>
      </Surface>

      <AppText variant="micro" tone="muted" weight="700" style={[styles.section, { marginTop: theme.space['2xl'] }]}>
        DEVICE & SYNC
      </AppText>
      <Surface tone="surface" bordered radius="lg" padding="lg" style={{ gap: theme.space.md }}>
        <View style={styles.row}>
          <AppText variant="body" tone="secondary">
            Device
          </AppText>
          <AppText variant="bodyStrong" numberOfLines={1}>
            {deviceModelLabel()} · {devicePlatformLabel()}
          </AppText>
        </View>
        {syncRoute ? (
          <View style={styles.row}>
            <AppText variant="body" tone="secondary">
              Sync
            </AppText>
            <SyncIndicator onPress={() => router.push(syncRoute as any)} />
          </View>
        ) : null}
      </Surface>

      <Pressable
        onPress={confirmSignOut}
        accessibilityRole="button"
        style={[
          styles.signOut,
          {
            marginTop: theme.space['3xl'],
            borderRadius: theme.radius.lg,
            borderColor: theme.colors.error,
            backgroundColor: theme.colors.errorSoft,
          },
        ]}
      >
        <Ionicons name="log-out-outline" size={theme.iconSize.md} color={theme.colors.error} />
        <AppText variant="bodyStrong" color={theme.colors.error}>
          Sign out
        </AppText>
      </Pressable>

      <View style={{ height: theme.space['4xl'] }} />
      <CustomAlertModal config={alert} onClose={() => setAlert((p) => ({ ...p, visible: false }))} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  identity: { flexDirection: 'row', alignItems: 'center' },
  section: { letterSpacing: 0.6, marginBottom: 8 },
  langRow: { flexDirection: 'row', flexWrap: 'wrap' },
  langChip: { paddingHorizontal: 14, paddingVertical: 8, borderWidth: 1 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  signOut: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderWidth: 1,
  },
});

export default ProfileScreen;
