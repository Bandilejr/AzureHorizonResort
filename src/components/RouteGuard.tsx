// src/components/RouteGuard.tsx — Phase 1 route guards: auth + role-area enforcement.

import React, { useEffect } from 'react';
import { View, ActivityIndicator, useColorScheme } from 'react-native';
import { Redirect } from 'expo-router';
import { useAuth } from '@/context/AuthContext';
import { roleAreaFor, type RoleArea } from '@/utils/role-home';
import { getTheme } from '@/constants/theme';

interface Props {
  allow: RoleArea | RoleArea[];
  children: React.ReactNode;
}

export default function RouteGuard({ allow, children }: Props) {
  const { profile, loading, user } = useAuth();
  const colorScheme = useColorScheme();
  const theme = getTheme(colorScheme as any);

  if (loading || (!user && !profile && loading)) {
    return (
      <View style={{ flex: 1, backgroundColor: theme.colors.background, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" color={theme.colors.primary} />
      </View>
    );
  }

  if (!user || !profile) {
    return <Redirect href="/login" />;
  }

  const area = roleAreaFor(profile);
  const allowed = Array.isArray(allow) ? allow : [allow];
  if (!allowed.includes(area)) {
    const homeMap: Record<RoleArea, string> = {
      admin: '/(admin)/dashboard',
      kitchen: '/(kitchen)/dashboard',
      npo: '/(npo)/dashboard',
      staff: '/(staff)/staff-dashboard',
      courier: '/(courier)/dashboard',
      guest: '/(guest)/guest-portal',
    };
    return <Redirect href={homeMap[area] as any} />;
  }

  return <>{children}</>;
}
