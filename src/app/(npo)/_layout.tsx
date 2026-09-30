import { Tabs } from 'expo-router';
import { useAppTheme } from '@/design/use-app-theme';
import RouteGuard from '@/components/RouteGuard';
import { makeTabScreenOptions, type TabDef } from '@/components/ui/tab-options';

const CONFIG: Record<string, TabDef> = {
  dashboard: { title: 'Home', icon: 'home-outline' },
  allocations: { title: 'Allocations', icon: 'gift-outline' },
  collections: { title: 'Collections', icon: 'cube-outline' },
  organisation: { title: 'Facilities', icon: 'business-outline' },
  profile: { title: 'Profile', icon: 'person-outline' },
};

function NpoTabs() {
  const theme = useAppTheme();
  return (
    <Tabs screenOptions={makeTabScreenOptions(theme, CONFIG)}>
      <Tabs.Screen name="dashboard" options={{ title: 'Home' }} />
      <Tabs.Screen name="allocations" options={{ title: 'Allocations' }} />
      <Tabs.Screen name="collections" options={{ title: 'Collections' }} />
      <Tabs.Screen name="organisation" options={{ title: 'Facilities' }} />
      <Tabs.Screen name="profile" options={{ title: 'Profile' }} />
      <Tabs.Screen name="notifications" options={{ href: null }} />
    </Tabs>
  );
}

export default function NpoLayout() {
  return (
    <RouteGuard allow="npo">
      <NpoTabs />
    </RouteGuard>
  );
}
