import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useColorScheme } from 'react-native';
import { usePermissions } from '@/context/PermissionsContext';
import { getTheme } from '@/constants/theme';
import RouteGuard from '@/components/RouteGuard';

function KitchenTabs() {
  const colorScheme = useColorScheme();
  const theme = getTheme(colorScheme as any);
  const { hasPermission } = usePermissions();

  // SRS: UC35 kitchen staff · UC36/37/40 kitchen manager · chef = food ops lead.
  const canAllocate = hasPermission('donation_allocate');
  const canRoster = hasPermission('roster_manage');
  const canAttend = hasPermission('attendance_review');

  const primaryTab = canRoster
    ? { title: 'Roster', icon: 'calendar', name: 'roster-builder' as const }
    : canAllocate
      ? { title: 'Allocate', icon: 'git-compare', name: 'allocations' as const }
      : { title: 'Home', icon: 'restaurant', name: 'dashboard' as const };

  return (
    <Tabs
      screenOptions={({ route }) => {
        const isPrimary = route.name === primaryTab.name;
        const config = isPrimary
          ? primaryTab
          : route.name === 'dashboard'
            ? { title: 'Home', icon: 'restaurant' }
            : route.name === 'allocations'
              ? { title: 'Allocate', icon: 'git-compare' }
              : route.name === 'roster-builder'
                ? { title: 'Roster', icon: 'calendar' }
                : route.name === 'attendance'
                  ? { title: 'Attend.', icon: 'time' }
                  : null;
        return {
          headerShown: false,
          tabBarIcon: ({ color, size }) => (
            <Ionicons name={(config?.icon || 'help') as any} size={size} color={color} />
          ),
          tabBarLabel: config?.title || route.name,
          tabBarActiveTintColor: theme.colors.primary,
          tabBarInactiveTintColor: theme.colors.textMuted,
          tabBarStyle: {
            backgroundColor: theme.colors.surface,
            borderTopWidth: 1,
            borderTopColor: theme.colors.border,
            height: 64,
            paddingBottom: 8,
            paddingTop: 6,
          },
          tabBarLabelStyle: { fontSize: 11, fontWeight: '600' },
        };
      }}
    >
      <Tabs.Screen name="dashboard" options={{ title: 'Home' }} />
      <Tabs.Screen
        name="allocations"
        options={canAllocate ? { title: 'Allocate' } : { href: null, title: 'Allocate' }}
      />
      <Tabs.Screen
        name="roster-builder"
        options={canRoster ? { title: 'Roster' } : { href: null, title: 'Roster' }}
      />
      <Tabs.Screen
        name="attendance"
        options={canAttend ? { title: 'Attend.' } : { href: null, title: 'Attend.' }}
      />
      <Tabs.Screen name="logistics" options={{ href: null }} />
      <Tabs.Screen name="open-shifts" options={{ href: null }} />
      <Tabs.Screen name="notifications" options={{ href: null }} />
      <Tabs.Screen name="donation-log" options={{ href: null }} />
      <Tabs.Screen name="donation-scan" options={{ href: null }} />
      <Tabs.Screen name="order-queue" options={{ href: null }} />
      <Tabs.Screen name="leave-manage" options={{ href: null }} />
      <Tabs.Screen name="sync-queue" options={{ href: null }} />
    </Tabs>
  );
}

export default function KitchenLayout() {
  return (
    <RouteGuard allow={['kitchen', 'admin', 'courier']}>
      <KitchenTabs />
    </RouteGuard>
  );
}
