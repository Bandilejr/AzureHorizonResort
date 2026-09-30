import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useColorScheme } from 'react-native';
import { useAuth } from '@/context/AuthContext';
import { usePermissions } from '@/context/PermissionsContext';
import { getTheme } from '@/constants/theme';
import RouteGuard from '@/components/RouteGuard';

const STAFF_TABS_CONFIG = {
  'staff-dashboard': { title: 'Dashboard', icon: 'speedometer' },
  'attendee-checkin': { title: 'Event Ops', icon: 'qr-code' },
  'pre-event-inspection': { title: 'Inspections', icon: 'clipboard' },
  'live-complaints': { title: 'Complaints', icon: 'warning' },
};

function StaffLayoutInner() {
  const { profile, loading } = useAuth();
  const { hasPermission } = usePermissions();
  const colorScheme = useColorScheme();
  const theme = getTheme(colorScheme as any);

  // SRS UC39–43 (staff) vs Increment-1 hotel ops: hide tabs the sub-role lacks.
  const canEventOps = hasPermission('attendee_checkin') || hasPermission('staff_checkin');
  const canInspect = hasPermission('pre_inspection') || hasPermission('post_inspection');
  const canComplaints = hasPermission('live_complaints');

  if (loading) {
    return (
      <Tabs
        screenOptions={{
          headerShown: false,
          tabBarActiveTintColor: theme.colors.primary,
          tabBarInactiveTintColor: theme.colors.textMuted,
          tabBarStyle: { backgroundColor: theme.colors.surface, borderTopWidth: 1, borderTopColor: theme.colors.border },
        }}
      >
        <Tabs.Screen name="staff-dashboard" />
      </Tabs>
    );
  }

  return (
    <Tabs
      screenOptions={({ route }) => {
        const config = STAFF_TABS_CONFIG[route.name as keyof typeof STAFF_TABS_CONFIG];
        return {
          headerShown: false,
          tabBarIcon: ({ focused, color, size }) => (
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
      <Tabs.Screen name="staff-dashboard" options={{ title: 'Dashboard' }} />
      <Tabs.Screen name="attendee-checkin" options={canEventOps ? { title: 'Event Ops' } : { href: null, title: 'Event Ops' }} />
      <Tabs.Screen name="pre-event-inspection" options={canInspect ? { title: 'Inspections' } : { href: null, title: 'Inspections' }} />
      <Tabs.Screen name="live-complaints" options={canComplaints ? { title: 'Complaints' } : { href: null, title: 'Complaints' }} />

      {/* Hidden stack screens — employment UCs (UC39–43) */}
      <Tabs.Screen name="staff-checkin" options={{ href: null }} />
      <Tabs.Screen name="post-event-inspection" options={{ href: null }} />
      <Tabs.Screen name="damage-resolution" options={{ href: null }} />
      <Tabs.Screen name="today-events" options={{ href: null }} />
      <Tabs.Screen name="event-ops" options={{ href: null }} />
      <Tabs.Screen name="clock-in-out" options={{ href: null }} />
      <Tabs.Screen name="notifications" options={{ href: null }} />
      <Tabs.Screen name="availability-leave" options={{ href: null }} />
      <Tabs.Screen name="my-roster" options={{ href: null }} />
      <Tabs.Screen name="shift-swaps" options={{ href: null }} />
      <Tabs.Screen name="open-shifts" options={{ href: null }} />
      <Tabs.Screen name="sync-queue" options={{ href: null }} />

      {/* Admin-only actors live under (admin); keep files routed but never linked from staff. */}
      <Tabs.Screen name="refund-management" options={{ href: null }} />
      <Tabs.Screen name="loyalty-scanner" options={{ href: null }} />
    </Tabs>
  );
}

export default function StaffLayout() {
  return (
    <RouteGuard allow={['staff', 'kitchen', 'admin', 'courier']}>
      <StaffLayoutInner />
    </RouteGuard>
  );
}
