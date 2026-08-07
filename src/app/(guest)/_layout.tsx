import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

export default function GuestLayout() {
  return (
    <Tabs
      screenOptions={({ route }) => {
        const icons: Record<string, string> = {
          index: 'home',
          'event-booking': 'calendar',
          dining: 'restaurant',
          spa: 'leaf',
          loyalty: 'diamond',
          profile: 'person',
        };
        return {
          headerShown: false,
          tabBarIcon: ({ focused, color, size }) => (
            <Ionicons name={icons[route.name] || 'help'} size={size} color={color} />
          ),
          tabBarLabel: ({ focused }) => {
            const labels: Record<string, string> = {
              index: 'Portal',
              'event-booking': 'Events',
              dining: 'Dining',
              spa: 'Spa',
              loyalty: 'Rewards',
              profile: 'Profile',
            };
            return labels[route.name] || route.name;
          },
        };
      }}
      tabBarOptions={{
        activeTintColor: '#c9a227',
        inactiveTintColor: '#94a3b8',
        style: { backgroundColor: '#fff', elevation: 8 },
        labelStyle: { fontSize: 11, fontWeight: '600' },
      }}
    >
      <Tabs.Screen name="index" />
      <Tabs.Screen name="event-booking" />
      <Tabs.Screen name="dining" />
      <Tabs.Screen name="spa" />
      <Tabs.Screen name="loyalty" />
      <Tabs.Screen name="profile" />
    </Tabs>
  );
}