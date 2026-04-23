import { useEffect, useRef } from 'react';
import L from 'leaflet';

interface RouteGeoJSON {
  type: string;
  features: Array<{
    type: string;
    properties: Record<string, any>;
    geometry: {
      type: string;
      coordinates: number[] | number[][];
    };
  }>;
}

// Map route IDs to GeoJSON file paths
const ROUTE_FILES: Record<string, string> = {
  'L1_MANGA': '/data/rutas/L1_MANGA.geojson',
  'L1_BLVD_200': '/data/rutas/L1_BLVD_200.geojson',
  'L17_BACHOCO': '/data/rutas/L17_BACHOCO.geojson',
};

/**
 * Given a route/product name like "Línea 1 - Manga", try to match it
 * to one of the known route IDs from the UNE catalog.
 */
const ROUTE_NAME_MAP: Record<string, string> = {
  'Línea 1 - Manga': 'L1_MANGA',
  'L1 Manga': 'L1_MANGA',
  'Línea 1 Manga': 'L1_MANGA',
  'Ruta 1 - La manga': 'L1_MANGA',
  'Ruta 1 - La Manga': 'L1_MANGA',
  'Línea 1 - Blvd-200': 'L1_BLVD_200',
  'Línea 1 Blvd-200': 'L1_BLVD_200',
  'Línea 1 - Blvd. - 200': 'L1_BLVD_200',
  'Línea 1 - Blvd. 200': 'L1_BLVD_200',
  'L1 Blvd-200': 'L1_BLVD_200',
  'Ruta 1 - Blvd-200': 'L1_BLVD_200',
  'Ruta 1 Blvd-200': 'L1_BLVD_200',
  'Línea 17 - Bachoco': 'L17_BACHOCO',
  'L17 Bachoco': 'L17_BACHOCO',
  'Línea 17 Bachoco': 'L17_BACHOCO',
  'Ruta 17 - Bachoco': 'L17_BACHOCO',
  'Ruta 17 Bachoco': 'L17_BACHOCO',
  // Add more as GeoJSON files are created
};

export function routeNameToId(name: string | null | undefined): string | null {
  if (!name) return null;
  // Direct match
  if (ROUTE_NAME_MAP[name]) return ROUTE_NAME_MAP[name];
  // Fuzzy: check if the name contains "manga" (case insensitive)
  const lower = name.toLowerCase();
  if (lower.includes('manga') && (lower.includes('1') || lower.includes('l1'))) return 'L1_MANGA';
  if ((lower.includes('blvd') || lower.includes('boulevard')) && lower.includes('200') && (lower.includes('1') || lower.includes('l1'))) return 'L1_BLVD_200';
  if (lower.includes('bachoco') && (lower.includes('17') || lower.includes('l17'))) return 'L17_BACHOCO';
  // Also try case-insensitive direct match
  const lowerMap = Object.entries(ROUTE_NAME_MAP).find(([key]) => key.toLowerCase() === lower);
  if (lowerMap) return lowerMap[1];
  return null;
}

/**
 * Draws a route polyline + stop markers on a Leaflet map.
 * Pass routeId = null to clear.
 */
export function useRouteOverlay(
  mapRef: React.MutableRefObject<L.Map | null>,
  routeId: string | null
) {
  const polylineRef = useRef<L.Polyline | null>(null);
  const currentRouteRef = useRef<string | null>(null);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    // If same route is already drawn, don't redraw
    if (routeId && routeId === currentRouteRef.current && polylineRef.current) {
      // Just ensure it's still on the map
      if (!map.hasLayer(polylineRef.current)) {
        polylineRef.current.addTo(map);
      }
      return;
    }

    // Clean previous overlay
    if (polylineRef.current) {
      polylineRef.current.remove();
      polylineRef.current = null;
    }
    currentRouteRef.current = null;

    if (!routeId) return;

    const filePath = ROUTE_FILES[routeId];
    if (!filePath) {
      console.warn(`[useRouteOverlay] No GeoJSON file for route: ${routeId}`);
      return;
    }

    let cancelled = false;

    fetch(filePath)
      .then(res => res.json())
      .then((data: RouteGeoJSON) => {
        if (cancelled || !mapRef.current) return;

        const lineFeature = data.features.find(f => f.geometry.type === 'LineString');

        if (!lineFeature) return;

        // Draw polyline
        const coords = (lineFeature.geometry.coordinates as number[][]).map(
          ([lng, lat]) => [lat, lng] as [number, number]
        );

        const polyline = L.polyline(coords, {
          color: '#0066CC',
          weight: 5,
          opacity: 0.85,
          dashArray: undefined,
        }).addTo(mapRef.current!);

        polylineRef.current = polyline;
        currentRouteRef.current = routeId;

        // Fit map to route bounds
        mapRef.current!.fitBounds(polyline.getBounds(), { padding: [40, 40] });

        console.log(`[useRouteOverlay] ✅ Route ${routeId} drawn without stop markers`);
      })
      .catch(err => {
        console.error('[useRouteOverlay] Error loading GeoJSON:', err);
      });

    return () => {
      cancelled = true;
    };
  }, [routeId, mapRef]);
}
