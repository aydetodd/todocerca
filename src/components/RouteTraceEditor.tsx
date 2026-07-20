import { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Loader2, Save, Undo2, Trash2, Locate, Maximize2, Minimize2, MapPin, Waypoints } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import MapSearchBar from '@/components/MapSearchBar';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  productoId: string;
  filename?: string | null;
  geojson: any | null; // null = draw-from-scratch mode
  onSaved?: () => void;
  initialCenter?: [number, number]; // [lat, lng] for draw mode
}

type Mode = 'puntos' | 'vertices';

/**
 * Editor de trazado en 2 fases:
 * 1) PUNTOS (A, B, C…): pocos, ordenados. Definen paradas del recorrido.
 * 2) VÉRTICES: se insertan ENTRE los puntos para acomodar la línea a las curvas de las calles.
 *    Un vértice no es una parada, solo dobla la línea.
 */
export default function RouteTraceEditor({ open, onOpenChange, productoId, filename, geojson, onSaved, initialCenter }: Props) {
  const mapElRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const polylineRef = useRef<L.Polyline | null>(null);
  const markersGroupRef = useRef<L.LayerGroup | null>(null);
  const coordsRef = useRef<[number, number][]>([]);
  const waypointFlagsRef = useRef<boolean[]>([]);
  const selectedIdxRef = useRef<number | null>(null);
  const modeRef = useRef<Mode>('puntos');
  const [coords, setCoords] = useState<[number, number][]>([]);
  const [waypointFlags, setWaypointFlags] = useState<boolean[]>([]);
  const [history, setHistory] = useState<{ coords: [number, number][]; flags: boolean[] }[]>([]);
  const [selectedIdx, setSelectedIdx] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [mapReady, setMapReady] = useState(false);
  const [mapExpanded, setMapExpanded] = useState(false);
  const [color, setColor] = useState<string>('#0066CC');
  const [mode, setMode] = useState<Mode>('puntos');
  const colorRef = useRef<string>('#0066CC');
  useEffect(() => { colorRef.current = color; }, [color]);
  useEffect(() => { modeRef.current = mode; }, [mode]);
  const isDrawMode = !geojson;
  const { toast } = useToast();

  const COLOR_PALETTE: { value: string; label: string }[] = [
    { value: '#0066CC', label: 'Azul' },
    { value: '#dc2626', label: 'Rojo' },
    { value: '#16a34a', label: 'Verde' },
    { value: '#f59e0b', label: 'Naranja' },
    { value: '#a855f7', label: 'Morado' },
    { value: '#ec4899', label: 'Rosa' },
    { value: '#0891b2', label: 'Cian' },
    { value: '#000000', label: 'Negro' },
  ];

  useEffect(() => { coordsRef.current = coords; }, [coords]);
  useEffect(() => { waypointFlagsRef.current = waypointFlags; }, [waypointFlags]);
  useEffect(() => { selectedIdxRef.current = selectedIdx; }, [selectedIdx]);

  // Load
  useEffect(() => {
    if (!open) return;
    if (isDrawMode) {
      setCoords([]);
      setWaypointFlags([]);
      setHistory([]);
      setSelectedIdx(null);
      setColor('#0066CC');
      setMode('puntos');
      return;
    }
    const line = geojson.features?.find((f: any) => f?.geometry?.type === 'LineString');
    if (!line) {
      toast({ title: 'Sin línea editable', description: 'Esta ruta no tiene un LineString.', variant: 'destructive' });
      return;
    }
    const c = (line.geometry.coordinates as number[][]).map(([lng, lat]) => [lat, lng] as [number, number]);
    // Si el geojson trae metadata de waypoints la respetamos; si no, marcamos solo el primero y el último.
    const savedFlags: boolean[] | undefined = line.properties?.waypointFlags;
    const flags = Array.isArray(savedFlags) && savedFlags.length === c.length
      ? savedFlags.map(Boolean)
      : c.map((_, i) => i === 0 || i === c.length - 1);
    setCoords(c);
    setWaypointFlags(flags);
    setHistory([]);
    setSelectedIdx(null);
    setColor((line.properties?.color as string) || '#0066CC');
    setMode('vertices');
  }, [open, geojson, isDrawMode, toast]);

  const pushHistory = () => {
    setHistory((h) => [...h.slice(-49), { coords: coordsRef.current, flags: waypointFlagsRef.current }]);
  };

  // Init map
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    let m: L.Map | null = null;

    const tryInit = (attempt = 0) => {
      if (cancelled) return;
      const el = mapElRef.current;
      if (!el || el.clientWidth === 0 || el.clientHeight === 0) {
        if (attempt < 30) return setTimeout(() => tryInit(attempt + 1), 100);
        return;
      }
      if (mapRef.current) return;
      const center = initialCenter || [23.6345, -102.5528];
      m = L.map(el, { zoomControl: true, attributionControl: false }).setView(center, initialCenter ? 13 : 5);
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19 }).addTo(m);

      m.on('click', (e: L.LeafletMouseEvent) => {
        const { lat, lng } = e.latlng;
        const current = coordsRef.current;
        const flags = waypointFlagsRef.current;
        const currentMode = modeRef.current;

        if (currentMode === 'puntos') {
          // Agrega un NUEVO PUNTO (A, B, C…) siempre al final.
          pushHistory();
          const next = [...current, [lat, lng] as [number, number]];
          const nextFlags = [...flags, true];
          setCoords(next);
          setWaypointFlags(nextFlags);
          setSelectedIdx(next.length - 1);
        } else {
          // Vértices: se insertan ENTRE dos puntos existentes.
          if (current.length < 2) {
            toast({ title: 'Faltan puntos', description: 'Primero define al menos 2 puntos (A y B).', variant: 'destructive' });
            return;
          }
          const insertAt = findInsertIndex(current, [lat, lng]);
          pushHistory();
          const next = [...current];
          const nextFlags = [...flags];
          next.splice(insertAt, 0, [lat, lng]);
          nextFlags.splice(insertAt, 0, false); // vértice = no waypoint
          setCoords(next);
          setWaypointFlags(nextFlags);
          setSelectedIdx(insertAt);
        }
      });

      mapRef.current = m;
      setMapReady(true);
      requestAnimationFrame(() => m && m.invalidateSize());
      setTimeout(() => m && m.invalidateSize(), 300);

      if (!initialCenter && navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
          (pos) => { try { m && m.setView([pos.coords.latitude, pos.coords.longitude], 16); } catch {} },
          () => {},
          { enableHighAccuracy: true, timeout: 8000, maximumAge: 60000 }
        );
      }
    };

    tryInit();

    return () => {
      cancelled = true;
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
      polylineRef.current = null;
      markersGroupRef.current = null;
      setMapReady(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Redraw
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    if (polylineRef.current) { polylineRef.current.remove(); polylineRef.current = null; }
    if (markersGroupRef.current) { markersGroupRef.current.remove(); markersGroupRef.current = null; }

    if (coords.length >= 2) {
      const poly = L.polyline(coords, { color, weight: 5, opacity: 0.85 }).addTo(map);
      poly.on('click', (e: L.LeafletMouseEvent) => {
        L.DomEvent.stopPropagation(e);
        if (modeRef.current !== 'vertices') return; // en modo puntos, no insertar sobre la línea
        const { lat, lng } = e.latlng;
        const insertAt = findInsertIndex(coordsRef.current, [lat, lng]);
        pushHistory();
        const next = [...coordsRef.current];
        const nextFlags = [...waypointFlagsRef.current];
        next.splice(insertAt, 0, [lat, lng]);
        nextFlags.splice(insertAt, 0, false);
        setCoords(next);
        setWaypointFlags(nextFlags);
        setSelectedIdx(insertAt);
      });
      polylineRef.current = poly;
    }

    if (coords.length > 0) {
      const group = L.layerGroup().addTo(map);
      // Compute waypoint letters based on waypointFlags order
      let wpCounter = 0;
      coords.forEach(([lat, lng], idx) => {
        const isWp = waypointFlags[idx];
        const isSelected = idx === selectedIdx;
        let markerHtml: string;
        if (isWp) {
          const letter = String.fromCharCode(65 + Math.min(wpCounter, 25));
          wpCounter++;
          const bg = isSelected ? '#dc2626' : '#16a34a';
          markerHtml = `<div style="width:24px;height:24px;border-radius:50%;background:${bg};border:2px solid white;box-shadow:0 1px 3px rgba(0,0,0,.4);display:flex;align-items:center;justify-content:center;color:white;font-weight:700;font-size:12px;cursor:grab">${letter}</div>`;
        } else {
          const bg = isSelected ? '#dc2626' : color;
          const size = isSelected ? 12 : 9;
          markerHtml = `<div style="width:${size}px;height:${size}px;border-radius:50%;background:${bg};border:2px solid white;box-shadow:0 1px 2px rgba(0,0,0,.4);cursor:grab"></div>`;
        }
        const iconSize = isWp ? 24 : (isSelected ? 12 : 9);
        const icon = L.divIcon({
          className: 'route-vertex-marker',
          html: markerHtml,
          iconSize: [iconSize, iconSize],
          iconAnchor: [iconSize / 2, iconSize / 2],
        });
        const marker = L.marker([lat, lng], { icon, draggable: true }).addTo(group);
        marker.on('click', (e: any) => { L.DomEvent.stopPropagation(e); setSelectedIdx(idx); });
        marker.on('dragstart', () => pushHistory());
        marker.on('drag', (e: any) => {
          const ll = e.target.getLatLng();
          const next = [...coordsRef.current];
          next[idx] = [ll.lat, ll.lng];
          coordsRef.current = next;
          if (polylineRef.current) polylineRef.current.setLatLngs(next);
        });
        marker.on('dragend', (e: any) => {
          const ll = e.target.getLatLng();
          const next = [...coordsRef.current];
          next[idx] = [ll.lat, ll.lng];
          setCoords(next);
          setSelectedIdx(idx);
        });
      });
      markersGroupRef.current = group;
    }

    if (!isDrawMode && history.length === 0 && polylineRef.current) {
      try { map.fitBounds(polylineRef.current.getBounds(), { padding: [30, 30] }); } catch {}
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [coords, waypointFlags, selectedIdx, color, mapReady]);

  const undo = () => {
    setHistory((h) => {
      if (h.length === 0) return h;
      const prev = h[h.length - 1];
      setCoords(prev.coords);
      setWaypointFlags(prev.flags);
      setSelectedIdx(null);
      return h.slice(0, -1);
    });
  };

  const deleteVertex = () => {
    if (selectedIdx === null) return;
    const wpCount = waypointFlags.filter(Boolean).length;
    const isWp = waypointFlags[selectedIdx];
    if (isWp && wpCount <= 2 && !isDrawMode) {
      toast({ title: 'No se puede', description: 'Se necesitan al menos 2 puntos (A y B).', variant: 'destructive' });
      return;
    }
    pushHistory();
    setCoords((c) => c.filter((_, i) => i !== selectedIdx));
    setWaypointFlags((f) => f.filter((_, i) => i !== selectedIdx));
    setSelectedIdx(null);
  };

  const clearAll = () => {
    if (coords.length === 0) return;
    pushHistory();
    setCoords([]);
    setWaypointFlags([]);
    setSelectedIdx(null);
  };

  const handleSave = async () => {
    if (coords.length < 2) {
      toast({ title: 'Faltan puntos', description: 'Agrega al menos 2 puntos para guardar.', variant: 'destructive' });
      return;
    }
    setSaving(true);
    try {
      const newCoords = coords.map(([lat, lng]) => [lng, lat]);
      const flagsCopy = [...waypointFlags];

      let newGeoJSON: any;
      if (isDrawMode) {
        newGeoJSON = {
          type: 'FeatureCollection',
          features: [
            {
              type: 'Feature',
              properties: { source: 'hand-drawn', createdAt: new Date().toISOString(), color, waypointFlags: flagsCopy },
              geometry: { type: 'LineString', coordinates: newCoords },
            },
          ],
        };
      } else {
        let replaced = false;
        const features = (geojson.features || []).map((f: any) => {
          if (!replaced && f?.geometry?.type === 'LineString') {
            replaced = true;
            return {
              ...f,
              geometry: { ...f.geometry, coordinates: newCoords },
              properties: { ...(f.properties || {}), edited: true, editedAt: new Date().toISOString(), color, waypointFlags: flagsCopy },
            };
          }
          return f;
        });
        newGeoJSON = { ...geojson, type: 'FeatureCollection', features };
      }

      const { error } = await (supabase as any).rpc('save_private_route_trace', {
        _producto_id: productoId,
        _filename: filename || (isDrawMode ? 'trazado-a-mano.geojson' : 'editado.geojson'),
        _geojson: newGeoJSON,
      });
      if (error) throw error;
      const wpCount = flagsCopy.filter(Boolean).length;
      const vxCount = coords.length - wpCount;
      toast({ title: '✅ Trazado guardado', description: `${wpCount} puntos · ${vxCount} vértices.` });
      onSaved?.();
      onOpenChange(false);
    } catch (e: any) {
      toast({ title: 'Error al guardar', description: e.message || String(e), variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const goToMyLocation = () => {
    if (!navigator.geolocation || !mapRef.current) {
      toast({ title: 'Sin GPS', description: 'No se pudo obtener tu ubicación.', variant: 'destructive' });
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => { try { mapRef.current?.setView([pos.coords.latitude, pos.coords.longitude], 17); } catch {} },
      () => toast({ title: 'Sin permiso', description: 'Permite el acceso a la ubicación.', variant: 'destructive' }),
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 30000 }
    );
  };

  const goToCoords = (lat: number, lng: number) => {
    try { mapRef.current?.setView([lat, lng], 17); } catch {}
  };

  const wpCount = waypointFlags.filter(Boolean).length;
  const vxCount = coords.length - wpCount;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl w-[95vw] h-[90vh] flex flex-col p-0">
        <DialogHeader className="px-4 pt-4">
          <DialogTitle>{isDrawMode ? 'Dibujar trazado' : 'Editor de trazado'}</DialogTitle>
          <DialogDescription className="text-xs">
            {mode === 'puntos'
              ? 'PASO 1 — Puntos (A, B, C…): toca el mapa para marcar cada parada del recorrido en orden. Pocos, los importantes.'
              : 'PASO 2 — Vértices: toca sobre la línea o el mapa para insertar puntos que doblan la línea sobre las calles. Los vértices NO son paradas.'}
          </DialogDescription>
        </DialogHeader>

        {/* Selector de fase */}
        <div className="flex items-center gap-2 px-4 py-2 border-y bg-muted/40">
          <Button
            size="sm"
            variant={mode === 'puntos' ? 'default' : 'outline'}
            onClick={() => { setMode('puntos'); setSelectedIdx(null); }}
            className="flex-1"
          >
            <MapPin className="h-3 w-3 mr-1" />
            1. Puntos ({wpCount})
          </Button>
          <Button
            size="sm"
            variant={mode === 'vertices' ? 'default' : 'outline'}
            onClick={() => {
              if (coords.length < 2) {
                toast({ title: 'Primero pon los puntos', description: 'Marca al menos A y B antes de acomodar la línea.', variant: 'destructive' });
                return;
              }
              setMode('vertices'); setSelectedIdx(null);
            }}
            className="flex-1"
            disabled={coords.length < 2}
          >
            <Waypoints className="h-3 w-3 mr-1" />
            2. Vértices ({vxCount})
          </Button>
        </div>

        <div className="flex flex-wrap items-center gap-2 px-4 py-2 border-b bg-muted/20">
          <Button size="sm" variant="outline" onClick={undo} disabled={history.length === 0}>
            <Undo2 className="h-3 w-3 mr-1" />Deshacer
          </Button>
          <Button size="sm" variant="outline" onClick={deleteVertex} disabled={selectedIdx === null} className="text-destructive">
            <Trash2 className="h-3 w-3 mr-1" />Eliminar
          </Button>
          {isDrawMode && (
            <Button size="sm" variant="ghost" onClick={clearAll} disabled={coords.length === 0} className="text-destructive">
              Limpiar todo
            </Button>
          )}
          <span className="ml-auto text-[11px] text-muted-foreground">
            {selectedIdx !== null && `Seleccionado: ${waypointFlags[selectedIdx] ? 'punto' : 'vértice'} #${selectedIdx + 1}`}
          </span>
        </div>

        {!mapExpanded && (
          <>
            <div className="flex flex-wrap items-center gap-1.5 px-4 py-2 border-b bg-background">
              <span className="text-[11px] text-muted-foreground mr-1">Color:</span>
              {COLOR_PALETTE.map((c) => (
                <button
                  key={c.value}
                  type="button"
                  onClick={() => setColor(c.value)}
                  title={c.label}
                  aria-label={`Color ${c.label}`}
                  className={`h-6 w-6 rounded-full border-2 transition-transform ${color === c.value ? 'border-foreground scale-110 ring-2 ring-offset-1 ring-foreground/30' : 'border-white shadow'}`}
                  style={{ background: c.value }}
                />
              ))}
            </div>
            <div className="px-3 py-2 border-b bg-background flex items-center gap-2">
              <div className="flex-1 min-w-0">
                <MapSearchBar
                  alwaysOpen
                  placeholder="Ej: Blvd Solidaridad 123, Hermosillo"
                  onSelectLocation={(lat, lng) => goToCoords(lat, lng)}
                />
              </div>
              <Button size="sm" variant="outline" onClick={goToMyLocation} title="Centrar en mi ubicación">
                <Locate className="h-4 w-4" />
              </Button>
            </div>
          </>
        )}

        <div className="relative flex-1 w-full" style={{ minHeight: 300 }}>
          <div ref={mapElRef} className="absolute inset-0 w-full h-full" />
          <Button
            type="button"
            size="icon"
            variant="secondary"
            className="absolute top-2 right-2 z-[500] h-8 w-8 shadow-lg"
            onClick={() => { setMapExpanded((v) => !v); setTimeout(() => mapRef.current?.invalidateSize(), 200); }}
            title={mapExpanded ? 'Reducir mapa' : 'Expandir mapa'}
          >
            {mapExpanded ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
          </Button>
        </div>

        <DialogFooter className="px-4 pb-4 pt-2">
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={saving}>Cancelar</Button>
          <Button onClick={handleSave} disabled={saving || coords.length < 2}>
            {saving ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <Save className="h-3 w-3 mr-1" />}
            Guardar trazado
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function findInsertIndex(coords: [number, number][], point: [number, number]): number {
  let bestIdx = 1;
  let bestDist = Infinity;
  const [px, py] = point;
  for (let i = 0; i < coords.length - 1; i++) {
    const [ax, ay] = coords[i];
    const [bx, by] = coords[i + 1];
    const dx = bx - ax;
    const dy = by - ay;
    const len2 = dx * dx + dy * dy || 1e-12;
    let t = ((px - ax) * dx + (py - ay) * dy) / len2;
    t = Math.max(0, Math.min(1, t));
    const cx = ax + t * dx;
    const cy = ay + t * dy;
    const d = (cx - px) ** 2 + (cy - py) ** 2;
    if (d < bestDist) {
      bestDist = d;
      bestIdx = i + 1;
    }
  }
  return bestIdx;
}
