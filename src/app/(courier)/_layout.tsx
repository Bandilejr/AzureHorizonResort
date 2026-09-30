// (courier) Phase 1 §24 — Collector/Courier route group.
// Collectors land on the Courier & Collections home (never manager Kitchen
// Operations). RouteGuard enforces the courier role area on every deep link.
import { Tabs } from 'expo-router';
import { useAppTheme } from '@/design/use-app-theme';
import RouteGuard from '@/components/RouteGuard';
import { makeTabScreenOptions, type TabDef } from '@/components/ui/tab-options';

const CONFIG: Record<string, TabDef> = {
  dashboard: { title: 'Today', icon: 'today-outline' },
  scan: { title: 'Scan', icon: 'scan-outline' },
  sync: { title: 'Sync', icon: 'sync-outline' },
  profile: { title: 'Profile', icon: 'person-outline' },
};

function CourierTabs() {
  const theme = useAppTheme();
  return (
    <Tabs screenOptions={makeTabScreenOptions(theme, CONFIG)}>
      <Tabs.Screen name="dashboard" options={{ title: 'Today' }} />
      <Tabs.Screen name="scan" options={{ title: 'Scan' }} />
      <Tabs.Screen name="sync" options={{ title: 'Sync' }} />
      <Tabs.Screen name="profile" options={{ title: 'Profile' }} />
      <Tabs.Screen name="notifications" options={{ href: null }} />
      <Tabs.Screen name="collection/[id]" options={{ href: null }} />
    </Tabs>
  );
}

export default function CourierLayout() {
  return (
    <RouteGuard allow="courier">
      <CourierTabs />
    </RouteGuard>
  );
}
