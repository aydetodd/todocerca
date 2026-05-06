import { useEffect, useState, useCallback, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, Calendar, Filter, RefreshCw, Download } from "lucide-react";
import { getHermosilloToday } from "@/lib/utils";
import { downloadCSV } from "@/lib/csvExport";

interface ReporteViajesProps {
  proveedorId?: string;
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
  choferes_empresa?: { nombre?: string | null } | null;
  unidades_empresa?: { numero_economico?: string | null; placas?: string | null } | null;
};

export function ReporteViajes({ proveedorId }: ReporteViajesProps) {
  const [loading, setLoading] = useState(true);
  const [periodo, setPeriodo] = useState<Periodo>("hoy");
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");
  const [filterUnidad, setFilterUnidad] = useState("all");
  const [filterChofer, setFilterChofer] = useState("all");
  const [filterRuta, setFilterRuta] = useState("all");
  const [viajes, setViajes] = useState<ViajeRow[]>([]);
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
      const [uRes, cRes, contratosRes, prodRes] = await Promise.all([
        supabase.from("unidades_empresa").select("id, nombre, numero_economico, placas")
          .eq("proveedor_id", proveedorId).neq("transport_type", "taxi"),
        supabase.from("choferes_empresa").select("id, nombre, user_id")
          .eq("proveedor_id", proveedorId).eq("is_active", true),
        supabase.from("contratos_transporte").select("id").eq("concesionario_id", proveedorId),
        supabase.from("productos").select("id, nombre")
          .eq("proveedor_id", proveedorId).eq("route_type", "privada").eq("is_private", true)
          .order("nombre"),
      ]);

      setUnidades((uRes.data || []).map((u: any) => ({
        id: u.id,
        label: `${u.numero_economico || u.nombre || "Unidad"}${u.placas ? ` · ${u.placas}` : ""}`,
      })));
      setChoferes((cRes.data || []).map((c: any) => ({ id: c.id, nombre: c.nombre || "Chofer" })));
      setRutas((prodRes.data || []).map((p: any) => ({ id: p.id, nombre: p.nombre || "Sin nombre" })));

      const choferIds = (cRes.data || []).map((c: any) => c.id);
      if (choferIds.length > 0) {
        const { data: asigData } = await supabase
          .from("asignaciones_chofer")
          .select("chofer_id, unidad_id, producto_id, fecha")
          .in("chofer_id", choferIds);
        setAsignaciones(asigData || []);
      }
    })();
  }, [proveedorId]);

  const load = useCallback(async () => {
    if (!proveedorId) return;
    setLoading(true);

    const { desde, hasta } = getRange();

    const { data: contratos } = await supabase
      .from("contratos_transporte").select("id").eq("concesionario_id", proveedorId);
    const contratoIds = (contratos || []).map((c: any) => c.id);
    if (contratoIds.length === 0) { setViajes([]); setLoading(false); return; }

    // Ampliamos 1 día atrás para capturar viajes en_curso iniciados antes de medianoche
    const desdeMinus1 = (() => {
      const d = new Date(desde + "T00:00:00Z");
      d.setUTCDate(d.getUTCDate() - 1);
      return d.toISOString().slice(0, 10);
    })();

    const { data, error } = await (supabase as any)
      .from("viajes_realizados")
      .select(`
        id, fecha, numero_viaje, estado, inicio_at, fin_at, chofer_id, unidad_id, contrato_id,
        choferes_empresa(nombre),
        unidades_empresa(numero_economico, placas)
      `)
      .in("contrato_id", contratoIds)
      .gte("fecha", desdeMinus1)
      .lte("fecha", hasta)
      .order("fecha", { ascending: false })
      .order("numero_viaje", { ascending: false });

    // Filtramos: dentro del rango, o en_curso aunque haya iniciado el día previo
    const inRange = (v: any) =>
      (v.fecha >= desde && v.fecha <= hasta) ||
      (v.estado === "en_curso" && v.fecha >= desdeMinus1);

    if (error) { console.error(error); setViajes([]); }
    else setViajes(((data || []) as ViajeRow[]).filter(inRange));
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

  // Helper: resolver producto_id (ruta) de un viaje vía asignaciones (chofer + fecha más cercana <= fecha)
  const resolveProductoId = useCallback((v: ViajeRow): string | null => {
    const candidates = asignaciones
      .filter((a) => a.chofer_id === v.chofer_id && a.fecha <= v.fecha)
      .sort((a, b) => (b.fecha > a.fecha ? 1 : -1));
    return candidates[0]?.producto_id || null;
  }, [asignaciones]);

  const enriched = useMemo(() => viajes.map((v) => ({
    ...v,
    producto_id: resolveProductoId(v),
  })), [viajes, resolveProductoId]);

  const filtered = useMemo(() => enriched.filter((v) => {
    if (filterUnidad !== "all" && v.unidad_id !== filterUnidad) return false;
    if (filterChofer !== "all" && v.chofer_id !== filterChofer) return false;
    if (filterRuta !== "all" && v.producto_id !== filterRuta) return false;
    return true;
  }), [enriched, filterUnidad, filterChofer, filterRuta]);

  const today = getHermosilloToday();
  const completadosHoy = filtered.filter((v) => v.fecha === today && v.estado === "completado").length;
  const enCursoHoy = filtered.filter((v) => v.fecha === today && v.estado === "en_curso").length;

  // Desgloses
  const porUnidad = filtered.reduce<Record<string, { label: string; total: number }>>((acc, v) => {
    const key = v.unidad_id || "sin";
    const label = v.unidades_empresa?.numero_economico
      ? `Eco. ${v.unidades_empresa.numero_economico}`
      : v.unidades_empresa?.placas || "Sin unidad";
    if (!acc[key]) acc[key] = { label, total: 0 };
    if (v.estado === "completado") acc[key].total++;
    return acc;
  }, {});

  const porChofer = filtered.reduce<Record<string, { label: string; total: number }>>((acc, v) => {
    const key = v.chofer_id;
    const label = v.choferes_empresa?.nombre || "Chofer";
    if (!acc[key]) acc[key] = { label, total: 0 };
    if (v.estado === "completado") acc[key].total++;
    return acc;
  }, {});

  const rutasMap = useMemo(() => {
    const m: Record<string, string> = {};
    rutas.forEach((r) => { m[r.id] = r.nombre; });
    return m;
  }, [rutas]);

  const porRuta = filtered.reduce<Record<string, { label: string; total: number }>>((acc, v) => {
    const key = v.producto_id || "sin";
    const label = v.producto_id ? (rutasMap[v.producto_id] || "Ruta") : "Sin ruta";
    if (!acc[key]) acc[key] = { label, total: 0 };
    if (v.estado === "completado") acc[key].total++;
    return acc;
  }, {});

  const handleExport = () => {
    const rows = filtered.map((v) => [
      v.fecha,
      String(v.numero_viaje),
      v.estado,
      v.unidades_empresa?.numero_economico || "",
      v.unidades_empresa?.placas || "",
      v.choferes_empresa?.nombre || "",
      v.producto_id ? (rutasMap[v.producto_id] || "") : "",
      v.inicio_at || "",
      v.fin_at || "",
    ]);
    downloadCSV(
      `reporte-viajes-${getRange().desde}_a_${getRange().hasta}.csv`,
      ["Fecha", "Viaje #", "Estado", "Eco.", "Placas", "Chofer", "Ruta", "Inicio", "Fin"],
      rows
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
                <SelectItem value="hoy">Hoy (12:01 am - 12:00 pm)</SelectItem>
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
            <Calendar className="h-4 w-4" /> Hoy (12:01 am – 12:00 pm)
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex justify-center py-6">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : (
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

      {!loading && filtered.length > 0 && (
        <>
          <Card>
            <CardHeader className="pb-2 flex flex-row items-center justify-between">
              <CardTitle className="text-sm">Desglose por unidad, chofer y ruta</CardTitle>
              <Button size="sm" variant="outline" onClick={handleExport}>
                <Download className="h-3 w-3 mr-1" /> CSV
              </Button>
            </CardHeader>
            <CardContent className="space-y-3">
              <div>
                <p className="text-xs font-semibold mb-1">Por unidad</p>
                {Object.entries(porUnidad).map(([k, v]) => (
                  <div key={k} className="flex items-center justify-between text-xs py-1 border-b border-border last:border-0">
                    <span>{v.label}</span>
                    <Badge variant="outline">{v.total} viajes</Badge>
                  </div>
                ))}
              </div>
              <div>
                <p className="text-xs font-semibold mb-1">Por chofer</p>
                {Object.entries(porChofer).map(([k, v]) => (
                  <div key={k} className="flex items-center justify-between text-xs py-1 border-b border-border last:border-0">
                    <span>{v.label}</span>
                    <Badge variant="outline">{v.total} viajes</Badge>
                  </div>
                ))}
              </div>
              <div>
                <p className="text-xs font-semibold mb-1">Por ruta</p>
                {Object.entries(porRuta).map(([k, v]) => (
                  <div key={k} className="flex items-center justify-between text-xs py-1 border-b border-border last:border-0">
                    <span>{v.label}</span>
                    <Badge variant="outline">{v.total} viajes</Badge>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
