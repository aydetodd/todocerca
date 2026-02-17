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
};

/**
 * Draws a route polyline + stop markers on a Leaflet map.
 * Pass routeId = null to clear.
 */
export function useRouteOverlay(
  mapRef: React.MutableRefObject<L.Map | null>,
  routeId: string | null
) {
  const polylineRef = useRef<L.Polyline | null>(null);
  const stopsLayerRef = useRef<L.LayerGroup | null>(null);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    // Clean previous overlay
    if (polylineRef.current) {
      polylineRef.current.remove();
      polylineRef.current = null;
    }
    if (stopsLayerRef.current) {
      stopsLayerRef.current.clearLayers();
      stopsLayerRef.current.remove();
      stopsLayerRef.current = null;
    }

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
        const stopFeatures = data.features.filter(f => f.geometry.type === 'Point');

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

        // Fit map to route bounds
        mapRef.current!.fitBounds(polyline.getBounds(), { padding: [40, 40] });

        // Draw stop markers
        const stopsLayer = L.layerGroup().addTo(mapRef.current!);
        stopsLayerRef.current = stopsLayer;

        stopFeatures.forEach(stop => {
          const [lng, lat] = stop.geometry.coordinates as number[];
          const isTerminal = stop.properties.tipo === 'inicio_final';
          const radius = isTerminal ? 7 : 4;
          const fillColor = isTerminal ? '#0066CC' : '#3b82f6';

          const circle = L.circleMarker([lat, lng], {
            radius,
            fillColor,
            color: '#fff',
            weight: 2,
            fillOpacity: 0.9,
          }).addTo(stopsLayer);

          circle.bindPopup(
            `<div style="background:#273547;color:#fafafa;padding:8px 12px;border-radius:8px;min-width:160px;">
              <p style="font-size:11px;color:#3b82f6;margin:0 0 2px 0;">Parada ${stop.properties.orden}</p>
              <p style="font-weight:600;font-size:13px;margin:0;">${stop.properties.nombre}</p>
              ${isTerminal ? '<p style="font-size:11px;color:#fbbf24;margin:4px 0 0 0;">📍 Terminal</p>' : ''}
            </div>`,
            { className: 'custom-popup-dark', closeButton: true }
          );
        });
      })
      .catch(err => {
        console.error('[useRouteOverlay] Error loading GeoJSON:', err);
      });

    return () => {
      cancelled = true;
    };
  }, [routeId, mapRef]);
}
