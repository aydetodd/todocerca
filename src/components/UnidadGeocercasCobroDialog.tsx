import { useEffect, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Loader2, Plus, Trash2, Save, DollarSign } from "lucide-react";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  unidadId?: string | null;
  productoId?: string | null;
  unitName?: string;
}

type Zona = {
  id?: string;
  nombre: string;
  lat: number;
  lng: number;
  radio_m: number;
  precio_mxn: number;
};

type Sentido = "ida" | "vuelta";

const COLORS: Record<Sentido, string> = { ida: "#16a34a", vuelta: "#ea580c" };

export default function UnidadGeocercasCobroDialog({ open, onOpenChange, unidadId, productoId, unitName }: Props) {
  const { toast } = useToast();
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const layersRef = useRef<L.LayerGroup | null>(null);
  const traceRef = useRef<L.Polyline | null>(null);
  const abMarkersRef = useRef<L.LayerGroup | null>(null);

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [sentido, setSentido] = useState<Sentido>("ida");
  const [zonas, setZonas] = useState<Record<Sentido, Zona[]>>({ ida: [], vuelta: [] });

  const sentidoRef = useRef(sentido);
  sentidoRef.current = sentido;
  const zonasRef = useRef(zonas);
  zonasRef.current = zonas;

  useEffect(() => {
    if (!open || (!unidadId && !productoId)) return;
    (async () => {
      setLoading(true);
      try {
        let q = supabase
          .from("unidad_geocercas_cobro" as any)
          .select("id, sentido, orden, nombre, lat, lng, radio_m, precio_mxn")
          .order("sentido")
          .order("orden");
        if (productoId) q = q.eq("producto_id", productoId);
        else if (unidadId) q = q.eq("unidad_id", unidadId);
        const { data: zonasData, error } = await q;
        if (error) throw error;
        const ida: Zona[] = [];
        const vuelta: Zona[] = [];
        (zonasData || []).forEach((z: any) => {
          const item: Zona = {
            id: z.id,
            nombre: z.nombre,
            lat: Number(z.lat),
            lng: Number(z.lng),
            radio_m: Number(z.radio_m),
            precio_mxn: Number(z.precio_mxn),
          };
          if (z.sentido === "ida") ida.push(item);
          else vuelta.push(item);
        });
        setZonas({ ida, vuelta });
      } catch (e: any) {
        toast({ title: "Error", description: e.message, variant: "destructive" });
      } finally {
        setLoading(false);
      }
    })();
  }, [open, unidadId, productoId, toast]);

  // Init map
  useEffect(() => {
    if (!open) return;
    let ro: ResizeObserver | null = null;
    const tryInit = async () => {
      if (!containerRef.current || mapRef.current) return;
      if (containerRef.current.clientHeight < 50 || containerRef.current.clientWidth < 50) return;
      const map = L.map(containerRef.current, { center: [27.4861, -109.9401], zoom: 11, attributionControl: false });
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19 }).addTo(map);
      mapRef.current = map;
      layersRef.current = L.layerGroup().addTo(map);
      abMarkersRef.current = L.layerGroup().addTo(map);
      [0, 100, 300, 700].forEach((d) => setTimeout(() => map.invalidateSize(), d));


      // Click → agregar zona al sentido activo
      map.on("click", (e: L.LeafletMouseEvent) => {
        const s = sentidoRef.current;
        const current = zonasRef.current[s];
        const nueva: Zona = {
          nombre: `Zona ${current.length + 1}`,
          lat: e.latlng.lat,
          lng: e.latlng.lng,
          radio_m: 200,
          precio_mxn: 0,
        };
        setZonas((prev) => ({ ...prev, [s]: [...prev[s], nueva] }));
      });

      // Cargar trazado + A/B (de unidad o de producto/ruta)
      try {
        let gj: any = null;
        let abPoints: { lat: number; lng: number; label: string; color: string; radius: number }[] = [];

        if (productoId) {
          const { data: p } = await supabase
            .from("productos")
            .select("route_geojson, route_origin_lat, route_origin_lng, route_destination_lat, route_destination_lng, route_geofence_radius_m")
            .eq("id", productoId)
            .maybeSingle();
          const pd = p as any;
          gj = pd?.route_geojson;
          if (pd?.route_origin_lat != null) abPoints.push({ lat: Number(pd.route_origin_lat), lng: Number(pd.route_origin_lng), label: "A", color: "#2563eb", radius: pd.route_geofence_radius_m || 150 });
          if (pd?.route_destination_lat != null) abPoints.push({ lat: Number(pd.route_destination_lat), lng: Number(pd.route_destination_lng), label: "B", color: "#7c3aed", radius: pd.route_geofence_radius_m || 150 });
        } else if (unidadId) {
          const { data: u } = await supabase
            .from("unidades_empresa")
            .select("punto_a_lat, punto_a_lng, punto_b_lat, punto_b_lng, geofence_radius_m")
            .eq("id", unidadId)
            .maybeSingle();
          const ud = u as any;
          if (ud?.punto_a_lat != null) abPoints.push({ lat: Number(ud.punto_a_lat), lng: Number(ud.punto_a_lng), label: "A", color: "#2563eb", radius: ud.geofence_radius_m || 150 });
          if (ud?.punto_b_lat != null) abPoints.push({ lat: Number(ud.punto_b_lat), lng: Number(ud.punto_b_lng), label: "B", color: "#7c3aed", radius: ud.geofence_radius_m || 150 });

          const { data: asign } = await supabase
            .from("asignaciones_chofer")
            .select("producto_id, fecha, created_at, productos:producto_id(route_geojson)")
            .eq("unidad_id", unidadId)
            .order("fecha", { ascending: false })
            .order("created_at", { ascending: false })
            .limit(1);
          gj = (asign?.[0] as any)?.productos?.route_geojson;
        }

        abPoints.forEach((pt) => {
          if (abMarkersRef.current) {
            L.circle([pt.lat, pt.lng], { radius: pt.radius, color: pt.color, weight: 2, fillOpacity: 0.1 })
              .bindTooltip(pt.label, { permanent: true, direction: "center" })
              .addTo(abMarkersRef.current);
          }
        });

        const all: L.LatLngExpression[] = [];
        if (gj?.features) {
          gj.features.forEach((f: any) => {
            if (f.geometry?.type === "LineString") {
              const coords = (f.geometry.coordinates as number[][]).map(([lng, lat]) => [lat, lng] as [number, number]);
              all.push(...coords);
              L.polyline(coords, { color: "#0066CC", weight: 4, opacity: 0.7 }).addTo(map);
            } else if (f.geometry?.type === "MultiLineString") {
              (f.geometry.coordinates as number[][][]).forEach((seg) => {
                const coords = seg.map(([lng, lat]) => [lat, lng] as [number, number]);
                all.push(...coords);
                L.polyline(coords, { color: "#0066CC", weight: 4, opacity: 0.7 }).addTo(map);
              });
            }
          });
        }
        abPoints.forEach((pt) => all.push([pt.lat, pt.lng]));
        if (all.length > 0) map.fitBounds(L.latLngBounds(all), { padding: [40, 40] });
      } catch (e) {
        console.warn("[GeocercasCobro] no se pudo cargar trazado", e);
      }
    };

    // Intentar de inmediato y observar cambios de tamaño hasta que tenga dimensiones
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
        layersRef.current = null;
        traceRef.current = null;
        abMarkersRef.current = null;
      }
    };
  }, [open, unidadId, productoId, loading]);

  // Redibujar círculos de zonas
  useEffect(() => {
    const map = mapRef.current;
    const layer = layersRef.current;
    if (!map || !layer) return;
    layer.clearLayers();

    (Object.keys(zonas) as Sentido[]).forEach((s) => {
      const isActive = s === sentido;
      zonas[s].forEach((z, idx) => {
        const color = COLORS[s];
        L.circle([z.lat, z.lng], {
          radius: z.radio_m,
          color,
          weight: isActive ? 3 : 1,
          fillOpacity: isActive ? 0.25 : 0.05,
          opacity: isActive ? 0.95 : 0.4,
        }).bindTooltip(`${s === "ida" ? "🟢" : "🟠"} ${z.nombre} · $${z.precio_mxn}`, { direction: "top" }).addTo(layer);

        // Marker draggable solo para el sentido activo
        if (isActive) {
          const m = L.marker([z.lat, z.lng], {
            draggable: true,
            icon: L.divIcon({
              className: "",
              html: `<div style="background:${color};color:#fff;border-radius:50%;width:24px;height:24px;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;border:2px solid #fff;box-shadow:0 0 4px rgba(0,0,0,.4)">${idx + 1}</div>`,
              iconSize: [24, 24],
              iconAnchor: [12, 12],
            }),
          }).addTo(layer);
          m.on("dragend", () => {
            const pos = m.getLatLng();
            setZonas((prev) => {
              const copy = [...prev[s]];
              copy[idx] = { ...copy[idx], lat: pos.lat, lng: pos.lng };
              return { ...prev, [s]: copy };
            });
          });
        }
      });
    });
  }, [zonas, sentido]);

  const updateZona = (s: Sentido, idx: number, patch: Partial<Zona>) => {
    setZonas((prev) => {
      const copy = [...prev[s]];
      copy[idx] = { ...copy[idx], ...patch };
      return { ...prev, [s]: copy };
    });
  };

  const removeZona = (s: Sentido, idx: number) => {
    setZonas((prev) => ({ ...prev, [s]: prev[s].filter((_, i) => i !== idx) }));
  };

  const handleSave = async () => {
    if (!unidadId && !productoId) return;
    setSaving(true);
    try {
      for (const s of ["ida", "vuelta"] as Sentido[]) {
        const payload = zonas[s].map((z) => ({
          nombre: z.nombre,
          lat: z.lat,
          lng: z.lng,
          radio_m: z.radio_m,
          precio_mxn: z.precio_mxn,
        }));
        const rpcName = productoId ? "rpc_producto_set_geocercas_cobro" : "rpc_unidad_set_geocercas_cobro";
        const args: any = productoId
          ? { _producto_id: productoId, _sentido: s, _zonas: payload }
          : { _unidad_id: unidadId, _sentido: s, _zonas: payload };
        const { error } = await (supabase as any).rpc(rpcName, args);
        if (error) throw error;
      }
      toast({ title: "Guardado", description: `Zonas de cobro actualizadas (${zonas.ida.length} ida, ${zonas.vuelta.length} vuelta)` });
      onOpenChange(false);
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const currentZonas = zonas[sentido];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[95vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <DollarSign className="h-5 w-5 text-primary" /> Geocercas de cobro
          </DialogTitle>
          <DialogDescription>
            {unitName ? `Unidad: ${unitName}` : "Zonas tarifarias por sentido"}
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex justify-center py-10">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground">
              Toca el mapa para agregar una zona de cobro al sentido activo. Las zonas de <b style={{ color: COLORS.ida }}>IDA (A→B)</b> y <b style={{ color: COLORS.vuelta }}>VUELTA (B→A)</b> son independientes.
            </p>

            <Tabs value={sentido} onValueChange={(v) => setSentido(v as Sentido)}>
              <TabsList className="grid grid-cols-2 w-full">
                <TabsTrigger value="ida">🟢 IDA (A→B) · {zonas.ida.length}</TabsTrigger>
                <TabsTrigger value="vuelta">🟠 VUELTA (B→A) · {zonas.vuelta.length}</TabsTrigger>
              </TabsList>

              <div ref={containerRef} style={{ height: 400 }} className="w-full rounded-md border border-border overflow-hidden mt-3" />

              <TabsContent value={sentido} className="mt-3 space-y-2">
                {currentZonas.length === 0 && (
                  <p className="text-xs text-muted-foreground text-center py-4">
                    Toca el mapa para agregar la primera zona de {sentido === "ida" ? "IDA" : "VUELTA"}.
                  </p>
                )}
                {currentZonas.map((z, idx) => (
                  <div key={idx} className="border border-border rounded-md p-2 space-y-2 bg-card">
                    <div className="flex items-center gap-2">
                      <span
                        className="inline-flex items-center justify-center w-6 h-6 rounded-full text-white text-xs font-bold"
                        style={{ background: COLORS[sentido] }}
                      >
                        {idx + 1}
                      </span>
                      <Input
                        value={z.nombre}
                        onChange={(e) => updateZona(sentido, idx, { nombre: e.target.value })}
                        className="h-8 text-sm flex-1"
                        placeholder="Nombre"
                      />
                      <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => removeZona(sentido, idx)}>
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <label className="flex items-center gap-1 text-[11px] text-muted-foreground">
                        Radio (m)
                        <Input
                          type="number" min={50} max={99999}
                          value={z.radio_m}
                          onChange={(e) => updateZona(sentido, idx, { radio_m: Math.max(50, Math.min(99999, parseInt(e.target.value) || 200)) })}
                          className="h-8 text-sm"
                        />
                      </label>
                      <label className="flex items-center gap-1 text-[11px] text-muted-foreground">
                        Precio MXN
                        <Input
                          type="number" min={0} step="0.5"
                          value={z.precio_mxn}
                          onChange={(e) => updateZona(sentido, idx, { precio_mxn: Math.max(0, parseFloat(e.target.value) || 0) })}
                          className="h-8 text-sm"
                        />
                      </label>
                    </div>
                  </div>
                ))}
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full"
                  onClick={() => {
                    const map = mapRef.current;
                    const c = map ? map.getCenter() : { lat: 29.0729, lng: -110.9559 };
                    const nueva: Zona = {
                      nombre: `Zona ${currentZonas.length + 1}`,
                      lat: c.lat, lng: c.lng,
                      radio_m: 200, precio_mxn: 0,
                    };
                    setZonas((prev) => ({ ...prev, [sentido]: [...prev[sentido], nueva] }));
                  }}
                >
                  <Plus className="h-4 w-4 mr-1" /> Agregar zona en centro del mapa
                </Button>
              </TabsContent>
            </Tabs>

            <Button onClick={handleSave} disabled={saving} className="w-full">
              {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
              Guardar geocercas
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
