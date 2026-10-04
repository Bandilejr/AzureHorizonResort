// src/components/WorksiteMap.tsx — Phase 1 §17 geofence map.
//
// PRESENTATION ONLY. The worksite, the real GPS fix and the GeofenceResult all
// arrive as props from the attendance flow and are drawn verbatim — this file
// never decides whether a punch is valid and never invents a position.
//
// Background = real OpenStreetMap raster tiles (keyless, free, no API key),
// loaded through expo-image with a disk cache so tiles already seen keep
// rendering while the device is offline. Pan / pinch / zoom / recenter only
// move the viewport: the geofence circle, the pins, the distance and the
// bearing are all recomputed from the same coordinates attendance already uses.
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, StyleSheet, PanResponder, type LayoutChangeEvent } from 'react-native';
import { Image } from 'expo-image';
import NetInfo from '@react-native-community/netinfo';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme } from '@/design/use-app-theme';
import { IconButton } from '@/components/ui/icon-button';
import { AppText } from '@/components/ui/text';
import { formatDistance } from '@/services/attendance';
import type { GeofenceFix, GeofenceResult } from '@/types/workforce';

export type WorksiteMapState =
  | 'INSIDE'
  | 'OUTSIDE'
  | 'GPS_INACCURATE'
  | 'LOCATION_UNAVAILABLE'
  | 'LOCATION_STALE';

type MapStatus = 'READY' | 'LOCATING' | 'UNAVAILABLE' | 'OFFLINE';

type Viewport = { lat: number; lng: number; z: number };

type Tile = { key: string; uri: string; left: number; top: number };

const TILE = 256;
// `a.` subdomain: same OpenStreetMap tiles, but a distinct cache key so tiles
// cached before the correct User-Agent was set (OSM answered with their
// "usage blocked" graphic) are never reused.
const TILE_URL = 'https://a.tile.openstreetmap.org/{z}/{x}/{y}.png';
// OSM's tile policy blocks anonymous/known-library clients. Every tile request
// therefore identifies the app, which they accept.
const TILE_HEADERS = { 'User-Agent': 'AzureHorizonResort/1.0 (support@azurehorizon.app)' };
const MIN_ZOOM = 11;
const MAX_ZOOM = 19;
const DEFAULT_ZOOM = 15;
const MAP_HEIGHT = 220;
const MAX_TILES = 48;
const COMPASS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const clampLat = (v: number) => clamp(v, -85.0511, 85.0511);
/** Wrap longitude into [-180, 180) so panning east/west never runs off the world. */
const wrapLng = (v: number) => ((((v + 180) % 360) + 360) % 360) - 180;

function lngToPixelX(lng: number, z: number): number {
  return ((lng + 180) / 360) * TILE * 2 ** z;
}

function latToPixelY(lat: number, z: number): number {
  const s = Math.sin((clampLat(lat) * Math.PI) / 180);
  return (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * TILE * 2 ** z;
}

function pixelXToLng(x: number, z: number): number {
  return (x / (TILE * 2 ** z)) * 360 - 180;
}

function pixelYToLat(y: number, z: number): number {
  const n = Math.PI - (2 * Math.PI * y) / (TILE * 2 ** z);
  return (180 / Math.PI) * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n)));
}

/** Ground metres covered by one screen pixel at a given latitude / integer zoom. */
function metersPerPixel(lat: number, z: number): number {
  return (156543.03392 * Math.cos((clampLat(lat) * Math.PI) / 180)) / 2 ** z;
}

/** Initial bearing, degrees 0..360 — same formula the schematic used. */
function bearingDeg(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const r = (d: number) => (d * Math.PI) / 180;
  const y = Math.sin(r(lng2 - lng1)) * Math.cos(r(lat2));
  const x =
    Math.cos(r(lat1)) * Math.sin(r(lat2)) -
    Math.sin(r(lat1)) * Math.cos(r(lat2)) * Math.sin(r(lng2 - lng1));
  return (Math.atan2(y, x) * 180) / Math.PI;
}

function compassLabel(bearingDegValue: number): string {
  const norm = (((bearingDegValue % 360) + 360) % 360);
  return COMPASS[Math.round(norm / 45) % 8];
}

/** "DUT ML Sultan Campus" -> "ML Sultan" (short pin label, presentation only). */
export function shortCampusName(name: string): string {
  return name.replace(/^DUT[:\s]+/i, '').replace(/\s+Campus$/i, '');
}

export function WorksiteMap({
  worksites,
  activeWorksiteId = null,
  fix,
  result,
  fixAgeMs,
  locating = false,
}: {
  worksites: { id?: string; name: string; lat: number; lng: number; radiusM: number }[];
  activeWorksiteId?: string | null;
  fix: GeofenceFix | null;
  result: GeofenceResult | null;
  fixAgeMs?: number;
  locating?: boolean;
}) {
  const theme = useAppTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);

  const [size, setSize] = useState({ w: 0, h: MAP_HEIGHT });
  const [view, setView] = useState<Viewport>({
    lat: worksites[0]?.lat ?? -29.8510602,
    lng: worksites[0]?.lng ?? 31.0078848,
    z: DEFAULT_ZOOM,
  });
  const [isOnline, setIsOnline] = useState(true);
  const [tilesFailed, setTilesFailed] = useState(false);

  // The gesture responder is created once, so it reads/writes the viewport
  // through a ref that is kept in sync with state.
  const viewRef = useRef(view);
  const dirtyRef = useRef(false);
  const tileLoadedRef = useRef(false);
  const lastPointRef = useRef<{ x: number; y: number } | null>(null);
  const pinchStartRef = useRef<number | null>(null);
  const pinchBaseRef = useRef<number | null>(null);

  const commitView = useCallback((next: Viewport) => {
    const cur = viewRef.current;
    if (cur.z === next.z && cur.lat === next.lat && cur.lng === next.lng) return;
    viewRef.current = next;
    setView(next);
  }, []);

  useEffect(() => NetInfo.addEventListener((s) => setIsOnline(s.isConnected !== false)), []);

  // Auto-fit: frame every campus perimeter AND the live fix in one view, then
  // pick the zoom that contains them all. Stops once the user takes control.
  const fitViewport = useCallback((): Viewport => {
    const pts = worksites.map((w) => ({ lat: w.lat, lng: w.lng, r: w.radiusM }));
    if (fix) pts.push({ lat: fix.lat, lng: fix.lng, r: Math.max(fix.accuracyM ?? 0, 0) });
    if (pts.length === 0) return { lat: -29.8510602, lng: 31.0078848, z: DEFAULT_ZOOM };

    const lats = pts.map((p) => p.lat);
    const lngs = pts.map((p) => p.lng);
    const latC = (Math.min(...lats) + Math.max(...lats)) / 2;
    const lngC = (Math.min(...lngs) + Math.max(...lngs)) / 2;

    // Worst-case ground distance from the centre to any perimeter edge.
    const cos = Math.cos((latC * Math.PI) / 180);
    let extentM = 40;
    for (const p of pts) {
      const dx = ((p.lng - lngC) * Math.PI) / 180 * 6371000 * cos;
      const dy = ((p.lat - latC) * Math.PI) / 180 * 6371000;
      extentM = Math.max(extentM, Math.hypot(dx, dy) + p.r);
    }
    const worldM = extentM * 1.2;
    const half = Math.max(70, Math.min(size.w || 320, size.h) / 2);
    const raw = Math.log2((156543.03392 * Math.cos((latC * Math.PI) / 180)) / (worldM / half));
    return { lat: latC, lng: lngC, z: clamp(Math.round(raw), MIN_ZOOM, MAX_ZOOM) };
  }, [worksites, fix, size.w, size.h]);

  useEffect(() => {
    if (!size.w || dirtyRef.current) return;
    commitView(fitViewport());
  }, [size.w, fitViewport, commitView]);

  // Created once and reused: the handlers only ever touch the refs above, so a
  // stale responder instance is safe (same pattern as detail-kit.tsx).
  const pan = useRef(
    PanResponder.create({
        // Let the parent ScrollView keep vertical scrolling; we claim the
        // gesture on a clear horizontal drag or as soon as a second finger lands.
        onStartShouldSetPanResponder: () => false,
        onMoveShouldSetPanResponder: (e, g) => {
          const touches = e.nativeEvent.touches;
          if (touches && touches.length >= 2) return true;
          return Math.abs(g.dx) > 4 && Math.abs(g.dx) > Math.abs(g.dy);
        },
        onPanResponderTerminationRequest: () => true,
        onPanResponderGrant: () => {
          pinchStartRef.current = null;
          pinchBaseRef.current = null;
          lastPointRef.current = null;
        },
        onPanResponderMove: (e) => {
          const touches = e.nativeEvent.touches;
          if (touches && touches.length >= 2) {
            const a = touches[0];
            const b = touches[1];
            const d = Math.hypot(a.pageX - b.pageX, a.pageY - b.pageY);
            if (d <= 0) return;
            if (pinchStartRef.current == null) {
              pinchStartRef.current = d;
              pinchBaseRef.current = viewRef.current.z;
              return;
            }
            dirtyRef.current = true;
            const z = clamp(
              Math.round((pinchBaseRef.current ?? viewRef.current.z) + Math.log2(d / pinchStartRef.current)),
              MIN_ZOOM,
              MAX_ZOOM,
            );
            commitView({ ...viewRef.current, z });
            return;
          }
          const point = { x: e.nativeEvent.pageX, y: e.nativeEvent.pageY };
          if (!lastPointRef.current) {
            lastPointRef.current = point;
            return;
          }
          const dx = point.x - lastPointRef.current.x;
          const dy = point.y - lastPointRef.current.y;
          lastPointRef.current = point;
          if (dx === 0 && dy === 0) return;
          dirtyRef.current = true;
          const cur = viewRef.current;
          commitView({
            lat: clampLat(pixelYToLat(latToPixelY(cur.lat, cur.z) - dy, cur.z)),
            lng: wrapLng(pixelXToLng(lngToPixelX(cur.lng, cur.z) - dx, cur.z)),
            z: cur.z,
          });
        },
        onPanResponderRelease: () => {
          pinchStartRef.current = null;
          pinchBaseRef.current = null;
          lastPointRef.current = null;
        },
        onPanResponderTerminate: () => {
          pinchStartRef.current = null;
          pinchBaseRef.current = null;
          lastPointRef.current = null;
        },
    })
  ).current;

  const onLayout = useCallback((e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    setSize((prev) =>
      Math.abs(prev.w - width) < 0.5 && Math.abs(prev.h - height) < 0.5
        ? prev
        : { w: width, h: height || MAP_HEIGHT },
    );
  }, []);

  const zoomBy = useCallback(
    (delta: number) => {
      dirtyRef.current = true;
      commitView({ ...viewRef.current, z: clamp(viewRef.current.z + delta, MIN_ZOOM, MAX_ZOOM) });
    },
    [commitView],
  );

  const recenterWorksite = useCallback(() => {
    dirtyRef.current = false;
    commitView(fitViewport());
  }, [commitView, fitViewport]);

  const recenterUser = useCallback(() => {
    if (!fix) return;
    dirtyRef.current = true;
    commitView({ lat: fix.lat, lng: fix.lng, z: viewRef.current.z });
  }, [commitView, fix]);

  // ── viewport-derived geometry ────────────────────────────────────────────
  const viewZ = view.z;
  const worldTiles = 2 ** viewZ;
  const originX = lngToPixelX(view.lng, viewZ) - size.w / 2;
  const originY = latToPixelY(view.lat, viewZ) - size.h / 2;
  const mpp = metersPerPixel(view.lat, viewZ);

  const tiles: Tile[] = useMemo(() => {
    if (!size.w || !size.h) return [];
    const out: Tile[] = [];
    const x0 = Math.floor(originX / TILE);
    const x1 = Math.floor((originX + size.w) / TILE);
    const y0 = Math.floor(originY / TILE);
    const y1 = Math.floor((originY + size.h) / TILE);
    for (let tx = x0; tx <= x1 && out.length < MAX_TILES; tx++) {
      for (let ty = y0; ty <= y1 && out.length < MAX_TILES; ty++) {
        if (ty < 0 || ty >= worldTiles) continue;
        const wrapped = ((tx % worldTiles) + worldTiles) % worldTiles;
        out.push({
          key: `${viewZ}/${wrapped}/${ty}`,
          uri: TILE_URL.replace('{z}', String(viewZ)).replace('{x}', String(wrapped)).replace('{y}', String(ty)),
          left: tx * TILE - originX,
          top: ty * TILE - originY,
        });
      }
    }
    return out;
  }, [originX, originY, size.w, size.h, viewZ, worldTiles]);

  const userPx = fix
    ? { x: lngToPixelX(fix.lng, viewZ) - originX, y: latToPixelY(fix.lat, viewZ) - originY }
    : null;
  const accuracyR = fix?.accuracyM ? clamp(fix.accuracyM / mpp, 4, 72) : 0;

  // The campus whose perimeter the fix sits in (or, without a fix, the one the
  // attendance flow reports on) gets the emphasis; the others stay visible.
  const activeWorksite = useMemo(() => {
    if (!worksites.length) return null;
    if (activeWorksiteId) return worksites.find((w) => w.id === activeWorksiteId) ?? null;
    if (!fix) return null;
    let best = worksites[0];
    let bestD = Infinity;
    for (const w of worksites) {
      const dx = ((w.lng - fix.lng) * Math.PI) / 180 * 6371000 * Math.cos((fix.lat * Math.PI) / 180);
      const dy = ((w.lat - fix.lat) * Math.PI) / 180 * 6371000;
      const d = Math.hypot(dx, dy);
      if (d < bestD) { bestD = d; best = w; }
    }
    return best;
  }, [worksites, activeWorksiteId, fix]);

  // `activeWorksiteId` is only ever passed when the fix is genuinely inside a
  // perimeter; without it we still point at the nearest campus for context.
  const insideCampus = result?.withinRadius === true;

  const overlays = worksites.map((w) => ({
    w,
    px: { x: lngToPixelX(w.lng, viewZ) - originX, y: latToPixelY(w.lat, viewZ) - originY },
    r: clamp(w.radiusM / mpp, 6, Math.max(size.w, size.h)),
    active: insideCampus && activeWorksite != null && w.id === activeWorksite.id,
    selected: activeWorksite != null && w.id === activeWorksite.id,
  }));

  const state: WorksiteMapState = useMemo(() => {
    if (!fix || !result) return 'LOCATION_UNAVAILABLE';
    if (result.ageOk === false) return 'LOCATION_STALE';
    if (result.accuracyOk === false) return 'GPS_INACCURATE';
    return result.withinRadius ? 'INSIDE' : 'OUTSIDE';
  }, [fix, result]);

  const stateMeta: Record<WorksiteMapState, { label: string; color: string }> = {
    INSIDE: { label: '✓ Inside workplace', color: theme.colors.success },
    OUTSIDE: { label: '✗ Outside workplace', color: theme.colors.error },
    GPS_INACCURATE: { label: '⚠ GPS accuracy insufficient', color: theme.colors.warning },
    LOCATION_STALE: { label: '⚠ Location outdated — try again', color: theme.colors.warning },
    LOCATION_UNAVAILABLE: { label: '⚠ Location unavailable', color: theme.colors.warning },
  };

  const mapStatus: { key: MapStatus; label: string; color: string; icon: React.ComponentProps<typeof Ionicons>['name'] } =
    !isOnline
      ? { key: 'OFFLINE', label: 'OFFLINE', color: theme.colors.warningStrong, icon: 'cloud-offline-outline' }
      : locating
        ? { key: 'LOCATING', label: 'LOCATING', color: theme.colors.infoStrong, icon: 'time-outline' }
        : fix
          ? { key: 'READY', label: 'LOCATION READY', color: theme.colors.successStrong, icon: 'checkmark-circle' }
          : {
              key: 'UNAVAILABLE',
              label: 'LOCATION UNAVAILABLE',
              color: theme.colors.warningStrong,
              icon: 'warning-outline',
            };

  const distanceM = result?.distanceM ?? 0;
  const accuracyM = fix?.accuracyM ?? null;
  const bearingToWorksite =
    fix && activeWorksite ? bearingDeg(fix.lat, fix.lng, activeWorksite.lat, activeWorksite.lng) : null;

  const stateInfo = stateMeta[state];

  return (
    <View style={styles.wrap}>
      <View
        style={styles.mapBox}
        onLayout={onLayout}
        accessible
        accessibilityRole="image"
        accessibilityLabel={
          `Map of the ${worksites.length} DUT campus perimeters: ` +
          worksites.map((w) => `${w.name} ${w.radiusM} metres`).join(', ') +
          (activeWorksite && result?.withinRadius
            ? `. ${activeWorksite.name} is highlighted — clock-in allowed.`
            : activeWorksite
              ? `. Nearest campus: ${activeWorksite.name}.`
              : '') +
          (fix ? ' Your GPS position is marked.' : '')
        }
      >
        {/* real OpenStreetMap tiles + overlay, all inside the gesture surface */}
        <View style={StyleSheet.absoluteFill} {...pan.panHandlers} pointerEvents="box-only">
          {tiles.map((t) => (
            <Image
              key={t.key}
              source={{ uri: t.uri, headers: TILE_HEADERS }}
              style={[styles.tile, { left: t.left, top: t.top }]}
              contentFit="fill"
              cachePolicy="memory-disk"
              transition={null}
              onLoad={() => {
                if (tileLoadedRef.current) return;
                tileLoadedRef.current = true;
                setTilesFailed(false);
              }}
              onError={() => {
                if (tileLoadedRef.current) return;
                setTilesFailed(true);
              }}
            />
          ))}

          {/* one perimeter circle per campus — the active campus is emphasised */}
          {overlays.map(({ w, px, r, active }) => (
            <View
              key={`fence-${w.id ?? w.name}`}
              pointerEvents="none"
              style={[
                styles.geofence,
                {
                  width: r * 2,
                  height: r * 2,
                  left: px.x - r,
                  top: px.y - r,
                  borderColor: active ? theme.colors.success : theme.colors.primary,
                  backgroundColor: active ? theme.colors.successSoft : theme.colors.primarySoft,
                },
              ]}
            />
          ))}

          {/* accuracy radius around the real fix */}
          {userPx && accuracyR > 0 ? (
            <View
              pointerEvents="none"
              style={[
                styles.accuracyCircle,
                {
                  width: accuracyR * 2,
                  height: accuracyR * 2,
                  left: userPx.x - accuracyR,
                  top: userPx.y - accuracyR,
                },
              ]}
            />
          ) : null}

          {/* one labelled pin per campus — never confusable with the GPS dot */}
          {overlays.map(({ w, px, selected }) => (
            <View
              key={`pin-${w.id ?? w.name}`}
              pointerEvents="none"
              style={[styles.pin, { left: px.x - 55, top: px.y - 13 }]}
            >
              <View style={[styles.pinHead, selected ? undefined : styles.pinHeadMuted]}>
                <Ionicons
                  name="business"
                  size={12}
                  color={selected ? theme.colors.textInverse : theme.colors.textSecondary}
                />
              </View>
              <View style={[styles.pinLabel, selected ? styles.pinLabelActive : undefined]}>
                <AppText
                  variant="micro"
                  color={selected ? theme.colors.textPrimary : theme.colors.textSecondary}
                  weight="700"
                  numberOfLines={1}
                >
                  {shortCampusName(w.name)}
                </AppText>
              </View>
            </View>
          ))}

          {/* the real GPS fix */}
          {userPx ? (
            <View
              pointerEvents="none"
              style={[styles.userDot, { left: userPx.x - 7, top: userPx.y - 7 }]}
            >
              <View style={styles.userDotCore} />
            </View>
          ) : null}
        </View>

        {/* map status */}
        <View style={styles.statusChip}>
          <Ionicons name={mapStatus.icon} size={theme.iconSize.xs} color={mapStatus.color} />
          <AppText variant="micro" color={mapStatus.color} weight="700">
            {mapStatus.label}
          </AppText>
        </View>

        {/* viewport controls */}
        <View style={styles.controls}>
          <View style={styles.controlRow}>
            <IconButton
              name="add"
              size="sm"
              accessibilityLabel="Zoom in"
              color={theme.colors.textSecondary}
              style={styles.controlBtn}
              onPress={() => zoomBy(1)}
            />
            <IconButton
              name="remove"
              size="sm"
              accessibilityLabel="Zoom out"
              color={theme.colors.textSecondary}
              style={styles.controlBtn}
              onPress={() => zoomBy(-1)}
            />
          </View>
          <View style={styles.controlRow}>
            <IconButton
              name="locate"
              size="sm"
              accessibilityLabel="Recenter on my GPS position"
              color={fix ? theme.colors.primary : theme.colors.textMuted}
              style={styles.controlBtn}
              onPress={fix ? recenterUser : undefined}
            />
            <IconButton
              name="business"
              size="sm"
              accessibilityLabel="Recenter on all campus perimeters"
              color={theme.colors.textSecondary}
              style={styles.controlBtn}
              onPress={recenterWorksite}
            />
          </View>
        </View>

        {/* required OpenStreetMap attribution */}
        <View style={styles.attribution}>
          <AppText variant="micro" tone="muted">
            © OpenStreetMap
          </AppText>
        </View>
      </View>

      <View style={styles.legendRow}>
        <View style={[styles.legendDot, { backgroundColor: theme.colors.info }]} />
        <AppText variant="micro" tone="secondary">
          You
        </AppText>
        <View style={[styles.legendDot, { backgroundColor: theme.colors.primary }]} />
        <AppText variant="micro" tone="secondary">
          Campus perimeter
        </AppText>
        {activeWorksite && insideCampus ? (
          <>
            <View style={[styles.legendDot, { backgroundColor: theme.colors.success }]} />
            <AppText variant="micro" tone="secondary" numberOfLines={1}>
              {`${shortCampusName(activeWorksite.name)} — clock-in allowed`}
            </AppText>
          </>
        ) : activeWorksite ? (
          <>
            <View style={[styles.legendDot, { backgroundColor: theme.colors.textMuted }]} />
            <AppText variant="micro" tone="secondary" numberOfLines={1}>
              {`Nearest: ${shortCampusName(activeWorksite.name)}`}
            </AppText>
          </>
        ) : null}
      </View>

      <View style={styles.readout}>
        <View style={styles.readoutCell}>
          <AppText variant="micro" tone="muted" weight="700">
            DISTANCE
          </AppText>
          <AppText variant="bodyStrong">{fix ? formatDistance(distanceM) : '—'}</AppText>
        </View>
        <View style={styles.readoutCell}>
          <AppText variant="micro" tone="muted" weight="700">
            ACCURACY
          </AppText>
          <AppText variant="bodyStrong">
            {accuracyM != null ? `±${Math.round(accuracyM)} m` : '—'}
          </AppText>
        </View>
        <View style={styles.readoutCell}>
          <AppText variant="micro" tone="muted" weight="700">
            NEAREST CAMPUS
          </AppText>
          <AppText variant="bodyStrong" numberOfLines={1}>
            {activeWorksite ? shortCampusName(activeWorksite.name) : worksites.length ? '—' : 'Not configured'}
          </AppText>
        </View>
        <View style={styles.readoutCell}>
          <AppText variant="micro" tone="muted" weight="700">
            DIRECTION
          </AppText>
          <AppText variant="bodyStrong">
            {bearingToWorksite != null
              ? `${Math.round((((bearingToWorksite % 360) + 360) % 360))}° ${compassLabel(bearingToWorksite)}`
              : '—'}
          </AppText>
        </View>
      </View>

      <View style={styles.metaRows}>
        <AppText variant="caption" tone="secondary">
          {fix
            ? `You · ${formatDistance(distanceM)} away${accuracyM != null ? ` · ±${Math.round(accuracyM)}m GPS` : ' · no accuracy reading'}${fixAgeMs != null ? ` · fix ${Math.round(fixAgeMs / 1000)}s old` : ''}`
            : 'You · no GPS fix (position not available)'}
        </AppText>
        <AppText variant="caption" tone="secondary">
          {activeWorksite
            ? `Geofence ${activeWorksite.radiusM}m at ${shortCampusName(activeWorksite.name)} · ${worksites.length} campuses · zoom ${viewZ}`
            : `${worksites.length} campus perimeters · zoom ${viewZ}`}
        </AppText>
        {tilesFailed && isOnline ? (
          <AppText variant="caption" tone="warning">
            Map imagery unavailable — the geofence overlay and your distance are still accurate.
          </AppText>
        ) : null}
        <AppText variant="caption" color={stateInfo.color} weight="600">
          {stateInfo.label}
        </AppText>
      </View>
    </View>
  );
}

const createStyles = (theme: any) =>
  StyleSheet.create({
    wrap: { alignItems: 'center', paddingVertical: theme.space.xs },
    mapBox: {
      width: '100%',
      maxWidth: theme.layout.contentMaxWidth,
      height: MAP_HEIGHT,
      backgroundColor: theme.colors.surfaceSunken,
      borderRadius: theme.radius.lg,
      overflow: 'hidden',
      borderWidth: 1,
      borderColor: theme.colors.border,
    },
    tile: { position: 'absolute', width: TILE, height: TILE },
    geofence: {
      position: 'absolute',
      borderRadius: theme.radius.pill,
      borderWidth: 2,
      borderStyle: 'dashed',
      backgroundColor: theme.colors.successSoft,
    },
    pin: {
      position: 'absolute',
      width: 110,
      alignItems: 'center',
    },
    pinHead: {
      width: 26,
      height: 26,
      borderRadius: 13,
      backgroundColor: theme.colors.primary,
      borderWidth: 2,
      borderColor: theme.colors.textInverse,
      alignItems: 'center',
      justifyContent: 'center',
    },
    pinLabel: {
      marginTop: 4,
      maxWidth: 110,
      paddingHorizontal: 6,
      paddingVertical: 1,
      borderRadius: theme.radius.pill,
      backgroundColor: theme.colors.surface,
      borderWidth: 1,
      borderColor: theme.colors.border,
    },
    // non-active campus markers stay visible but clearly secondary
    pinHeadMuted: {
      backgroundColor: theme.colors.surfaceVariant,
      borderColor: theme.colors.border,
    },
    pinLabelActive: {
      borderColor: theme.colors.primary,
    },
    accuracyCircle: {
      position: 'absolute',
      borderRadius: theme.radius.pill,
      backgroundColor: theme.colors.infoSoft,
      borderWidth: 1,
      borderColor: theme.colors.info,
    },
    userDot: {
      position: 'absolute',
      width: 14,
      height: 14,
      borderRadius: 7,
      backgroundColor: theme.colors.info,
      borderWidth: 2,
      borderColor: theme.colors.textInverse,
      alignItems: 'center',
      justifyContent: 'center',
    },
    userDotCore: {
      width: 4,
      height: 4,
      borderRadius: 2,
      backgroundColor: theme.colors.textInverse,
    },
    statusChip: {
      position: 'absolute',
      top: theme.space.sm,
      left: theme.space.sm,
      flexDirection: 'row',
      alignItems: 'center',
      gap: theme.space.xs,
      paddingHorizontal: theme.space.sm,
      paddingVertical: theme.space.xs,
      borderRadius: theme.radius.pill,
      backgroundColor: theme.colors.surface,
      borderWidth: 1,
      borderColor: theme.colors.border,
      opacity: 0.96,
    },
    controls: {
      position: 'absolute',
      top: theme.space.sm,
      right: theme.space.sm,
      gap: theme.space.xs,
      opacity: 0.96,
    },
    controlRow: { flexDirection: 'row', gap: theme.space.xs },
    controlBtn: {
      backgroundColor: theme.colors.surface,
      borderWidth: 1,
      borderColor: theme.colors.border,
      width: theme.layout.minTouchTarget,
      height: theme.layout.minTouchTarget,
    },
    attribution: {
      position: 'absolute',
      left: theme.space.sm,
      bottom: theme.space.sm,
      paddingHorizontal: theme.space.sm,
      paddingVertical: 2,
      borderRadius: theme.radius.pill,
      backgroundColor: theme.colors.surface,
      borderWidth: 1,
      borderColor: theme.colors.border,
      opacity: 0.92,
    },
    legendRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: theme.space.xs,
      marginTop: theme.space.sm,
      maxWidth: theme.layout.contentMaxWidth,
      flexWrap: 'wrap',
      justifyContent: 'center',
    },
    legendDot: { width: 8, height: 8, borderRadius: 4, marginLeft: theme.space.xs },
    readout: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      width: '100%',
      maxWidth: theme.layout.contentMaxWidth,
      marginTop: theme.space.sm,
      borderRadius: theme.radius.md,
      borderWidth: 1,
      borderColor: theme.colors.border,
      backgroundColor: theme.colors.surface,
      overflow: 'hidden',
    },
    readoutCell: {
      width: '50%',
      paddingHorizontal: theme.space.md,
      paddingVertical: theme.space.sm,
      borderRightWidth: StyleSheet.hairlineWidth,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderColor: theme.colors.border,
      gap: 2,
    },
    metaRows: {
      alignItems: 'center',
      gap: 2,
      marginTop: theme.space.sm,
      maxWidth: theme.layout.contentMaxWidth,
      width: '100%',
    },
  });
