import { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2, MapPin } from 'lucide-react';

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
        setEventos(
          data
            .filter((d: any) => typeof d.lat === 'number' && typeof d.lng === 'number')
            .map((d: any) => ({ lat: d.lat, lng: d.lng, evento: d.evento })),
        );
      }
      setLoading(false);
    })();
    return () => {
      cancel = true;
    };
  }, [unidadId, days]);

  // Inicializar mapa una vez
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const map = L.map(containerRef.current, {
      center: [29.0729, -110.9559],
      zoom: 12,
      zoomControl: true,
      attributionControl: false,
    });
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(map);
    mapRef.current = map;
    layerRef.current = L.layerGroup().addTo(map);

    return () => {
      map.remove();
      mapRef.current = null;
      layerRef.current = null;
    };
  }, []);

  // Render puntos
  useEffect(() => {
    const map = mapRef.current;
    const layer = layerRef.current;
    if (!map || !layer) return;
    layer.clearLayers();
    if (eventos.length === 0) return;

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
  }, [eventos]);

  const subidas = eventos.filter((e) => e.evento === 'sube').length;
  const bajadas = eventos.filter((e) => e.evento === 'baja').length;

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
      <CardContent className="p-0">
        <div className="relative">
          <div ref={containerRef} className="w-full h-[320px] rounded-b-lg overflow-hidden" />
          {loading && (
            <div className="absolute inset-0 flex items-center justify-center bg-background/60">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          )}
          {!loading && eventos.length === 0 && (
            <div className="absolute inset-0 flex items-center justify-center bg-background/80 text-xs text-muted-foreground px-4 text-center">
              Aún no hay eventos con ubicación. Necesitas un ESP32 con GPS opcional, o que el
              chofer comparta ubicación al subir/bajar pasajeros.
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
