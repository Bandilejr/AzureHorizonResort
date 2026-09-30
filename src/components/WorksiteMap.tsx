// src/components/WorksiteMap.tsx — Phase 1 §17 schematic geofence map.
// NO map SDK dependency: plots the REAL GPS fix relative to the worksite
// (bearing + distance, scaled to the view). Never fabricates the user
// position or claims accuracy the device did not report. Upgrade path for a
// full live map: react-native-maps + Android Maps API key (native build).
import React, { useMemo } from 'react';
import { View, Text, StyleSheet, useColorScheme } from 'react-native';
import { getTheme } from '@/constants/theme';
import type { GeofenceResult, GeofenceFix } from '@/types/workforce';

export type WorksiteMapState =
  | 'INSIDE'
  | 'OUTSIDE'
  | 'GPS_INACCURATE'
  | 'LOCATION_UNAVAILABLE'
  | 'LOCATION_STALE';

function toRadians(deg: number): number {
  return (deg * Math.PI) / 180;
}

/** Initial bearing from (lat1,lng1) to (lat2,lng2) in degrees 0..360. */
function bearingDeg(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const y = Math.sin(toRadians(lng2 - lng1)) * Math.cos(toRadians(lat2));
  const x =
    Math.cos(toRadians(lat1)) * Math.sin(toRadians(lat2)) -
    Math.sin(toRadians(lat1)) * Math.cos(toRadians(lat2)) * Math.sin(toRadians(lng2 - lng1));
  return (Math.atan2(y, x) * 180) / Math.PI;
}

export function WorksiteMap({
  worksite,
  fix,
  result,
  fixAgeMs,
}: {
  worksite: { name: string; lat: number; lng: number; radiusM: number };
  fix: GeofenceFix | null;
  result: GeofenceResult | null;
  fixAgeMs?: number;
}) {
  const colorScheme = useColorScheme();
  const theme = getTheme(colorScheme as any);
  const styles = createStyles(theme);

  const state: WorksiteMapState = useMemo(() => {
    if (!fix || !result) return 'LOCATION_UNAVAILABLE';
    if (result.ageOk === false) return 'LOCATION_STALE';
    if (result.accuracyOk === false) return 'GPS_INACCURATE';
    return result.withinRadius ? 'INSIDE' : 'OUTSIDE';
  }, [fix, result]);

  const stateMeta: Record<WorksiteMapState, { label: string; color: string }> = {
    INSIDE: { label: '✓ Inside workplace', color: '#16a34a' },
    OUTSIDE: { label: '✗ Outside workplace', color: '#dc2626' },
    GPS_INACCURATE: { label: '⚠ GPS accuracy insufficient', color: '#d97706' },
    LOCATION_STALE: { label: '⚠ Location outdated — try again', color: '#d97706' },
    LOCATION_UNAVAILABLE: { label: '⚠ Location unavailable', color: '#d97706' },
  };

  // Scale the schematic: the larger of (geofence radius, user distance +
  // accuracy) plus 20% headroom maps to the view half-size. Distance 0 → the
  // user dot sits at the workplace pin.
  const viewHalf = 110; // px half-size of the schematic area
  const distance = result?.distanceM ?? 0;
  const accuracy = fix?.accuracyM ?? 0;
  const worldM = Math.max(worksite.radiusM, distance + accuracy) * 1.2 || 1;
  const scale = viewHalf / worldM;

  const brg = fix ? bearingDeg(fix.lat, fix.lng, worksite.lat, worksite.lng) : 0;
  // User dot offset from CENTER along the worksite→user bearing.
  const userDist = Math.min(distance * scale, viewHalf - 10);
  const rad = toRadians(brg);
  const userDot = {
    left: viewHalf - Math.sin(rad) * userDist - 7,
    top: viewHalf - Math.cos(rad) * userDist - 7,
  };
  const geofenceR = Math.min(worksite.radiusM * scale, viewHalf - 6);
  const accuracyR = Math.min(accuracy * scale, 40);

  const stateInfo = stateMeta[state];

  return (
    <View style={styles.wrap}>
      <View style={styles.mapBox}>
        {/* geofence boundary */}
        <View
          style={[
            styles.geofence,
            { width: geofenceR * 2, height: geofenceR * 2, left: viewHalf - geofenceR, top: viewHalf - geofenceR, borderColor: state === 'INSIDE' ? '#16a34a' : theme.colors.border },
          ]}
        />
        {/* workplace pin */}
        <View style={[styles.pin, { left: viewHalf - 8, top: viewHalf - 8 }]}>
          <View style={styles.pinDot} />
        </View>
        {/* user position + accuracy circle (only when a real fix exists) */}
        {fix && (
          <>
            <View
              style={[
                styles.accuracyCircle,
                { width: accuracyR * 2, height: accuracyR * 2, left: userDot.left + 7 - accuracyR, top: userDot.top + 7 - accuracyR },
              ]}
            />
            <View style={[styles.userDot, { left: userDot.left, top: userDot.top }]} />
          </>
        )}
      </View>
      <View style={styles.legendRow}>
        <View style={[styles.legendDot, { backgroundColor: theme.colors.primary }]} />
        <Text style={styles.legendText}>Workplace ({worksite.name}) · fence {worksite.radiusM}m</Text>
      </View>
      <View style={styles.legendRow}>
        <View style={[styles.legendDot, { backgroundColor: '#0ea5e9' }]} />
        <Text style={styles.legendText}>
          {fix
            ? `You · ${Math.round(distance)}m away${accuracy ? ` · ±${Math.round(accuracy)}m GPS` : ' · no accuracy reading'}${fixAgeMs != null ? ` · fix ${Math.round(fixAgeMs / 1000)}s old` : ''}`
            : 'You · no GPS fix (position not available)'}
        </Text>
      </View>
      <Text style={[styles.stateText, { color: stateInfo.color }]}>{stateInfo.label}</Text>
    </View>
  );
}

const createStyles = (theme: any) =>
  StyleSheet.create({
    wrap: { alignItems: 'center', paddingVertical: 8 },
    mapBox: { width: 224, height: 224, backgroundColor: theme.colors.surfaceVariant || theme.colors.surface, borderRadius: 16, overflow: 'hidden' },
    geofence: { position: 'absolute', borderRadius: 999, borderWidth: 2, borderStyle: 'dashed', backgroundColor: 'rgba(22,163,74,0.06)' },
    pin: { position: 'absolute' },
    pinDot: { width: 16, height: 16, borderRadius: 8, backgroundColor: theme.colors.primary, borderWidth: 2, borderColor: '#fff' },
    accuracyCircle: { position: 'absolute', borderRadius: 999, backgroundColor: 'rgba(14,165,233,0.18)', borderWidth: 1, borderColor: 'rgba(14,165,233,0.4)' },
    userDot: { position: 'absolute', width: 14, height: 14, borderRadius: 7, backgroundColor: '#0ea5e9', borderWidth: 2, borderColor: '#fff' },
    legendRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 6 },
    legendDot: { width: 8, height: 8, borderRadius: 4 },
    legendText: { fontSize: 11, color: theme.colors.textMuted },
    stateText: { fontSize: 13, fontWeight: '700', marginTop: 6 },
  });