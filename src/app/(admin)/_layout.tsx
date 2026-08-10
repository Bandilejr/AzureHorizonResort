import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useColorScheme } from 'react-native';
import { getTheme } from '@/constants/theme';

export default function AdminLayout() {
  const colorScheme = useColorScheme();
  const theme = getTheme(colorScheme as any);
  return (
    <Tabs
      screenOptions={({ route }) => {
        const icons: Record<string, string> = {
          'refund-management': 'cash',
        };
        return {
          headerShown: false,
          tabBarIcon: ({ focused, color, size }) => (
            <Ionicons name={(icons[route.name] || 'help') as any} size={size} color={color} />
          ),
          tabBarLabel: ({ focused }) => {
            const labels: Record<string, string> = {
              'refund-management': 'Refunds',
            };
            return labels[route.name] || route.name;
          },
          tabBarActiveTintColor: theme.colors.primary,
          tabBarInactiveTintColor: theme.colors.textMuted,
          tabBarStyle: {
            backgroundColor: theme.colors.surface,
            borderTopWidth: 1,
            borderTopColor: theme.colors.border,
          },
          tabBarLabelStyle: { fontSize: 11, fontWeight: '600' },
        };
      }}
    >
      <Tabs.Screen name="refund-management" />
    </Tabs>
  );
}