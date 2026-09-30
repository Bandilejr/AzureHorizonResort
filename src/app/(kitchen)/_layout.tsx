import { Tabs } from 'expo-router';
import { useAppTheme } from '@/design/use-app-theme';
import { usePermissions } from '@/context/PermissionsContext';
import RouteGuard from '@/components/RouteGuard';
import { makeTabScreenOptions, type TabDef } from '@/components/ui/tab-options';

const CONFIG: Record<string, TabDef> = {
  dashboard: { title: 'Home', icon: 'restaurant-outline' },
  allocations: { title: 'Allocate', icon: 'git-compare-outline' },
  'roster-builder': { title: 'Roster', icon: 'calendar-outline' },
  attendance: { title: 'Attend.', icon: 'time-outline' },
  profile: { title: 'Profile', icon: 'person-outline' },
};

function KitchenTabs() {
  const theme = useAppTheme();
  const { hasPermission } = usePermissions();

  const canAllocate = hasPermission('donation_allocate');
  const canRoster = hasPermission('roster_manage');
  const canAttend = hasPermission('attendance_review');

  return (
    <Tabs screenOptions={makeTabScreenOptions(theme, CONFIG)}>
      <Tabs.Screen name="dashboard" options={{ title: 'Home' }} />
      <Tabs.Screen name="allocations" options={canAllocate ? { title: 'Allocate' } : { href: null }} />
      <Tabs.Screen name="roster-builder" options={canRoster ? { title: 'Roster' } : { href: null }} />
      <Tabs.Screen name="attendance" options={canAttend ? { title: 'Attend.' } : { href: null }} />
      <Tabs.Screen name="profile" options={{ title: 'Profile' }} />

      <Tabs.Screen name="logistics" options={{ href: null }} />
      <Tabs.Screen name="open-shifts" options={{ href: null }} />
      <Tabs.Screen name="notifications" options={{ href: null }} />
      <Tabs.Screen name="donation-log" options={{ href: null }} />
      <Tabs.Screen name="donation-scan" options={{ href: null }} />
      <Tabs.Screen name="order-queue" options={{ href: null }} />
      <Tabs.Screen name="leave-manage" options={{ href: null }} />
      <Tabs.Screen name="sync-queue" options={{ href: null }} />
      <Tabs.Screen name="collection/[id]" options={{ href: null }} />
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
