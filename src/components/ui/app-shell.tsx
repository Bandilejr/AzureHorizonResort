// src/components/ui/app-shell.tsx — the shared home shell.
// Calm header (context · greeting · date), notification bell, avatar and a
// quiet sync indicator. Role homes render their briefing as children.
import React, { useEffect, useState, type ReactNode } from 'react';
import { View, RefreshControl, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import { useRouter } from 'expo-router';
import { useAppTheme } from '@/design/use-app-theme';
import { useAuth } from '@/context/AuthContext';
import { auth, listenForNotifications } from '@/services/firebase-services';
import { AppText } from './text';
import { Avatar } from './avatar';
import { IconButton } from './icon-button';
import { Screen } from './screen';
import { SyncIndicator } from './sync-indicator';
import { FadeSlideIn } from './motion';
import { useGroupHref } from '@/utils/route-group';

export function greetingFor(d: Date = new Date()): string {
  const h = d.getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

export function roleLabelFor(role?: string | null, subRole?: string | null): string {
  switch (role) {
    case 'admin': return 'Administrator';
    case 'kitchen_manager': return 'Kitchen Manager';
    case 'chef': return 'Chef';
    case 'collector': return 'Collector';
    case 'npo_rep': return 'NPO Representative';
    case 'staff':
      switch (subRole) {
        case 'event_manager': return 'Event Manager';
        case 'front_desk': return 'Front Desk';
        case 'maintenance': return 'Maintenance';
        case 'catering_staff': return 'Catering Staff';
        case 'housekeeping': return 'Housekeeping';
        case 'kitchen_manager': return 'Kitchen Manager';
        default: return 'Staff';
      }
    default: return 'Guest';
  }
}

export function dateLine(d: Date = new Date()): string {
  return d.toLocaleDateString('en-ZA', { weekday: 'short', day: 'numeric', month: 'short' });
}

function useUnreadCount(enabled: boolean): number {
  const [count, setCount] = useState(0);
  useEffect(() => {
    const uid = auth.currentUser?.uid;
    if (!enabled || !uid) return;
    return listenForNotifications(
      uid,
      (list: any[]) => setCount(list.filter((n) => !n.read).length),
      () => { /* bell badge is best-effort; errors surface in the inbox */ },
    );
  }, [enabled]);
  return count;
}

export interface AppShellProps {
  /** Small uppercase context line, e.g. "Kitchen Manager · FixedFunding". */
  context?: string;
  /** Optional explicit title; defaults to greeting + first name. */
  title?: string;
  subtitle?: string;
  onNotifications?: () => void;
  onProfile?: () => void;
  onSync?: () => void;
  showBell?: boolean;
  showSync?: boolean;
  scroll?: boolean;
  refreshing?: boolean;
  onRefresh?: () => void;
  /** Extra header actions rendered before the avatar. */
  headerRight?: ReactNode;
  children: ReactNode;
  contentContainerStyle?: StyleProp<ViewStyle>;
}

export function AppShell({
  context,
  title,
  subtitle,
  onNotifications,
  onProfile,
  onSync,
  showBell = true,
  showSync = true,
  scroll = true,
  refreshing,
  onRefresh,
  headerRight,
  children,
  contentContainerStyle,
}: AppShellProps) {
  const theme = useAppTheme();
  const router = useRouter();
  const { profile } = useAuth();
  const unread = useUnreadCount(showBell);
  // Bare hrefs ("notifications") are invalid in Expo Router and resolve to an
  // arbitrary route group, so default to the caller's own group.
  const groupHref = useGroupHref();

  const name = (profile?.displayName || '').trim().split(/\s+/)[0] || 'there';
  const headerTitle = title ?? `${greetingFor()}, ${name}`;
  const contextLine =
    context ?? `${roleLabelFor(profile?.role, profile?.subRole)} · FixedFunding`;
  const sub = subtitle ?? dateLine();

  return (
    <Screen
      scroll={scroll}
      contentContainerStyle={contentContainerStyle}
      refreshControl={
        onRefresh ? (
          <RefreshControl refreshing={!!refreshing} onRefresh={onRefresh} tintColor={theme.colors.primary} />
        ) : undefined
      }
    >
      <View style={[styles.header, { marginBottom: theme.space['2xl'] }]}>
        <View style={{ flex: 1, gap: 2 }}>
          <AppText variant="micro" tone="muted" weight="700" style={styles.context}>
            {contextLine}
          </AppText>
          <AppText variant="title" numberOfLines={1}>
            {headerTitle}
          </AppText>
          <AppText variant="caption" tone="secondary" numberOfLines={1}>
            {sub}
          </AppText>
        </View>
        <View style={[styles.controls, { gap: theme.space.xs }]}>
          {showSync ? <SyncIndicator onPress={onSync} /> : null}
          {headerRight}
          {showBell ? (
            <IconButton
              name="notifications-outline"
              accessibilityLabel={unread > 0 ? `Notifications, ${unread} unread` : 'Notifications'}
              badge={unread}
              onPress={onNotifications ?? (() => router.push(groupHref('notifications') as any))}
            />
          ) : null}
          <Avatar
            label={profile?.displayName}
            onPress={onProfile ?? (() => router.push(groupHref('profile') as any))}
          />
        </View>
      </View>
      <FadeSlideIn>{children}</FadeSlideIn>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'flex-start' },
  context: { textTransform: 'uppercase', letterSpacing: 0.6 },
  controls: { flexDirection: 'row', alignItems: 'center' },
});

export default AppShell;
