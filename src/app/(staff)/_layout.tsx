import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '@/context/AuthContext';
import { usePermissions } from '@/context/PermissionsContext';

const STAFF_TABS_CONFIG = {
  'staff-dashboard': { title: 'Dashboard', icon: 'speedometer' },
  'staff-checkin': { title: 'Staff Check-in', icon: 'id-card' },
  'pre-event-inspection': { title: 'Pre-Inspection', icon: 'clipboard' },
  'attendee-checkin': { title: 'Attendee Check-in', icon: 'qr-code' },
  'post-event-inspection': { title: 'Post-Inspection', icon: 'construct' },
  'damage-resolution': { title: 'Damages', icon: 'alert' },
  'live-complaints': { title: 'Live Complaints', icon: 'warning' },
  'refund-management': { title: 'Refunds', icon: 'cash' },
};

export default function StaffLayout() {
  const { profile, loading } = useAuth();
  const { hasPermission, getPermissions } = usePermissions();

  if (loading) {
    return <Tabs screenOptions={{ headerShown: false }}><Tabs.Screen name="staff-dashboard" /></Tabs>;
  }

  const permissions = getPermissions();
  const availableTabs = ['staff-dashboard'];

  // Add tabs based on permissions
  if (permissions.includes('staff_checkin')) availableTabs.push('staff-checkin');
  if (permissions.includes('pre_inspection')) availableTabs.push('pre-event-inspection');
  if (permissions.includes('attendee_checkin')) availableTabs.push('attendee-checkin');
  if (permissions.includes('post_inspection')) availableTabs.push('post-event-inspection');
  if (permissions.includes('damage_resolution')) availableTabs.push('damage-resolution');
  if (permissions.includes('live_complaints')) availableTabs.push('live-complaints');
  if (permissions.includes('refund_approve')) availableTabs.push('refund-management');

  return (
    <Tabs
      screenOptions={({ route }) => {
        const config = STAFF_TABS_CONFIG[route.name as keyof typeof STAFF_TABS_CONFIG];
        return {
          headerShown: false,
          tabBarIcon: ({ focused, color, size }) => (
            <Ionicons name={config?.icon || 'help'} size={size} color={color} />
          ),
          tabBarLabel: config?.title || route.name,
        };
      }}
      tabBarOptions={{
        activeTintColor: '#c9a227',
        inactiveTintColor: '#94a3b8',
        style: { backgroundColor: '#fff', elevation: 8 },
        labelStyle: { fontSize: 11, fontWeight: '600' },
        scrollEnabled: true,
      }}
    >
      {availableTabs.map((name) => (
        <Tabs.Screen key={name} name={name} />
      ))}
    </Tabs>
  );
}