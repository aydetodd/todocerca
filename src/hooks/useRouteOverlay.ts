import { useEffect, useRef, useState } from 'react';
import L from 'leaflet';

interface RouteGeoJSON {
  type: string;
  features: Array<{
    type: string;
    properties: Record<string, any>;
    geometry: {
      type: string;
      coordinates: any;
    };
  }>;
}

const ROUTE_FILES: Record<string, string> = {
  'L1_MANGA': '/data/rutas/L1_MANGA.geojson',
  'L1_BLVD_200': '/data/rutas/L1_BLVD_200.geojson',
  'L17_BACHOCO': '/data/rutas/L17_BACHOCO.geojson',
};

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
};

export function routeNameToId(name: string | null | undefined): string | null {
  if (!name) return null;
  if (ROUTE_NAME_MAP[name]) return ROUTE_NAME_MAP[name];
  const lower = name.toLowerCase();
  if (lower.includes('manga') && (lower.includes('1') || lower.includes('l1'))) return 'L1_MANGA';
  if ((lower.includes('blvd') || lower.includes('boulevard')) && lower.includes('200') && (lower.includes('1') || lower.includes('l1'))) return 'L1_BLVD_200';
  if (lower.includes('bachoco') && (lower.includes('17') || lower.includes('l17'))) return 'L17_BACHOCO';
  const lowerMap = Object.entries(ROUTE_NAME_MAP).find(([key]) => key.toLowerCase() === lower);
  if (lowerMap) return lowerMap[1];
  return null;
}

/**
 * Draws a route polyline on a Leaflet map.
 * - `routeId`: known catalog routes loaded from /data/rutas/*.geojson
 * - `inlineGeoJSON`: concessionaire-uploaded trace (productos.route_geojson)
 * - both null/undefined to clear.
 */
export function useRouteOverlay(
  mapRef: React.MutableRefObject<L.Map | null>,
  routeId: string | null,
  inlineGeoJSON?: any | null
) {
  const polylineRef = useRef<L.LayerGroup | null>(null);
  const currentKeyRef = useRef<string | null>(null);
  const [mapReadyTick, setMapReadyTick] = useState(0);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) {
      if (!routeId && !inlineGeoJSON) return;
      const retry = window.setTimeout(() => setMapReadyTick((tick) => tick + 1), 150);
      return () => window.clearTimeout(retry);
    }

    const drawFromGeoJSON = (data: RouteGeoJSON, key: string) => {
      const lineFeatures = data.features.filter(
        (f) => f.geometry.type === 'LineString' || f.geometry.type === 'MultiLineString'
      );
      if (lineFeatures.length === 0) return;

      const group = L.layerGroup().addTo(map);
      const allLatLngs: L.LatLngExpression[] = [];

      lineFeatures.forEach((lineFeature) => {
        const segments = lineFeature.geometry.type === 'LineString'
          ? [lineFeature.geometry.coordinates as number[][]]
          : (lineFeature.geometry.coordinates as number[][][]);

        segments.forEach((segment) => {
          const coords = segment.map(([lng, lat]) => [lat, lng] as [number, number]);
          allLatLngs.push(...coords);
          L.polyline(coords, {
            color: '#0066CC',
            weight: 5,
            opacity: 0.9,
          }).addTo(group);
        });
      });

      // Render Point features (stops / Placemarks)
      const pointFeatures = data.features.filter((f) => f.geometry.type === 'Point');
      pointFeatures.forEach((pf) => {
        const [lng, lat] = pf.geometry.coordinates as number[];
        if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
        const name = (pf.properties?.name as string) || 'Parada';
        const icon = L.divIcon({
          className: 'route-stop-marker',
          html: `<div style="width:14px;height:14px;border-radius:50%;background:#0066CC;border:2px solid white;box-shadow:0 1px 3px rgba(0,0,0,0.4)"></div>`,
          iconSize: [14, 14],
          iconAnchor: [7, 7],
        });
        const marker = L.marker([lat, lng], { icon }).addTo(group);
        marker.bindPopup(`<strong>🚏 ${name}</strong>`);
        allLatLngs.push([lat, lng]);
      });

      polylineRef.current = group;
      currentKeyRef.current = key;
      if (allLatLngs.length > 0) {
        map.fitBounds(L.latLngBounds(allLatLngs), { padding: [40, 40] });
      }
    };

    const newKey = inlineGeoJSON
      ? `inline:${JSON.stringify(inlineGeoJSON).length}`
      : routeId;

    if (newKey && newKey === currentKeyRef.current && polylineRef.current) {
      if (!map.hasLayer(polylineRef.current)) polylineRef.current.addTo(map);
      return;
    }

    if (polylineRef.current) {
      polylineRef.current.remove();
      polylineRef.current = null;
    }
    currentKeyRef.current = null;

    if (inlineGeoJSON) {
      try {
        drawFromGeoJSON(inlineGeoJSON as RouteGeoJSON, newKey!);
      } catch (e) {
        console.error('[useRouteOverlay] Error drawing inline GeoJSON:', e);
      }
      return;
    }

    if (!routeId) return;
    const filePath = ROUTE_FILES[routeId];
    if (!filePath) return;

    let cancelled = false;
    fetch(filePath)
      .then((res) => res.json())
      .then((data: RouteGeoJSON) => {
        if (cancelled || !mapRef.current) return;
        drawFromGeoJSON(data, routeId);
      })
      .catch((err) => console.error('[useRouteOverlay] Error loading GeoJSON:', err));

    return () => {
      cancelled = true;
    };
  }, [routeId, inlineGeoJSON, mapRef, mapReadyTick]);
}
