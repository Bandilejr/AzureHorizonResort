import { Tabs } from 'expo-router';
import { useAppTheme } from '@/design/use-app-theme';
import { usePermissions } from '@/context/PermissionsContext';
import RouteGuard from '@/components/RouteGuard';
import { makeTabScreenOptions, type TabDef } from '@/components/ui/tab-options';

const CONFIG: Record<string, TabDef> = {
  'staff-dashboard': { title: 'Home', icon: 'home-outline' },
  'attendee-checkin': { title: 'Event Ops', icon: 'qr-code-outline' },
  'pre-event-inspection': { title: 'Inspections', icon: 'clipboard-outline' },
  'live-complaints': { title: 'Complaints', icon: 'warning-outline' },
  profile: { title: 'Profile', icon: 'person-outline' },
};

function StaffLayoutInner() {
  const theme = useAppTheme();
  const { hasPermission } = usePermissions();

  const canEventOps = hasPermission('attendee_checkin') || hasPermission('staff_checkin');
  const canInspect = hasPermission('pre_inspection') || hasPermission('post_inspection');
  const canComplaints = hasPermission('live_complaints');

  return (
    <Tabs screenOptions={makeTabScreenOptions(theme, CONFIG)}>
      <Tabs.Screen name="staff-dashboard" options={{ title: 'Home' }} />
      <Tabs.Screen name="attendee-checkin" options={canEventOps ? { title: 'Event Ops' } : { href: null }} />
      <Tabs.Screen name="pre-event-inspection" options={canInspect ? { title: 'Inspections' } : { href: null }} />
      <Tabs.Screen name="live-complaints" options={canComplaints ? { title: 'Complaints' } : { href: null }} />
      <Tabs.Screen name="profile" options={{ title: 'Profile' }} />

      {/* Hidden stack screens — employment UCs (UC39–45) */}
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
