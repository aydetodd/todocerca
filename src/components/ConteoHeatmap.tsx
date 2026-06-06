import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Loader2, MapPin, Maximize2, Minimize2 } from 'lucide-react';

interface Props {
  unidadId: string;
  unidadNombre?: string;
  /** Cuántos días hacia atrás incluir. Default 7. */
  days?: number;
}

interface Evento {
  lat: number;
  lng: number;
  evento: 'sube' | 'baja';
}

type ConteoEventoRow = { lat: number | null; lng: number | null; evento: string | null };

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

/**
 * Mapa con puntos verdes (subidas) y rojos (bajadas).
 * Muestra dónde la gente realmente aborda y desciende.
 */
export default function ConteoHeatmap({ unidadId, unidadNombre, days = 7 }: Props) {
  const mapRef = useRef<L.Map | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const layerRef = useRef<L.LayerGroup | null>(null);
  const [loading, setLoading] = useState(true);
  const [eventos, setEventos] = useState<Evento[]>([]);
  const [routeBounds, setRouteBounds] = useState<[number, number][] | null>(null);
  const [fullscreen, setFullscreen] = useState(false);

  // Cargar centro de ruta (origen/destino + geojson) de la unidad
  useEffect(() => {
    let cancel = false;
    (async () => {
      const { data: asig } = await supabase
        .from('asignaciones_chofer')
        .select('producto_id')
        .eq('unidad_id', unidadId)
        .order('fecha', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (cancel || !asig?.producto_id) return;
      const { data: prod } = await supabase
        .from('productos')
        .select('route_origin_lat, route_origin_lng, route_destination_lat, route_destination_lng, route_geojson')
        .eq('id', asig.producto_id)
        .maybeSingle();
      if (cancel || !prod) return;
      const pts: [number, number][] = [];
      if (typeof prod.route_origin_lat === 'number' && typeof prod.route_origin_lng === 'number')
        pts.push([prod.route_origin_lat, prod.route_origin_lng]);
      if (typeof prod.route_destination_lat === 'number' && typeof prod.route_destination_lng === 'number')
        pts.push([prod.route_destination_lat, prod.route_destination_lng]);
      try {
        const gj = prod.route_geojson as unknown;
        if (gj) {
          const coords: [number, number][] = [];
          const walk = (g: unknown) => {
            if (!g) return;
            if (Array.isArray(g) && g.length >= 2 && typeof g[0] === 'number' && typeof g[1] === 'number') {
              coords.push([g[1], g[0]]); return;
            }
            if (Array.isArray(g)) g.forEach(walk);
            else if (isObject(g) && 'coordinates' in g) walk(g.coordinates);
            else if (isObject(g) && 'geometry' in g) walk(g.geometry);
            else if (isObject(g) && Array.isArray(g.features)) g.features.forEach(walk);
          };
          walk(gj);
          if (coords.length) pts.push(...coords);
        }
      } catch (error) {
        console.warn('No se pudo leer el trazo de la ruta', error);
      }
      if (!cancel && pts.length) setRouteBounds(pts);
    })();
    return () => { cancel = true; };
  }, [unidadId]);

  // Cargar eventos con coordenadas
  useEffect(() => {
    let cancel = false;
    (async () => {
      setLoading(true);
      const desde = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
      const { data, error } = await supabase
        .from('conteo_pasajeros_eventos')
        .select('lat, lng, evento')
        .eq('unidad_id', unidadId)
        .gte('ocurrido_en', desde)
        .not('lat', 'is', null)
        .not('lng', 'is', null)
        .limit(2000);
      if (cancel) return;
      if (!error && data) {
        const rows = data as ConteoEventoRow[];
        setEventos(
          rows
            .filter((d): d is { lat: number; lng: number; evento: 'sube' | 'baja' } =>
              typeof d.lat === 'number' &&
              typeof d.lng === 'number' &&
              (d.evento === 'sube' || d.evento === 'baja'),
            )
            .map((d) => ({ lat: d.lat, lng: d.lng, evento: d.evento })),
        );
      }
      setLoading(false);
    })();
    return () => {
      cancel = true;
    };
  }, [unidadId, days]);

  // Inicializar mapa en el contenedor visible actual.
  // Al entrar/salir de pantalla completa el contenedor cambia, así que Leaflet debe recrearse.
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const map = L.map(containerRef.current, {
      center: [29.0729, -110.9559],
      zoom: 12,
      zoomControl: true,
      attributionControl: false,
      dragging: true,
      touchZoom: true,
      scrollWheelZoom: true,
      doubleClickZoom: true,
      boxZoom: true,
      keyboard: true,
    });
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(map);
    mapRef.current = map;
    layerRef.current = L.layerGroup().addTo(map);
    setTimeout(() => map.invalidateSize(), 120);

    return () => {
      map.remove();
      mapRef.current = null;
      layerRef.current = null;
    };
  }, [fullscreen]);

  // Render puntos + fallback de encuadre con la ruta de la unidad
  useEffect(() => {
    const map = mapRef.current;
    const layer = layerRef.current;
    if (!map || !layer) return;
    layer.clearLayers();

    if (eventos.length > 0) {
      eventos.forEach((e) => {
        const color = e.evento === 'sube' ? '#16A34A' : '#DC2626';
        L.circleMarker([e.lat, e.lng], {
          radius: 6,
          color,
          fillColor: color,
          fillOpacity: 0.55,
          weight: 1,
        }).addTo(layer);
      });
      const bounds = L.latLngBounds(eventos.map((e) => [e.lat, e.lng] as [number, number]));
      map.fitBounds(bounds, { padding: [30, 30], maxZoom: 16 });
      return;
    }

    // Sin eventos: centrar en la ruta asignada de la unidad
    if (routeBounds && routeBounds.length) {
      const b = L.latLngBounds(routeBounds);
      map.fitBounds(b, { padding: [30, 30], maxZoom: 14 });
    }
  }, [eventos, routeBounds, fullscreen]);

  // Recalcular tamaño al alternar pantalla completa
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const t = setTimeout(() => map.invalidateSize(), 200);
    return () => clearTimeout(t);
  }, [fullscreen]);

  // Bloquear scroll del body en fullscreen
  useEffect(() => {
    if (!fullscreen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, [fullscreen]);

  const subidas = eventos.filter((e) => e.evento === 'sube').length;
  const bajadas = eventos.filter((e) => e.evento === 'baja').length;

  const mapHeightClass = fullscreen ? 'h-[100dvh]' : 'h-[320px]';

  const content = (
    <div className="relative" style={{ touchAction: 'none' }}>
      <div
        ref={containerRef}
        className={`w-full ${mapHeightClass} ${fullscreen ? '' : 'rounded-b-lg'} overflow-hidden`}
        style={{ touchAction: 'none' }}
      />
      <Button
        type="button"
        size="icon"
        variant="secondary"
        onClick={() => setFullscreen((v) => !v)}
        className="absolute top-2 right-2 z-[1000] h-9 w-9 shadow-md"
        aria-label={fullscreen ? 'Salir de pantalla completa' : 'Pantalla completa'}
      >
        {fullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
      </Button>
      {loading && (
        <div className="absolute inset-0 flex items-center justify-center bg-background/60 pointer-events-none">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      )}
      {!loading && eventos.length === 0 && (
        <div className="absolute bottom-2 left-2 right-12 bg-background/85 text-[11px] text-muted-foreground px-3 py-2 rounded-md text-center pointer-events-none">
          Aún no hay eventos con ubicación. El mapa muestra la ruta asignada.
        </div>
      )}
    </div>
  );

  if (fullscreen) {
    return createPortal(
      <div className="fixed inset-0 z-[100000] bg-background">
        {content}
      </div>,
      document.body,
    );
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <MapPin className="h-4 w-4 text-primary" />
          Mapa de paradas reales {unidadNombre ? `· ${unidadNombre}` : ''}
        </CardTitle>
        <div className="flex gap-4 text-xs text-muted-foreground">
          <span className="flex items-center gap-1">
            <span className="inline-block h-2.5 w-2.5 rounded-full bg-green-600" /> Suben: {subidas}
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block h-2.5 w-2.5 rounded-full bg-red-600" /> Bajan: {bajadas}
          </span>
          <span>Últimos {days} días</span>
        </div>
      </CardHeader>
      <CardContent className="p-0">{content}</CardContent>
    </Card>
  );
}
