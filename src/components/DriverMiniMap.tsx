import { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { supabase } from '@/integrations/supabase/client';

// Fix Leaflet icon issue
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

interface DriverMiniMapProps {
  routeProductId?: string | null;
}

export function DriverMiniMap({ routeProductId }: DriverMiniMapProps) {
  const mapRef = useRef<L.Map | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const routeLayerRef = useRef<L.GeoJSON | null>(null);
  const posMarkerRef = useRef<L.Marker | null>(null);
  const initRef = useRef(false);
  const [routeName, setRouteName] = useState<string | null>(null);

  // Load route name
  useEffect(() => {
    if (!routeProductId) return;
    supabase
      .from('productos')
      .select('nombre')
      .eq('id', routeProductId)
      .single()
      .then(({ data }) => {
        if (data) setRouteName(data.nombre);
      });
  }, [routeProductId]);

  // Initialize map
  useEffect(() => {
    if (!containerRef.current || initRef.current) return;
    initRef.current = true;

    const map = L.map(containerRef.current, {
      center: [29.0729, -110.9559], // Hermosillo
      zoom: 12,
      zoomControl: false,
      attributionControl: false,
    });

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(map);
    mapRef.current = map;

    // Add current position
    navigator.geolocation.watchPosition(
      (pos) => {
        const latlng: L.LatLngExpression = [pos.coords.latitude, pos.coords.longitude];
        if (posMarkerRef.current) {
          posMarkerRef.current.setLatLng(latlng);
        } else {
          posMarkerRef.current = L.marker(latlng, {
            icon: L.divIcon({
              className: '',
              html: '<div style="width:16px;height:16px;background:#3b82f6;border:3px solid white;border-radius:50%;box-shadow:0 0 6px rgba(0,0,0,.4)"></div>',
              iconSize: [16, 16],
              iconAnchor: [8, 8],
            }),
          }).addTo(map);
        }
      },
      () => {},
      { enableHighAccuracy: true, maximumAge: 5000 }
    );

    return () => {
      map.remove();
      initRef.current = false;
    };
  }, []);

  // Load route GeoJSON overlay
  useEffect(() => {
    if (!mapRef.current || !routeName) return;

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

    const routeId = ROUTE_NAME_MAP[routeName];
    if (!routeId) return;

    const filePath = `/data/rutas/${routeId}.geojson`;
    fetch(filePath)
      .then((r) => r.json())
      .then((geojson) => {
        if (!mapRef.current) return;
        if (routeLayerRef.current) {
          mapRef.current.removeLayer(routeLayerRef.current);
        }

        const lineFeatures = {
          ...geojson,
          features: Array.isArray(geojson.features)
            ? geojson.features.filter((feature: any) => feature?.geometry?.type === 'LineString')
            : [],
        };

        routeLayerRef.current = L.geoJSON(lineFeatures, {
          style: { color: '#2563eb', weight: 4, opacity: 0.8 },
        }).addTo(mapRef.current);

        if (!routeLayerRef.current.getLayers().length) return;
        mapRef.current.fitBounds(routeLayerRef.current.getBounds(), { padding: [20, 20] });
      })
      .catch(() => {});
  }, [routeName]);

  return (
    <div className="relative w-full h-full">
      <div ref={containerRef} className="w-full h-full" />
      {routeName && (
        <div className="absolute top-2 left-2 z-[1000] bg-card/90 backdrop-blur-sm rounded-lg px-3 py-1.5 shadow-md">
          <span className="text-xs font-semibold text-foreground">🚌 {routeName}</span>
        </div>
      )}
    </div>
  );
}
