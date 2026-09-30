import React from 'react';
import { Tabs } from 'expo-router';
import { useColorScheme } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { getTheme } from '@/constants/theme';
import RouteGuard from '@/components/RouteGuard';

const TAB_ICONS: Record<string, { label: string; icon: string }> = {
  'guest-portal': { label: 'Portal', icon: 'home' },
  'digital-key': { label: 'Digital Key', icon: 'key' },
  'event-booking': { label: 'Events', icon: 'calendar' },
  dining: { label: 'Dining', icon: 'restaurant' },
  spa: { label: 'Spa', icon: 'leaf' },
  loyalty: { label: 'Loyalty', icon: 'diamond' },
  profile: { label: 'Profile', icon: 'person' },
};

export default function GuestLayout() {
  const colorScheme = useColorScheme();
  const theme = getTheme(colorScheme as any);

  return (
    <RouteGuard allow="guest">
    <Tabs
      screenOptions={({ route }) => {
        const config = TAB_ICONS[route.name] || { label: route.name, icon: 'help' };
        const isDigitalKey = route.name === 'digital-key';

        return {
          headerShown: false,
          tabBarIcon: ({ color, size, focused }) => {
            const iconName = config.icon + (focused ? '' : '-outline');
            return (
              <Ionicons
                name={iconName as any}
                size={isDigitalKey ? size + 4 : size}
                color={isDigitalKey ? theme.colors.primary : color}
              />
            );
          },
          tabBarLabel: config.label,
          tabBarActiveTintColor: isDigitalKey ? theme.colors.primary : theme.colors.primary,
          tabBarInactiveTintColor: theme.colors.textMuted,
          tabBarStyle: {
            backgroundColor: theme.colors.surface,
            borderTopWidth: 1,
            borderTopColor: theme.colors.border,
            height: 64,
            paddingBottom: 8,
            paddingTop: 6,
          },
        };
      }}
    >
      <Tabs.Screen name="guest-portal" options={{ title: 'Portal' }} />
      <Tabs.Screen name="event-booking" options={{ title: 'Events' }} />
      <Tabs.Screen name="digital-key" options={{ title: 'Digital Key' }} />
      <Tabs.Screen name="profile" options={{ title: 'Profile' }} />
      <Tabs.Screen name="loyalty" options={{ title: 'Loyalty' }} />

      <Tabs.Screen name="dining" options={{ href: null }} />
      <Tabs.Screen name="spa" options={{ href: null }} />
      <Tabs.Screen name="tours" options={{ href: null }} />
      <Tabs.Screen name="billing" options={{ href: null }} />
      <Tabs.Screen name="concierge" options={{ href: null }} />
      <Tabs.Screen name="event-catering" options={{ href: null }} />
      <Tabs.Screen name="event-feedback" options={{ href: null }} />
      <Tabs.Screen name="event-invitations" options={{ href: null }} />
      <Tabs.Screen name="explore" options={{ href: null }} />
      <Tabs.Screen name="live-complaint" options={{ href: null }} />
      <Tabs.Screen name="leave-review" options={{ href: null }} />
      <Tabs.Screen name="my-orders" options={{ href: null }} />
      <Tabs.Screen name="payment" options={{ href: null }} />
      <Tabs.Screen name="refund-request" options={{ href: null }} />
      <Tabs.Screen name="reservations" options={{ href: null }} />
      <Tabs.Screen name="room-gallery" options={{ href: null }} />
      <Tabs.Screen name="room-service" options={{ href: null }} />
    </Tabs>
    </RouteGuard>
  );
}