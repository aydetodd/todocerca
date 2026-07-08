import { useEffect, useState, useCallback, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, Calendar, Filter, RefreshCw, Download, ChevronDown, ChevronRight } from "lucide-react";
import { getHermosilloToday } from "@/lib/utils";
import { downloadCSV } from "@/lib/csvExport";


interface ReporteViajesProps {
  proveedorId?: string;
  /** 'privada' (default) o 'foranea' — define qué tipo de rutas se incluyen y aísla el reporte. */
  routeFilterType?: 'privada' | 'foranea';
}

type Periodo = "hoy" | "ayer" | "semana" | "mes" | "custom";

type ViajeRow = {
  id: string;
  fecha: string;
  numero_viaje: number;
  estado: string;
  inicio_at: string | null;
  fin_at: string | null;
  chofer_id: string;
  unidad_id: string | null;
  contrato_id: string;
  producto_id: string | null;
  direccion: string | null;
  inicio_manual: boolean | null;
  fin_manual: boolean | null;
  pasajeros_subidos?: number | null;
  pasajeros_bajados?: number | null;
  pasajeros_a_bordo?: number | null;
  choferes_empresa?: { nombre?: string | null } | null;
  unidades_empresa?: { numero_economico?: string | null; placas?: string | null } | null;
  productos?: { nombre?: string | null } | null;
};

type PasajeroRow = {
  numero_subida: number | null;
  numero_bajada: number | null;
  subida_at: string | null;
  bajada_at: string | null;
  subida_lat: number | null;
  subida_lng: number | null;
  bajada_lat: number | null;
  bajada_lng: number | null;
  monto: number;
  estado: string | null;
};



export function ReporteViajes({ proveedorId, routeFilterType = 'privada' }: ReporteViajesProps) {
  const [loading, setLoading] = useState(true);
  const [periodo, setPeriodo] = useState<Periodo>("hoy");
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");
  const [filterUnidad, setFilterUnidad] = useState("all");
  const [filterChofer, setFilterChofer] = useState("all");
  const [filterRuta, setFilterRuta] = useState("all");
  const [viajes, setViajes] = useState<ViajeRow[]>([]);
  const [cobrosPorViaje, setCobrosPorViaje] = useState<Record<string, { monto: number; cobros: number }>>({});
  const [pasajerosPorViaje, setPasajerosPorViaje] = useState<Record<string, PasajeroRow[]>>({});
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [asignaciones, setAsignaciones] = useState<any[]>([]);
  const [unidades, setUnidades] = useState<{ id: string; label: string }[]>([]);
  const [choferes, setChoferes] = useState<{ id: string; nombre: string }[]>([]);
  const [rutas, setRutas] = useState<{ id: string; nombre: string }[]>([]);


  const getRange = useCallback((): { desde: string; hasta: string } => {
    const today = getHermosilloToday();
    const mk = (d: Date) => d.toISOString().slice(0, 10);
    if (periodo === "hoy") return { desde: today, hasta: today };
    if (periodo === "ayer") {
      const d = new Date(today);
      d.setDate(d.getDate() - 1);
      return { desde: mk(d), hasta: mk(d) };
    }
    if (periodo === "semana") {
      const d = new Date(today);
      d.setDate(d.getDate() - 6);
      return { desde: mk(d), hasta: today };
    }
    if (periodo === "mes") {
      const d = new Date(today);
      d.setDate(d.getDate() - 29);
      return { desde: mk(d), hasta: today };
    }
    if (periodo === "custom" && customStart && customEnd) {
      return { desde: customStart, hasta: customEnd };
    }
    return { desde: today, hasta: today };
  }, [periodo, customStart, customEnd]);

  // Load catalogs
  useEffect(() => {
    if (!proveedorId) return;
    (async () => {
      const [uRes, cRes, prodRes] = await Promise.all([
        supabase.from("unidades_empresa").select("id, nombre, numero_economico, placas")
          .eq("proveedor_id", proveedorId).neq("transport_type", "taxi"),
        supabase.from("choferes_empresa").select("id, nombre, user_id")
          .eq("proveedor_id", proveedorId).eq("is_active", true),
        supabase.from("productos").select("id, nombre")
          .eq("proveedor_id", proveedorId)
          .eq("route_type", routeFilterType)
          .eq("is_private", routeFilterType === 'privada')
          .order("nombre"),
      ]);

      const rutasFiltradas = (prodRes.data || []).map((p: any) => ({ id: p.id, nombre: p.nombre || "Sin nombre" }));
      setRutas(rutasFiltradas);
      const rutaIdsFiltrados = rutasFiltradas.map((r) => r.id);

      // Filtrar asignaciones SOLO de rutas privadas para evitar cruces con público
      const choferIds = (cRes.data || []).map((c: any) => c.id);
      let asigFiltradas: any[] = [];
      if (choferIds.length > 0 && rutaIdsFiltrados.length > 0) {
        const { data: asigData } = await supabase
          .from("asignaciones_chofer")
          .select("chofer_id, unidad_id, producto_id, fecha")
          .in("chofer_id", choferIds)
          .in("producto_id", rutaIdsFiltrados);
        asigFiltradas = asigData || [];
      }
      setAsignaciones(asigFiltradas);

      // Sólo choferes y unidades que aparecen en asignaciones privadas
      const choferIdsPrivados = new Set(asigFiltradas.map((a) => a.chofer_id));
      const unidadIdsPrivadas = new Set(asigFiltradas.map((a) => a.unidad_id).filter(Boolean));

      setUnidades((uRes.data || [])
        .filter((u: any) => unidadIdsPrivadas.has(u.id))
        .map((u: any) => ({
          id: u.id,
          label: `${u.numero_economico || u.nombre || "Unidad"}${u.placas ? ` · ${u.placas}` : ""}`,
        })));
      setChoferes((cRes.data || [])
        .filter((c: any) => choferIdsPrivados.has(c.id))
        .map((c: any) => ({ id: c.id, nombre: c.nombre || "Chofer" })));
    })();
  }, [proveedorId, routeFilterType]);

  const load = useCallback(async () => {
    if (!proveedorId) return;
    setLoading(true);

    const { desde, hasta } = getRange();

    const [{ data: contratos }, { data: choferesProv }] = await Promise.all([
      supabase.from("contratos_transporte").select("id").eq("concesionario_id", proveedorId),
      supabase.from("choferes_empresa").select("id").eq("proveedor_id", proveedorId),
    ]);
    const contratoIds = (contratos || []).map((c: any) => c.id);
    const choferIds = (choferesProv || []).map((c: any) => c.id);
    if (contratoIds.length === 0 && choferIds.length === 0) { setViajes([]); setLoading(false); return; }

    // Ampliamos 1 día atrás para capturar viajes en_curso iniciados antes de medianoche
    const desdeMinus1 = (() => {
      const d = new Date(desde + "T00:00:00Z");
      d.setUTCDate(d.getUTCDate() - 1);
      return d.toISOString().slice(0, 10);
    })();

    // Filtro OR: viajes vinculados al contrato del concesionario, o viajes de sus choferes
    const orFilters: string[] = [];
    if (contratoIds.length > 0) orFilters.push(`contrato_id.in.(${contratoIds.join(",")})`);
    if (choferIds.length > 0) orFilters.push(`chofer_id.in.(${choferIds.join(",")})`);

    const { data, error } = await (supabase as any)
      .from("viajes_realizados")
      .select(`
        id, fecha, numero_viaje, estado, inicio_at, fin_at, chofer_id, unidad_id, contrato_id,
        producto_id, direccion, inicio_manual, fin_manual,
        pasajeros_subidos, pasajeros_bajados, pasajeros_a_bordo,
        choferes_empresa(nombre),
        unidades_empresa(numero_economico, placas),
        productos(nombre)
      `)
      .or(orFilters.join(","))
      .gte("fecha", desdeMinus1)
      .lte("fecha", hasta)
      .order("fecha", { ascending: false })
      .order("numero_viaje", { ascending: false });

    // Filtramos: dentro del rango, o en_curso aunque haya iniciado el día previo
    const inRange = (v: any) =>
      (v.fecha >= desde && v.fecha <= hasta) ||
      (v.estado === "en_curso" && v.fecha >= desdeMinus1);

    if (error) { console.error(error); setViajes([]); setCobrosPorViaje({}); setLoading(false); return; }
    const rows = ((data || []) as ViajeRow[]).filter(inRange);
    setViajes(rows);

    // Cargar importes cobrados por viaje + detalle anónimo de pasajeros (para mapa de calor)
    const viajeIds = rows.map((v) => v.id);
    const totals: Record<string, { monto: number; cobros: number }> = {};
    const pasajeros: Record<string, PasajeroRow[]> = {};
    if (viajeIds.length > 0) {
      const [{ data: qvp }, { data: cqt }] = await Promise.all([
        supabase.from("qard_viajes_pasajero")
          .select("viaje_id, monto_cobrado_mxn, numero_subida, numero_bajada, subida_at, bajada_at, subida_lat, subida_lng, bajada_lat, bajada_lng, estado")
          .in("viaje_id", viajeIds),
        supabase.from("cobros_qr_tramo").select("viaje_id, precio_real").in("viaje_id", viajeIds),
      ]);
      (qvp || []).forEach((r: any) => {
        if (!r.viaje_id) return;
        const t = totals[r.viaje_id] ||= { monto: 0, cobros: 0 };
        t.monto += Number(r.monto_cobrado_mxn) || 0;
        t.cobros += 1;
        (pasajeros[r.viaje_id] ||= []).push({
          numero_subida: r.numero_subida ?? null,
          numero_bajada: r.numero_bajada ?? null,
          subida_at: r.subida_at ?? null,
          bajada_at: r.bajada_at ?? null,
          subida_lat: r.subida_lat ?? null,
          subida_lng: r.subida_lng ?? null,
          bajada_lat: r.bajada_lat ?? null,
          bajada_lng: r.bajada_lng ?? null,
          monto: Number(r.monto_cobrado_mxn) || 0,
          estado: r.estado ?? null,
        });
      });
      (cqt || []).forEach((r: any) => {
        if (!r.viaje_id) return;
        const t = totals[r.viaje_id] ||= { monto: 0, cobros: 0 };
        t.monto += Number(r.precio_real) || 0;
        t.cobros += 1;
      });
    }
    // Ordenar pasajeros por número de subida
    Object.keys(pasajeros).forEach((k) => {
      pasajeros[k].sort((a, b) => (a.numero_subida ?? 999) - (b.numero_subida ?? 999));
    });
    setCobrosPorViaje(totals);
    setPasajerosPorViaje(pasajeros);
    setLoading(false);
  }, [proveedorId, getRange]);



  useEffect(() => {
    if (periodo !== "custom") load();
  }, [load, periodo]);

  useEffect(() => {
    if (!proveedorId) return;
    const ch = supabase
      .channel(`reporte_viajes_${proveedorId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "viajes_realizados" }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [load, proveedorId]);

  // Resolver ruta: usar SIEMPRE el producto_id del propio viaje (datos reales),
  // y solo si está vacío caer al fallback de asignaciones del chofer.
  const resolveProductoId = useCallback((v: ViajeRow): string | null => {
    if (v.producto_id) return v.producto_id;
    const candidates = asignaciones
      .filter((a) => a.chofer_id === v.chofer_id && a.fecha <= v.fecha)
      .sort((a, b) => (b.fecha > a.fecha ? 1 : -1));
    return candidates[0]?.producto_id || null;
  }, [asignaciones]);

  const enriched = useMemo(() => viajes.map((v) => ({
    ...v,
    producto_id_resolved: resolveProductoId(v),
  })), [viajes, resolveProductoId]);

  const filtered = useMemo(() => enriched.filter((v) => {
    if (filterUnidad !== "all" && v.unidad_id !== filterUnidad) return false;
    if (filterChofer !== "all" && v.chofer_id !== filterChofer) return false;
    if (filterRuta !== "all" && v.producto_id_resolved !== filterRuta) return false;
    return true;
  }), [enriched, filterUnidad, filterChofer, filterRuta]);

  const today = getHermosilloToday();
  const completadosHoy = filtered.filter((v) => v.fecha === today && v.estado === "completado").length;
  const enCursoHoy = filtered.filter((v) => v.estado === "en_curso").length;
  const totalSubidos = filtered.reduce((s, v) => s + (v.pasajeros_subidos ?? 0), 0);
  const totalBajados = filtered.reduce((s, v) => s + (v.pasajeros_bajados ?? 0), 0);
  const totalABordo = filtered.reduce((s, v) => s + (v.pasajeros_a_bordo ?? 0), 0);
  const totalCobrado = filtered.reduce((s, v) => s + (cobrosPorViaje[v.id]?.monto || 0), 0);
  const totalCobros = filtered.reduce((s, v) => s + (cobrosPorViaje[v.id]?.cobros || 0), 0);
  const fmtMoney = (n: number) => `$${n.toLocaleString("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  const rutasMap = useMemo(() => {
    const m: Record<string, string> = {};
    rutas.forEach((r) => { m[r.id] = r.nombre; });
    return m;
  }, [rutas]);

  const getRutaLabel = (v: typeof filtered[number]) => {
    if (v.productos?.nombre) return v.productos.nombre.trim();
    if (v.producto_id_resolved && rutasMap[v.producto_id_resolved]) return rutasMap[v.producto_id_resolved].trim();
    return "Sin ruta";
  };
  const getUnidadLabel = (v: typeof filtered[number]) =>
    v.unidades_empresa?.numero_economico
      ? `Eco. ${v.unidades_empresa.numero_economico}`
      : v.unidades_empresa?.placas || "Sin unidad";
  const getChoferLabel = (v: typeof filtered[number]) =>
    v.choferes_empresa?.nombre || "Chofer";

  const fmtTime = (iso: string | null) => {
    if (!iso) return "—";
    return new Date(iso).toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit", timeZone: "America/Hermosillo" });
  };

  const fmtDate = (iso: string | null) => {
    if (!iso) return "";
    return new Date(iso).toLocaleDateString("es-MX", { day: "2-digit", month: "short", timeZone: "America/Hermosillo" });
  };

  const handleExport = () => {
    const rows = filtered.map((v) => [
      v.fecha,
      String(v.numero_viaje),
      v.direccion || "",
      v.estado,
      v.unidades_empresa?.numero_economico || "",
      v.unidades_empresa?.placas || "",
      v.choferes_empresa?.nombre || "",
      getRutaLabel(v),
      v.inicio_at || "",
      v.fin_at || "",
      v.inicio_manual ? "Manual" : "GPS",
      v.fin_manual ? "Manual" : "GPS",
      String(v.pasajeros_subidos ?? 0),
      String(v.pasajeros_bajados ?? 0),
      String(v.pasajeros_a_bordo ?? 0),
      String(cobrosPorViaje[v.id]?.cobros ?? 0),
      (cobrosPorViaje[v.id]?.monto ?? 0).toFixed(2),
    ]);
    downloadCSV(
      `reporte-viajes-${getRange().desde}_a_${getRange().hasta}.csv`,
      ["Fecha", "Viaje #", "Sentido", "Estado", "Eco.", "Placas", "Chofer", "Ruta", "Inicio", "Fin", "Inicio src", "Fin src", "Suben", "Bajan", "A bordo", "Cobros", "Importe MXN"],
      rows
    );
  };

  // CSV anónimo por pasajero (para armar mapa de calor). Sin QaRd, sin nombre.
  const handleExportPasajeros = () => {
    const rows: string[][] = [];
    filtered.forEach((v) => {
      const lista = pasajerosPorViaje[v.id] || [];
      lista.forEach((p) => {
        rows.push([
          v.fecha,
          String(v.numero_viaje),
          getRutaLabel(v),
          getUnidadLabel(v),
          getChoferLabel(v),
          p.numero_subida != null ? `Sub#${p.numero_subida}` : "",
          p.numero_bajada != null ? `Baj#${p.numero_bajada} → Sub#${p.numero_subida ?? "?"}` : "",
          p.subida_at || "",
          p.subida_lat != null ? String(p.subida_lat) : "",
          p.subida_lng != null ? String(p.subida_lng) : "",
          p.bajada_at || "",
          p.bajada_lat != null ? String(p.bajada_lat) : "",
          p.bajada_lng != null ? String(p.bajada_lng) : "",
          (p.monto || 0).toFixed(2),
          p.estado || "",
        ]);
      });
    });
    downloadCSV(
      `pasajeros-anonimo-${getRange().desde}_a_${getRange().hasta}.csv`,
      ["Fecha","Viaje #","Ruta","Unidad","Chofer","Subida","Bajada (ligada a subida)","Hora subida","Lat subida","Lng subida","Hora bajada","Lat bajada","Lng bajada","Importe MXN","Estado"],
      rows,
    );
  };



  return (
    <div className="space-y-3">
      {/* Filtros */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <Filter className="h-4 w-4" /> Filtros del reporte
            </CardTitle>
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={load} disabled={loading}>
              <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Periodo</label>
            <Select value={periodo} onValueChange={(v) => setPeriodo(v as Periodo)}>
              <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="hoy">Hoy (12:00 am - 11:59 pm)</SelectItem>
                <SelectItem value="ayer">Ayer</SelectItem>
                <SelectItem value="semana">Últimos 7 días</SelectItem>
                <SelectItem value="mes">Últimos 30 días</SelectItem>
                <SelectItem value="custom">Rango personalizado</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {periodo === "custom" && (
            <div className="grid grid-cols-2 gap-2">
              <input type="date" className="h-9 rounded-md border border-input bg-background px-3 text-sm"
                value={customStart} onChange={(e) => setCustomStart(e.target.value)} />
              <input type="date" className="h-9 rounded-md border border-input bg-background px-3 text-sm"
                value={customEnd} onChange={(e) => setCustomEnd(e.target.value)} />
              <Button size="sm" className="col-span-2" onClick={load} disabled={!customStart || !customEnd}>
                Buscar
              </Button>
            </div>
          )}

          <div className="grid grid-cols-3 gap-2">
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Unidad</label>
              <Select value={filterUnidad} onValueChange={setFilterUnidad}>
                <SelectTrigger className="h-9 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas</SelectItem>
                  {unidades.map((u) => <SelectItem key={u.id} value={u.id}>{u.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Chofer</label>
              <Select value={filterChofer} onValueChange={setFilterChofer}>
                <SelectTrigger className="h-9 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  {choferes.map((c) => <SelectItem key={c.id} value={c.id}>{c.nombre}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Ruta</label>
              <Select value={filterRuta} onValueChange={setFilterRuta}>
                <SelectTrigger className="h-9 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas</SelectItem>
                  {rutas.map((r) => <SelectItem key={r.id} value={r.id}>{r.nombre}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Hoy: completados / en curso / registros */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <Calendar className="h-4 w-4" /> Hoy (12:00 am – 11:59 pm)
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex justify-center py-6">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <div className="space-y-2">
              <div className="grid grid-cols-3 gap-2">
                <div className="p-3 rounded-lg bg-primary/10 text-center">
                  <p className="text-2xl font-bold text-primary">{completadosHoy}</p>
                  <p className="text-[10px] text-muted-foreground">Completados</p>
                </div>
                <div className="p-3 rounded-lg bg-secondary/40 text-center">
                  <p className="text-2xl font-bold text-foreground">{enCursoHoy}</p>
                  <p className="text-[10px] text-muted-foreground">En curso</p>
                </div>
                <div className="p-3 rounded-lg bg-muted/40 text-center">
                  <p className="text-2xl font-bold text-foreground">{filtered.length}</p>
                  <p className="text-[10px] text-muted-foreground">Registros</p>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <div className="p-3 rounded-lg bg-emerald-500/10 text-center">
                  <p className="text-2xl font-bold text-emerald-600">↑{totalSubidos}</p>
                  <p className="text-[10px] text-muted-foreground">Pasajeros subieron</p>
                </div>
                <div className="p-3 rounded-lg bg-amber-500/10 text-center">
                  <p className="text-2xl font-bold text-amber-600">↓{totalBajados}</p>
                  <p className="text-[10px] text-muted-foreground">Bajaron</p>
                </div>
                <div className="p-3 rounded-lg bg-blue-500/10 text-center">
                  <p className="text-2xl font-bold text-blue-600">{totalABordo}</p>
                  <p className="text-[10px] text-muted-foreground">En stand (a bordo)</p>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="p-3 rounded-lg bg-violet-500/10 text-center">
                  <p className="text-2xl font-bold text-violet-600">{totalCobros}</p>
                  <p className="text-[10px] text-muted-foreground">Cobros al bajar</p>
                </div>
                <div className="p-3 rounded-lg bg-primary/15 text-center">
                  <p className="text-2xl font-bold text-primary">{fmtMoney(totalCobrado)}</p>
                  <p className="text-[10px] text-muted-foreground">Importe cobrado</p>
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Desgloses + Exportar */}
      {!loading && filtered.length === 0 && (
        <Card>
          <CardContent className="p-6 text-center text-sm text-muted-foreground">
            Aún no hay viajes registrados en este periodo.
          </CardContent>
        </Card>
      )}

      {!loading && filtered.length > 0 && (() => {
        // Agrupado: Ruta → Unidad → Chofer → viajes
        type Bucket = {
          rutaId: string; rutaLabel: string;
          unidadId: string; unidadLabel: string;
          choferId: string; choferLabel: string;
          viajes: typeof filtered;
        };
        const groups = new Map<string, Bucket>();
        filtered.forEach((v) => {
          const rId = v.producto_id_resolved || "sin-ruta";
          const uId = v.unidad_id || "sin-unidad";
          const cId = v.chofer_id || "sin-chofer";
          const key = `${rId}|${uId}|${cId}`;
          if (!groups.has(key)) {
            groups.set(key, {
              rutaId: rId, rutaLabel: getRutaLabel(v),
              unidadId: uId, unidadLabel: getUnidadLabel(v),
              choferId: cId, choferLabel: getChoferLabel(v),
              viajes: [] as any,
            });
          }
          (groups.get(key)!.viajes as any).push(v);
        });
        const buckets = Array.from(groups.values()).sort((a, b) =>
          a.rutaLabel.localeCompare(b.rutaLabel) || a.unidadLabel.localeCompare(b.unidadLabel)
        );

        return (
          <Card>
            <CardHeader className="pb-2 flex flex-row items-center justify-between gap-2">
              <CardTitle className="text-sm">Detalle de viajes</CardTitle>
              <div className="flex gap-1">
                <Button size="sm" variant="outline" onClick={handleExport}>
                  <Download className="h-3 w-3 mr-1" /> CSV viajes
                </Button>
                <Button size="sm" variant="outline" onClick={handleExportPasajeros} title="Datos anónimos por pasajero (sin QaRd) con coordenadas para armar mapa de calor">
                  <Download className="h-3 w-3 mr-1" /> CSV mapa de calor
                </Button>
              </div>
            </CardHeader>

            <CardContent className="space-y-4">
              {buckets.map((b) => {
                const completados = b.viajes.filter((v) => v.estado === "completado").length;
                const totalSuben = b.viajes.reduce((s, v) => s + (v.pasajeros_subidos ?? 0), 0);
                const totalBajan = b.viajes.reduce((s, v) => s + (v.pasajeros_bajados ?? 0), 0);
                const totalStand = b.viajes.reduce((s, v) => s + (v.pasajeros_a_bordo ?? 0), 0);
                const totalImporte = b.viajes.reduce((s, v) => s + (cobrosPorViaje[v.id]?.monto || 0), 0);
                const totalCobrosB = b.viajes.reduce((s, v) => s + (cobrosPorViaje[v.id]?.cobros || 0), 0);
                return (
                  <div key={`${b.rutaId}-${b.unidadId}-${b.choferId}`} className="rounded-lg border border-border overflow-hidden">
                    <div className="bg-muted/40 px-3 py-2 flex flex-col gap-1">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-xs font-semibold truncate">{b.rutaLabel}</p>
                        <Badge variant="outline" className="text-[10px] shrink-0">{completados} viajes</Badge>
                      </div>
                      <p className="text-[11px] text-muted-foreground truncate">
                        {b.unidadLabel} · {b.choferLabel}
                      </p>
                      <div className="flex flex-wrap items-center gap-1 pt-0.5">
                        <Badge className="text-[10px] bg-emerald-100 text-emerald-700 border-0">↑{totalSuben} subieron</Badge>
                        <Badge className="text-[10px] bg-amber-100 text-amber-700 border-0">↓{totalBajan} bajaron</Badge>
                        <Badge className="text-[10px] bg-blue-100 text-blue-700 border-0">{totalStand} en stand</Badge>
                        <Badge className="text-[10px] bg-violet-100 text-violet-700 border-0">{totalCobrosB} cobros</Badge>
                        <Badge className="text-[10px] bg-primary/15 text-primary border-0">{fmtMoney(totalImporte)}</Badge>
                      </div>
                    </div>
                    <div className="divide-y divide-border">
                      {b.viajes.map((v) => {
                        const sentido = v.direccion || "—";
                        const enCurso = v.estado === "en_curso";
                        const flagManual = v.inicio_manual || v.fin_manual;
                        const sub = v.pasajeros_subidos ?? 0;
                        const baj = v.pasajeros_bajados ?? 0;
                        const abordo = v.pasajeros_a_bordo ?? 0;
                        const pax = pasajerosPorViaje[v.id] || [];
                        const isOpen = !!expanded[v.id];
                        return (
                          <div key={v.id} className="text-xs">
                            <button
                              type="button"
                              onClick={() => setExpanded((e) => ({ ...e, [v.id]: !e[v.id] }))}
                              className="w-full px-3 py-2 flex items-center justify-between gap-2 hover:bg-muted/30 text-left"
                            >
                              <div className="flex items-center gap-2 min-w-0 flex-wrap">
                                {pax.length > 0 ? (
                                  <span className="inline-flex items-center gap-0.5 text-primary font-semibold text-[10px] bg-primary/10 rounded px-1.5 py-0.5 shrink-0">
                                    {isOpen ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                                    {isOpen ? "Ocultar" : `Ver ${pax.length} pasajeros`}
                                  </span>
                                ) : <span className="w-3" />}
                                <span className="font-semibold">#{v.numero_viaje}</span>
                                <Badge variant="secondary" className="text-[10px] px-1.5 py-0">{sentido}</Badge>
                                {flagManual && <Badge variant="outline" className="text-[10px] px-1.5 py-0">Manual</Badge>}
                                {enCurso && <Badge className="text-[10px] px-1.5 py-0 bg-primary/20 text-primary border-0">En curso</Badge>}
                                <span className="text-[10px] text-emerald-700 font-medium">↑{sub} ↓{baj} · {abordo} en stand</span>
                                {(cobrosPorViaje[v.id]?.cobros ?? 0) > 0 && (
                                  <span className="text-[10px] font-semibold text-primary">
                                    {cobrosPorViaje[v.id].cobros} cobros · {fmtMoney(cobrosPorViaje[v.id].monto)}
                                  </span>
                                )}
                              </div>
                              <span className="text-muted-foreground shrink-0 tabular-nums text-right">
                                <span className="block text-[10px] opacity-70">{fmtDate(v.inicio_at || v.fecha)}</span>
                                {fmtTime(v.inicio_at)} → {enCurso ? "…" : fmtTime(v.fin_at)}
                              </span>
                            </button>
                            {isOpen && pax.length > 0 && (
                              <div className="bg-muted/20 px-3 py-2 space-y-1">
                                <p className="text-[10px] text-muted-foreground">
                                  Pasajeros anónimos (sin identificar). Se numeran al subir; al bajar se liga al número de subida.
                                </p>
                                <div className="grid grid-cols-[auto_auto_1fr_auto] gap-x-2 gap-y-0.5 text-[11px]">
                                  <span className="font-semibold">Subida</span>
                                  <span className="font-semibold">Bajada</span>
                                  <span className="font-semibold">Coordenadas (sube → baja)</span>
                                  <span className="font-semibold text-right">Importe</span>
                                  {pax.map((p, i) => (
                                    <div key={i} className="contents">
                                      <span className="text-emerald-700">
                                        {p.numero_subida != null ? `#${p.numero_subida}` : "—"}
                                        <span className="opacity-60 ml-1">{fmtTime(p.subida_at)}</span>
                                      </span>
                                      <span className="text-amber-700">
                                        {p.numero_bajada != null
                                          ? `Baj#${p.numero_bajada} (era Sub#${p.numero_subida ?? "?"})`
                                          : <span className="text-muted-foreground">a bordo</span>}
                                        {p.bajada_at && <span className="opacity-60 ml-1">{fmtTime(p.bajada_at)}</span>}
                                      </span>
                                      <span className="text-muted-foreground tabular-nums truncate">
                                        {p.subida_lat != null ? `${p.subida_lat.toFixed(5)}, ${p.subida_lng?.toFixed(5)}` : "—"}
                                        {" → "}
                                        {p.bajada_lat != null ? `${p.bajada_lat.toFixed(5)}, ${p.bajada_lng?.toFixed(5)}` : "…"}
                                      </span>
                                      <span className="text-right tabular-nums">{p.monto > 0 ? fmtMoney(p.monto) : "—"}</span>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}


            </CardContent>
          </Card>
        );
      })()}
    </div>
  );
}
