import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

export default function AdminLayout() {
  return (
    <Tabs
      screenOptions={({ route }) => {
        const icons: Record<string, string> = {
          'refund-management': 'cash',
          reports: 'bar-chart',
        };
        return {
          headerShown: false,
          tabBarIcon: ({ focused, color, size }) => (
            <Ionicons name={icons[route.name] || 'help'} size={size} color={color} />
          ),
          tabBarLabel: ({ focused }) => {
            const labels: Record<string, string> = {
              'refund-management': 'Refunds',
              reports: 'Reports',
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
      <Tabs.Screen name="refund-management" />
      <Tabs.Screen name="reports" />
    </Tabs>
  );
}