// src/components/ui/tab-options.tsx — one bottom-tab configuration for every
// role layout. Removes six near-identical hand-rolled tab bars.
import React from 'react';
import { Ionicons } from '@expo/vector-icons';
import type { Theme } from '@/design/tokens';

export interface TabDef {
  title: string;
  icon: React.ComponentProps<typeof Ionicons>['name'];
}

/**
 * Returns the expo-router `screenOptions` resolver for a role's tab config.
 * Usage: `<Tabs screenOptions={makeTabScreenOptions(theme, config)}>`.
 */
export function makeTabScreenOptions(theme: Theme, config: Record<string, TabDef>) {
  return ({ route }: { route: { name: string } }): any => {
    const c = config[route.name];
    return {
      headerShown: false,
      tabBarIcon: ({ color, size }: { color: string; size: number }) => (
        <Ionicons name={(c?.icon ?? 'ellipse-outline') as any} size={size} color={color} />
      ),
      tabBarLabel: c?.title ?? route.name,
      tabBarActiveTintColor: theme.colors.primary,
      tabBarInactiveTintColor: theme.colors.textMuted,
      tabBarStyle: {
        backgroundColor: theme.colors.surface,
        borderTopWidth: 1,
        borderTopColor: theme.colors.border,
        height: theme.layout.tabBarHeight,
        paddingBottom: 8,
        paddingTop: 6,
      },
      tabBarLabelStyle: { fontSize: theme.fontSize.micro, fontWeight: '600' as const },
    };
  };
}
