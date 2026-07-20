import { useEffect, useRef, useState, useMemo } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Loader2, Plus, Trash2, Save, MapPin } from "lucide-react";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  productoId: string;
  routeName?: string;
}

type Parada = {
  id?: string;
  tempId: string;
  orden: number;
  nombre: string;
  lat: number;
  lng: number;
  radio_m: number;
};

type Sentido = "ida" | "vuelta";

export default function RouteParadasTarifasDialog({ open, onOpenChange, productoId, routeName }: Props) {
  const { toast } = useToast();
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const layerRef = useRef<L.LayerGroup | null>(null);

  const [tab, setTab] = useState<"paradas" | "tarifas">("paradas");
  const [sentido, setSentido] = useState<Sentido>("ida");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [mapReady, setMapReady] = useState(false);
  const [paradas, setParadas] = useState<Parada[]>([]);
  // matriz[sentido][subidaTempId][bajadaTempId] = precio
  const [matriz, setMatriz] = useState<Record<Sentido, Record<string, Record<string, number>>>>({ ida: {}, vuelta: {} });

  const newTempId = () => Math.random().toString(36).slice(2, 10);

  // Cargar datos
  useEffect(() => {
    if (!open || !productoId) return;
    (async () => {
      setLoading(true);
      try {
        const { data: pData, error: pErr } = await supabase
          .from("route_paradas" as any)
          .select("id, orden, nombre, lat, lng, radio_m")
          .eq("producto_id", productoId)
          .order("orden");
        if (pErr) throw pErr;
        const ps: Parada[] = (pData || []).map((p: any) => ({
          id: p.id, tempId: p.id, orden: p.orden, nombre: p.nombre,
          lat: Number(p.lat), lng: Number(p.lng), radio_m: Number(p.radio_m),
        }));
        setParadas(ps);

        const { data: tData } = await supabase
          .from("route_tarifas" as any)
          .select("sentido, parada_subida_id, parada_bajada_id, precio_mxn")
          .eq("producto_id", productoId);
        const m: Record<Sentido, Record<string, Record<string, number>>> = { ida: {}, vuelta: {} };
        (tData || []).forEach((t: any) => {
          const s = t.sentido as Sentido;
          m[s][t.parada_subida_id] = m[s][t.parada_subida_id] || {};
          m[s][t.parada_subida_id][t.parada_bajada_id] = Number(t.precio_mxn);
        });
        setMatriz(m);
      } catch (e: any) {
        toast({ title: "Error", description: e.message, variant: "destructive" });
      } finally {
        setLoading(false);
      }
    })();
  }, [open, productoId, toast]);

  // Init map (solo cuando estamos en pestaña paradas)
  useEffect(() => {
    if (!open || tab !== "paradas") return;
    let ro: ResizeObserver | null = null;

    const tryInit = async () => {
      if (!containerRef.current || mapRef.current) return;
      if (containerRef.current.clientHeight < 50 || containerRef.current.clientWidth < 50) return;

      const map = L.map(containerRef.current, { center: [23.6345, -102.5528], zoom: 5, attributionControl: false });
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19 }).addTo(map);
      mapRef.current = map;
      if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
          (pos) => { try { mapRef.current?.setView([pos.coords.latitude, pos.coords.longitude], 13); } catch {} },
          () => {},
          { enableHighAccuracy: true, timeout: 8000, maximumAge: 60000 }
        );
      }
      layerRef.current = L.layerGroup().addTo(map);
      setMapReady(true);
      [0, 100, 300, 700].forEach((d) => setTimeout(() => map.invalidateSize(), d));

      map.on("click", (e: L.LeafletMouseEvent) => {
        setParadas((prev) => {
          const ord = prev.length;
          return [...prev, {
            tempId: newTempId(),
            orden: ord,
            nombre: `Parada ${ord + 1}`,
            lat: e.latlng.lat, lng: e.latlng.lng,
            radio_m: 200,
          }];
        });
      });

      // Trazado + A/B
      try {
        const { data: p } = await supabase
          .from("productos")
          .select("route_geojson, route_origin_lat, route_origin_lng, route_destination_lat, route_destination_lng, route_geofence_radius_m")
          .eq("id", productoId).maybeSingle();
        const pd = p as any;
        const all: L.LatLngExpression[] = [];
        if (pd?.route_geojson?.features) {
          pd.route_geojson.features.forEach((f: any) => {
            if (f.geometry?.type === "LineString") {
              const cs = (f.geometry.coordinates as number[][]).map(([lng, lat]) => [lat, lng] as [number, number]);
              all.push(...cs);
              L.polyline(cs, { color: "#0066CC", weight: 4, opacity: 0.7 }).addTo(map);
            } else if (f.geometry?.type === "MultiLineString") {
              (f.geometry.coordinates as number[][][]).forEach((seg) => {
                const cs = seg.map(([lng, lat]) => [lat, lng] as [number, number]);
                all.push(...cs);
                L.polyline(cs, { color: "#0066CC", weight: 4, opacity: 0.7 }).addTo(map);
              });
            }
          });
        }
        const r = pd?.route_geofence_radius_m || 150;
        if (pd?.route_origin_lat != null) {
          L.circle([Number(pd.route_origin_lat), Number(pd.route_origin_lng)], { radius: r, color: "#2563eb", fillOpacity: 0.1 })
            .bindTooltip("A", { permanent: true, direction: "center" }).addTo(map);
          all.push([Number(pd.route_origin_lat), Number(pd.route_origin_lng)]);
        }
        if (pd?.route_destination_lat != null) {
          L.circle([Number(pd.route_destination_lat), Number(pd.route_destination_lng)], { radius: r, color: "#7c3aed", fillOpacity: 0.1 })
            .bindTooltip("B", { permanent: true, direction: "center" }).addTo(map);
          all.push([Number(pd.route_destination_lat), Number(pd.route_destination_lng)]);
        }
        if (all.length > 0) map.fitBounds(L.latLngBounds(all), { padding: [40, 40] });
      } catch (e) {
        console.warn("[Paradas] trazado:", e);
      }
    };

    tryInit();
    if (containerRef.current) {
      ro = new ResizeObserver(() => { tryInit(); });
      ro.observe(containerRef.current);
    }
    const fallback = setTimeout(tryInit, 400);

    return () => {
      clearTimeout(fallback);
      if (ro) ro.disconnect();
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
        layerRef.current = null;
      }
      setMapReady(false);
    };
  }, [open, tab, productoId, loading]);

  // Redibujar paradas
  useEffect(() => {
    const map = mapRef.current; const layer = layerRef.current;
    if (!mapReady || !map || !layer) return;
    layer.clearLayers();
    paradas.forEach((p, idx) => {
      L.circle([p.lat, p.lng], { radius: p.radio_m, color: "#f59e0b", weight: 2, fillOpacity: 0.2 })
        .bindTooltip(`${idx + 1}. ${p.nombre}`, { direction: "top" })
        .addTo(layer);
      const m = L.marker([p.lat, p.lng], {
        draggable: true,
        icon: L.divIcon({
          className: "",
          html: `<div style="background:#f59e0b;color:#000;border-radius:50%;width:26px;height:26px;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:800;border:2px solid #fff;box-shadow:0 0 6px rgba(0,0,0,.5)">${idx + 1}</div>`,
          iconSize: [26, 26], iconAnchor: [13, 13],
        }),
      }).addTo(layer);
      m.on("dragend", () => {
        const pos = m.getLatLng();
        setParadas((prev) => prev.map((q, i) => i === idx ? { ...q, lat: pos.lat, lng: pos.lng } : q));
      });
    });
  }, [paradas, mapReady]);

  const updateParada = (idx: number, patch: Partial<Parada>) => {
    setParadas((prev) => prev.map((p, i) => i === idx ? { ...p, ...patch } : p));
  };
  const removeParada = (idx: number) => {
    setParadas((prev) => prev.filter((_, i) => i !== idx).map((p, i) => ({ ...p, orden: i })));
  };
  const moveParada = (idx: number, dir: -1 | 1) => {
    setParadas((prev) => {
      const next = [...prev];
      const j = idx + dir;
      if (j < 0 || j >= next.length) return prev;
      [next[idx], next[j]] = [next[j], next[idx]];
      return next.map((p, i) => ({ ...p, orden: i }));
    });
  };

  // Sentido para tarifas: ida = subir antes en el orden, bajar después
  const filasIda = paradas.slice(0, -1); // subidas posibles (todas excepto la última)
  const colsIda = paradas.slice(1);       // bajadas posibles (todas excepto la primera)
  const filasVuelta = [...paradas].reverse().slice(0, -1);
  const colsVuelta = [...paradas].reverse().slice(1);

  const filas = sentido === "ida" ? filasIda : filasVuelta;
  const cols = sentido === "ida" ? colsIda : colsVuelta;

  const getPrecio = (s: Sentido, sub: string, baj: string) => matriz[s]?.[sub]?.[baj] ?? 0;
  const setPrecio = (s: Sentido, sub: string, baj: string, val: number) => {
    setMatriz((prev) => {
      const next = { ...prev, [s]: { ...prev[s], [sub]: { ...(prev[s][sub] || {}), [baj]: val } } };
      return next;
    });
  };

  const tarifaValida = (s: Sentido, subIdx: number, bajIdx: number) => {
    // En ida: la bajada debe estar después de la subida en el orden lineal
    // (idx en filas vs cols ya está desplazado, así que filtramos por orden real)
    if (s === "ida") return paradas.indexOf(filasIda[subIdx]) < paradas.indexOf(colsIda[bajIdx]);
    return paradas.indexOf(filasVuelta[subIdx]) > paradas.indexOf(colsVuelta[bajIdx]);
  };

  const handleSave = async () => {
    if (!productoId) return;
    setSaving(true);
    try {
      // 1) Guardar paradas (siempre genera ids nuevos)
      const payload = paradas.map((p, i) => ({
        orden: i, nombre: p.nombre, lat: p.lat, lng: p.lng, radio_m: p.radio_m,
      }));
      const { error: e1 } = await (supabase as any).rpc("rpc_route_set_paradas", {
        _producto_id: productoId, _paradas: payload,
      });
      if (e1) throw e1;

      // 2) Recuperar paradas guardadas (nuevos ids reales)
      const { data: pd } = await supabase
        .from("route_paradas" as any)
        .select("id, orden")
        .eq("producto_id", productoId)
        .order("orden");
      const oldIdByOrden = new Map(paradas.map((p, i) => [i, p.tempId]));
      const newIdByOrden = new Map((pd || []).map((p: any) => [p.orden, p.id]));

      // 3) Reconstruir tarifas con nuevos ids
      const tarifas: any[] = [];
      (["ida", "vuelta"] as Sentido[]).forEach((s) => {
        Object.entries(matriz[s] || {}).forEach(([oldSub, byBaj]) => {
          Object.entries(byBaj).forEach(([oldBaj, precio]) => {
            if (!precio || precio <= 0) return;
            const subOrden = paradas.findIndex((p) => p.tempId === oldSub);
            const bajOrden = paradas.findIndex((p) => p.tempId === oldBaj);
            if (subOrden < 0 || bajOrden < 0) return;
            // validar dirección
            if (s === "ida" && subOrden >= bajOrden) return;
            if (s === "vuelta" && subOrden <= bajOrden) return;
            const sId = newIdByOrden.get(subOrden);
            const bId = newIdByOrden.get(bajOrden);
            if (!sId || !bId) return;
            tarifas.push({ sentido: s, parada_subida_id: sId, parada_bajada_id: bId, precio_mxn: precio });
          });
        });
      });

      const { error: e2 } = await (supabase as any).rpc("rpc_route_set_tarifas", {
        _producto_id: productoId, _tarifas: tarifas,
      });
      if (e2) throw e2;

      toast({ title: "Guardado", description: `${paradas.length} paradas y ${tarifas.length} tarifas` });
      onOpenChange(false);
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[95vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MapPin className="h-5 w-5 text-primary" /> Paradas y tarifas por tramo
          </DialogTitle>
          <DialogDescription>
            {routeName ? `Ruta: ${routeName}` : "Define paradas A, A1, A2... B y el precio entre cualquier par."}
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin" /></div>
        ) : (
          <Tabs value={tab} onValueChange={(v) => setTab(v as any)}>
            <TabsList className="grid grid-cols-2 w-full">
              <TabsTrigger value="paradas">📍 Paradas ({paradas.length})</TabsTrigger>
              <TabsTrigger value="tarifas" disabled={paradas.length < 2}>💲 Tarifas</TabsTrigger>
            </TabsList>

            <TabsContent value="paradas" className="space-y-3 mt-3">
              <p className="text-xs text-muted-foreground">
                Toca el mapa para agregar una parada. Arrastra el número para moverla. El orden A → B se define con los botones ↑↓.
              </p>
              <div ref={containerRef} style={{ height: 380 }} className="w-full rounded-md border overflow-hidden" />
              <div className="space-y-2 max-h-60 overflow-y-auto">
                {paradas.map((p, idx) => (
                  <div key={p.tempId} className="border rounded-md p-2 space-y-2 bg-card">
                    <div className="flex items-center gap-2">
                      <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-amber-500 text-black text-xs font-bold">{idx + 1}</span>
                      <Input value={p.nombre} onChange={(e) => updateParada(idx, { nombre: e.target.value })} className="h-8 text-sm flex-1" />
                      <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => moveParada(idx, -1)} disabled={idx === 0}>↑</Button>
                      <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => moveParada(idx, 1)} disabled={idx === paradas.length - 1}>↓</Button>
                      <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => removeParada(idx)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                      <label className="text-[11px] text-muted-foreground">Radio (m)
                        <Input type="number" min={50} max={99999} value={p.radio_m}
                          onChange={(e) => updateParada(idx, { radio_m: Math.max(50, Math.min(99999, parseInt(e.target.value) || 200)) })}
                          className="h-8 text-sm" />
                      </label>
                      <label className="text-[11px] text-muted-foreground">Lat
                        <Input type="number" step="0.000001" value={p.lat}
                          onChange={(e) => updateParada(idx, { lat: parseFloat(e.target.value) || 0 })}
                          className="h-8 text-sm" />
                      </label>
                      <label className="text-[11px] text-muted-foreground">Lng
                        <Input type="number" step="0.000001" value={p.lng}
                          onChange={(e) => updateParada(idx, { lng: parseFloat(e.target.value) || 0 })}
                          className="h-8 text-sm" />
                      </label>
                    </div>
                  </div>
                ))}
                {paradas.length === 0 && (
                  <p className="text-xs text-muted-foreground text-center py-4">Toca el mapa para agregar la primera parada (será el punto A).</p>
                )}
              </div>
            </TabsContent>

            <TabsContent value="tarifas" className="space-y-3 mt-3">
              <Tabs value={sentido} onValueChange={(v) => setSentido(v as Sentido)}>
                <TabsList className="grid grid-cols-2 w-full">
                  <TabsTrigger value="ida">🟢 IDA (A → B)</TabsTrigger>
                  <TabsTrigger value="vuelta">🟠 VUELTA (B → A)</TabsTrigger>
                </TabsList>
              </Tabs>
              <p className="text-xs text-muted-foreground">
                Fila = parada donde sube. Columna = parada donde baja. Llena solo lo que aplique; las celdas grises no son válidas en este sentido.
              </p>
              <div className="overflow-x-auto border rounded-md">
                <table className="w-full text-xs border-collapse">
                  <thead>
                    <tr className="bg-muted">
                      <th className="p-2 text-left sticky left-0 bg-muted">Sube ↓ / Baja →</th>
                      {cols.map((c, i) => (
                        <th key={c.tempId} className="p-2 text-center min-w-[80px]">{paradas.indexOf(c) + 1}. {c.nombre}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {filas.map((f, fi) => (
                      <tr key={f.tempId} className="border-t">
                        <td className="p-2 font-medium sticky left-0 bg-card">{paradas.indexOf(f) + 1}. {f.nombre}</td>
                        {cols.map((c, ci) => {
                          const valido = tarifaValida(sentido, fi, ci);
                          if (!valido) return <td key={c.tempId} className="p-1 bg-muted/30" />;
                          return (
                            <td key={c.tempId} className="p-1">
                              <Input
                                type="number" min={0} step="0.5"
                                value={getPrecio(sentido, f.tempId, c.tempId) || ""}
                                onChange={(e) => setPrecio(sentido, f.tempId, c.tempId, Math.max(0, parseFloat(e.target.value) || 0))}
                                className="h-8 text-xs text-center"
                                placeholder="$"
                              />
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </TabsContent>
          </Tabs>
        )}

        <Button onClick={handleSave} disabled={saving || loading} className="w-full">
          {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
          Guardar paradas y tarifas
        </Button>
      </DialogContent>
    </Dialog>
  );
}
