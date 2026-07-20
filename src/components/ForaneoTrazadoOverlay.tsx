import { useEffect, useMemo, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Loader2, Layers } from 'lucide-react';

interface Props {
  proveedorId: string;
}

interface RutaItem {
  id: string;
  nombre: string;
  route_geojson: any;
  color: string;
}

// Paleta de colores distintos y contrastantes
const PALETTE = [
  '#e6194B', '#3cb44b', '#4363d8', '#f58231', '#911eb4',
  '#42d4f4', '#f032e6', '#9A6324', '#800000', '#808000',
  '#000075', '#469990', '#bfef45', '#fabed4', '#dcbeff',
  '#a9a9a9', '#ffd8b1', '#aaffc3', '#ffe119', '#000000',
];

export default function ForaneoTrazadoOverlay({ proveedorId }: Props) {
  const mapRef = useRef<HTMLDivElement | null>(null);
  const mapInstance = useRef<L.Map | null>(null);
  const layersRef = useRef<Record<string, L.LayerGroup>>({});
  const [loading, setLoading] = useState(true);
  const [rutas, setRutas] = useState<RutaItem[]>([]);
  const [visibles, setVisibles] = useState<Record<string, boolean>>({});

  // Cargar rutas foráneas del concesionario con trazado
  useEffect(() => {
    (async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from('productos')
        .select('id, nombre, route_geojson')
        .eq('proveedor_id', proveedorId)
        .eq('route_type', 'foranea')
        .not('route_geojson', 'is', null);

      if (error) {
        console.error('[ForaneoTrazadoOverlay]', error);
        setLoading(false);
        return;
      }

      const items: RutaItem[] = (data || [])
        .filter((r: any) => r.route_geojson?.features?.length)
        .map((r: any, i: number) => ({
          id: r.id,
          nombre: r.nombre || `Ruta ${i + 1}`,
          route_geojson: r.route_geojson,
          color: PALETTE[i % PALETTE.length],
        }));

      setRutas(items);
      const vis: Record<string, boolean> = {};
      items.forEach((r) => (vis[r.id] = true));
      setVisibles(vis);
      setLoading(false);
    })();
  }, [proveedorId]);

  // Inicializar mapa
  useEffect(() => {
    if (!mapRef.current || mapInstance.current) return;
    const map = L.map(mapRef.current, { zoomControl: true }).setView([23.6345, -102.5528], 5);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap',
      maxZoom: 19,
    }).addTo(map);
    mapInstance.current = map;
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => { try { mapInstance.current?.setView([pos.coords.latitude, pos.coords.longitude], 12); } catch {} },
        () => {},
        { enableHighAccuracy: true, timeout: 8000, maximumAge: 60000 }
      );
    }
    return () => {
      map.remove();
      mapInstance.current = null;
      layersRef.current = {};
    };
  }, []);

  // Dibujar rutas
  useEffect(() => {
    const map = mapInstance.current;
    if (!map || rutas.length === 0) return;

    // limpiar previos
    Object.values(layersRef.current).forEach((g) => g.remove());
    layersRef.current = {};

    const allCoords: L.LatLngExpression[] = [];
    rutas.forEach((r) => {
      const group = L.layerGroup();
      const features = r.route_geojson?.features || [];
      features.forEach((f: any) => {
        if (f.geometry?.type !== 'LineString' && f.geometry?.type !== 'MultiLineString') return;
        const segments = f.geometry.type === 'LineString'
          ? [f.geometry.coordinates]
          : f.geometry.coordinates;
        segments.forEach((seg: number[][]) => {
          const latlngs = seg.map(([lng, lat]) => [lat, lng] as [number, number]);
          allCoords.push(...latlngs);
          L.polyline(latlngs, {
            color: r.color,
            weight: 4,
            opacity: 0.75,
          })
            .bindTooltip(r.nombre, { sticky: true })
            .addTo(group);
        });
      });
      layersRef.current[r.id] = group;
      if (visibles[r.id]) group.addTo(map);
    });

    if (allCoords.length > 0) {
      try {
        map.fitBounds(L.latLngBounds(allCoords), { padding: [30, 30] });
      } catch {}
    }
  }, [rutas]);

  // Toggle visibilidad
  useEffect(() => {
    const map = mapInstance.current;
    if (!map) return;
    Object.entries(layersRef.current).forEach(([id, group]) => {
      if (visibles[id]) {
        if (!map.hasLayer(group)) group.addTo(map);
      } else {
        if (map.hasLayer(group)) group.remove();
      }
    });
  }, [visibles]);

  const toggle = (id: string) =>
    setVisibles((v) => ({ ...v, [id]: !v[id] }));

  const todasOn = useMemo(() => rutas.every((r) => visibles[r.id]), [rutas, visibles]);
  const setAll = (on: boolean) => {
    const next: Record<string, boolean> = {};
    rutas.forEach((r) => (next[r.id] = on));
    setVisibles(next);
  };

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <Layers className="h-4 w-4" /> Trazado / Segmentación
        </CardTitle>
        <CardDescription className="text-xs">
          Todas tus rutas foráneas encimadas en un mismo mapa. Cada ruta con un color distinto para ver dónde se traslapan y planear hubs / segmentos.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {loading ? (
          <div className="flex items-center justify-center py-10">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          </div>
        ) : rutas.length === 0 ? (
          <p className="text-sm text-muted-foreground py-6 text-center">
            Aún no tienes rutas foráneas con trazado. Sube el KML/KMZ/GPX/GeoJSON desde "Catálogo Maestro" o "Unidades / Choferes / Rutas".
          </p>
        ) : (
          <>
            <div ref={mapRef} className="w-full h-[420px] rounded-lg overflow-hidden border" />

            <div className="flex items-center justify-between">
              <p className="text-xs font-medium">Rutas ({rutas.length})</p>
              <button
                type="button"
                onClick={() => setAll(!todasOn)}
                className="text-xs text-primary underline"
              >
                {todasOn ? 'Ocultar todas' : 'Mostrar todas'}
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-64 overflow-y-auto pr-1">
              {rutas.map((r) => (
                <label
                  key={r.id}
                  className="flex items-center gap-2 p-2 rounded border bg-card cursor-pointer hover:bg-muted/40"
                >
                  <Checkbox
                    checked={!!visibles[r.id]}
                    onCheckedChange={() => toggle(r.id)}
                  />
                  <span
                    className="inline-block w-4 h-4 rounded-sm border"
                    style={{ backgroundColor: r.color }}
                  />
                  <span className="text-sm truncate">{r.nombre}</span>
                </label>
              ))}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
