'use client';

import React from 'react';
import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '@/context/AuthContext';
import { usePermissions } from '@/context/PermissionsContext';

const GUEST_TABS = [
  { name: 'index', title: 'Portal', icon: 'home', badge: null },
  { name: 'event-booking', title: 'Events', icon: 'calendar', badge: null },
  { name: 'dining', title: 'Dining', icon: 'restaurant', badge: null },
  { name: 'spa', title: 'Spa', icon: 'leaf', badge: null },
  { name: 'loyalty', title: 'Rewards', icon: 'diamond', badge: 'points' },
];

const STAFF_TABS_BASE = [
  { name: 'staff-dashboard', title: 'Dashboard', icon: 'speedometer', badge: null, permission: null },
];

const STAFF_TABS_BY_PERMISSION = {
  staff_checkin: { name: 'staff-checkin', title: 'Staff Check-in', icon: 'id-card', badge: null },
  pre_inspection: { name: 'pre-event-inspection', title: 'Pre-Inspection', icon: 'clipboard', badge: null },
  attendee_checkin: { name: 'attendee-checkin', title: 'Attendee Check-in', icon: 'qr-code', badge: null },
  post_inspection: { name: 'post-event-inspection', title: 'Post-Inspection', icon: 'construct', badge: null },
  damage_resolution: { name: 'damage-resolution', title: 'Damages', icon: 'alert', badge: null },
  live_complaints: { name: 'live-complaints', title: 'Live Complaints', icon: 'warning', badge: null },
  refund_approve: { name: 'refund-management', title: 'Refunds', icon: 'cash', badge: null },
};

const ADMIN_TABS = [
  { name: 'refund-management', title: 'Refunds', icon: 'cash', badge: null },
];

export function RoleBasedTabs() {
  const { profile, loading } = useAuth();
  const { hasPermission, isStaff, isAdmin } = usePermissions();

  if (loading) {
    return (
      <Tabs screenOptions={{ headerShown: false }}>
        <Tabs.Screen name="index" />
      </Tabs>
    );
  }

  // Determine which tabs to show based on role
  let tabs: Array<{ name: string; title: string; icon: string; badge?: string; permission?: string }> = [];

  if (profile?.role === 'admin') {
    tabs = ADMIN_TABS;
  } else if (profile?.role === 'staff' && isStaff) {
    tabs = [...STAFF_TABS_BASE];
    // Add permission-based tabs
    Object.entries(STAFF_TABS_BY_PERMISSION).forEach(([permission, tab]) => {
      if (hasPermission(permission as any)) {
        tabs.push({ ...tab, permission });
      }
    });
  } else {
    // Guest tabs
    tabs = GUEST_TABS;
  }

  return (
    <Tabs
      screenOptions={({ route }) => {
        const tab = tabs.find(t => t.name === route.name);
        return {
          headerShown: false,
          tabBarIcon: ({ focused, color, size }) => {
            const iconName = tab?.icon || 'help';
            return <Ionicons name={iconName} size={size} color={color} />;
          },
          tabBarLabel: tab?.title,
        };
      }}
      tabBarOptions={{
        activeTintColor: '#c9a227',
        inactiveTintColor: '#94a3b8',
        style: { backgroundColor: '#fff', borderTopWidth: 0, elevation: 8 },
        labelStyle: { fontSize: 11, fontWeight: '600' },
      }}
    >
      {tabs.map((tab) => (
        <Tabs.Screen key={tab.name} name={tab.name} />
      ))}
    </Tabs>
  );
}