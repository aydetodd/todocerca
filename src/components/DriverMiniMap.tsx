import { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { supabase } from '@/integrations/supabase/client';
import { useRouteOverlay, routeNameToId } from '@/hooks/useRouteOverlay';
import { Button } from '@/components/ui/button';
import { Maximize2, Minimize2 } from 'lucide-react';

// Fix Leaflet icon issue
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

interface DriverMiniMapProps {
  routeProductId?: string | null;
  origenLat?: number | null;
  origenLng?: number | null;
  destinoLat?: number | null;
  destinoLng?: number | null;
}

function abMarkerIcon(letter: 'A' | 'B') {
  const color = letter === 'A' ? '#16A34A' : '#DC2626';
  return L.divIcon({
    className: '',
    html: `
      <div style="filter: drop-shadow(0 3px 4px rgba(0,0,0,0.35));">
        <svg width="34" height="44" viewBox="0 0 34 44" xmlns="http://www.w3.org/2000/svg">
          <path d="M17 2 C8 2 2 8 2 17 C2 28 17 42 17 42 C17 42 32 28 32 17 C32 8 26 2 17 2 Z"
                fill="${color}" stroke="#ffffff" stroke-width="2"/>
          <text x="17" y="22" font-family="Arial, sans-serif" font-size="14" font-weight="bold"
                fill="#ffffff" text-anchor="middle">${letter}</text>
        </svg>
      </div>`,
    iconSize: [34, 44],
    iconAnchor: [17, 42],
  });
}

export function DriverMiniMap({ routeProductId, origenLat, origenLng, destinoLat, destinoLng }: DriverMiniMapProps) {
  const mapRef = useRef<L.Map | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const posMarkerRef = useRef<L.Marker | null>(null);
  const initRef = useRef(false);
  const [routeName, setRouteName] = useState<string | null>(null);
  const [inlineGeoJSON, setInlineGeoJSON] = useState<any | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);

  // Load route info (name + uploaded geojson trace)
  useEffect(() => {
    if (!routeProductId) {
      setRouteName(null);
      setInlineGeoJSON(null);
      return;
    }
    supabase
      .from('productos')
      .select('nombre, route_geojson')
      .eq('id', routeProductId)
      .single()
      .then(({ data }) => {
        if (data) {
          setRouteName(data.nombre);
          setInlineGeoJSON((data as any).route_geojson || null);
        }
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
    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        const latlng: L.LatLngExpression = [pos.coords.latitude, pos.coords.longitude];
        const busBodyColor = '#FDB813';
        const busStrokeColor = '#D4960A';
        const labelTruncated = 'PRIV';
        const textColor = '#FFFFFF';
        const busHtml = `
          <div style="filter: drop-shadow(0 4px 6px rgba(0,0,0,0.3));">
            <svg width="32" height="52" viewBox="0 0 36 80" xmlns="http://www.w3.org/2000/svg">
              <ellipse cx="18" cy="76" rx="14" ry="3" fill="rgba(0,0,0,0.25)"/>
              <ellipse cx="7" cy="66" rx="4" ry="5" fill="#1a1a1a" stroke="#333" stroke-width="0.6"/>
              <ellipse cx="7" cy="66" rx="2" ry="3" fill="#4a4a4a"/>
              <ellipse cx="29" cy="66" rx="4" ry="5" fill="#1a1a1a" stroke="#333" stroke-width="0.6"/>
              <ellipse cx="29" cy="66" rx="2" ry="3" fill="#4a4a4a"/>
              <rect x="5" y="8" width="26" height="64" rx="4" fill="#1a1a1a" stroke="#333" stroke-width="1"/>
              <ellipse cx="7" cy="18" rx="4" ry="5" fill="#1a1a1a" stroke="#333" stroke-width="0.6"/>
              <ellipse cx="7" cy="18" rx="2" ry="3" fill="#4a4a4a"/>
              <ellipse cx="29" cy="18" rx="4" ry="5" fill="#1a1a1a" stroke="#333" stroke-width="0.6"/>
              <ellipse cx="29" cy="18" rx="2" ry="3" fill="#4a4a4a"/>
              <rect x="9" y="10" width="18" height="56" rx="2" fill="${busBodyColor}" stroke="${busStrokeColor}" stroke-width="0.5"/>
              <rect x="5" y="16" width="4" height="8" rx="1" fill="#87CEEB" stroke="#666" stroke-width="0.5"/>
              <rect x="5" y="26" width="4" height="8" rx="1" fill="#87CEEB" stroke="#666" stroke-width="0.5"/>
              <rect x="5" y="36" width="4" height="8" rx="1" fill="#87CEEB" stroke="#666" stroke-width="0.5"/>
              <rect x="5" y="46" width="4" height="8" rx="1" fill="#87CEEB" stroke="#666" stroke-width="0.5"/>
              <rect x="5" y="56" width="4" height="8" rx="1" fill="#87CEEB" stroke="#666" stroke-width="0.5"/>
              <rect x="27" y="16" width="4" height="8" rx="1" fill="#87CEEB" stroke="#666" stroke-width="0.5"/>
              <rect x="27" y="26" width="4" height="8" rx="1" fill="#87CEEB" stroke="#666" stroke-width="0.5"/>
              <rect x="27" y="36" width="4" height="8" rx="1" fill="#87CEEB" stroke="#666" stroke-width="0.5"/>
              <rect x="27" y="46" width="4" height="8" rx="1" fill="#87CEEB" stroke="#666" stroke-width="0.5"/>
              <rect x="27" y="56" width="4" height="8" rx="1" fill="#87CEEB" stroke="#666" stroke-width="0.5"/>
              <path d="M 9 10 L 9 14 L 27 14 L 27 10 Q 18 8 9 10 Z" fill="#87CEEB" opacity="0.9" stroke="#666" stroke-width="0.5"/>
              <rect x="11" y="66" width="14" height="4" rx="1" fill="#87CEEB" opacity="0.7" stroke="#666" stroke-width="0.5"/>
              <circle cx="11" cy="9" r="1.5" fill="#FFFF99" stroke="#666" stroke-width="0.4"/>
              <circle cx="25" cy="9" r="1.5" fill="#FFFF99" stroke="#666" stroke-width="0.4"/>
              <rect x="10" y="70" width="3" height="2" rx="0.5" fill="#FF4444" stroke="#333" stroke-width="0.3"/>
              <rect x="23" y="70" width="3" height="2" rx="0.5" fill="#FF4444" stroke="#333" stroke-width="0.3"/>
              <text x="18" y="42" font-family="Arial" font-size="7" font-weight="bold" fill="${textColor}" text-anchor="middle">${labelTruncated}</text>
            </svg>
          </div>`;
        if (posMarkerRef.current) {
          posMarkerRef.current.setLatLng(latlng);
        } else {
          posMarkerRef.current = L.marker(latlng, {
            icon: L.divIcon({
              className: '',
              html: busHtml,
              iconSize: [32, 52],
              iconAnchor: [16, 26],
            }),
          }).addTo(map);
        }
      },
      () => {},
      { enableHighAccuracy: true, maximumAge: 5000 }
    );

    return () => {
      navigator.geolocation.clearWatch(watchId);
      map.remove();
      mapRef.current = null;
      posMarkerRef.current = null;
      initRef.current = false;
    };
  }, []);

  // Recalcular tamaño cuando cambia fullscreen
  useEffect(() => {
    if (mapRef.current) {
      setTimeout(() => mapRef.current?.invalidateSize(), 250);
    }
  }, [isFullscreen]);

  // Renderizar trazado de la ruta (uploaded o catálogo conocido)
  const knownRouteId = routeNameToId(routeName);
  useRouteOverlay(mapRef, inlineGeoJSON ? null : knownRouteId, inlineGeoJSON);

  return (
    <div
      className={
        isFullscreen
          ? 'fixed inset-0 z-[9999] bg-background'
          : 'relative w-full h-full'
      }
    >
      <div ref={containerRef} className="w-full h-full" />
      {routeName && (
        <div className="absolute top-2 left-2 z-[1000] bg-card/90 backdrop-blur-sm rounded-lg px-3 py-1.5 shadow-md max-w-[70%]">
          <span className="text-xs font-semibold text-foreground truncate block">🚌 {routeName}</span>
        </div>
      )}
      <Button
        size="icon"
        variant="secondary"
        className="absolute top-2 right-2 z-[1000] h-9 w-9 shadow-md bg-card/95 backdrop-blur-sm"
        onClick={() => setIsFullscreen((v) => !v)}
        aria-label={isFullscreen ? 'Salir de pantalla completa' : 'Pantalla completa'}
      >
        {isFullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
      </Button>
    </div>
  );
}
