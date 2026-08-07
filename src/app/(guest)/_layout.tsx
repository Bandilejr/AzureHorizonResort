import { Tabs } from 'expo-router';
import { View, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '@/context/AuthContext';

export default function GuestLayout() {
  const { isGuest } = useAuth();

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
            return <Text style={{ fontSize: 11, fontWeight: '600' }}>{labels[route.name] || route.name}</Text>;
          },
        };
      }}
      tabBarOptions={{
        activeTintColor: '#c9a227',
        inactiveTintColor: '#94a3b8',
        style: { backgroundColor: '#fff', elevation: 8, borderTopWidth: 1, borderTopColor: '#e2e8f0' },
        labelStyle: { fontSize: 11, fontWeight: '600' },
        indicatorStyle: { backgroundColor: '#c9a227', height: 3 },
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