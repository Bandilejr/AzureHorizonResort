import { Tabs } from 'expo-router';
import { useAppTheme } from '@/design/use-app-theme';
import RouteGuard from '@/components/RouteGuard';
import { makeTabScreenOptions, type TabDef } from '@/components/ui/tab-options';

const CONFIG: Record<string, TabDef> = {
  dashboard: { title: 'Overview', icon: 'grid-outline' },
  'npo-verification': { title: 'Organizations', icon: 'business-outline' },
  'refund-management': { title: 'Refunds', icon: 'cash-outline' },
  impact: { title: 'Reports', icon: 'bar-chart-outline' },
  profile: { title: 'Profile', icon: 'person-outline' },
};

function AdminTabs() {
  const theme = useAppTheme();
  return (
    <Tabs screenOptions={makeTabScreenOptions(theme, CONFIG)}>
      <Tabs.Screen name="dashboard" options={{ title: 'Overview' }} />
      <Tabs.Screen name="npo-verification" options={{ title: 'Organizations' }} />
      <Tabs.Screen name="refund-management" options={{ title: 'Refunds' }} />
      <Tabs.Screen name="impact" options={{ title: 'Reports' }} />
      <Tabs.Screen name="profile" options={{ title: 'Profile' }} />
      <Tabs.Screen name="notifications" options={{ href: null }} />
    </Tabs>
  );
}

export default function AdminLayout() {
  return (
    <RouteGuard allow="admin">
      <AdminTabs />
    </RouteGuard>
  );
}
