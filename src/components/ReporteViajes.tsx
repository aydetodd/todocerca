import { useEffect, useState, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, Calendar, MapPin, RefreshCw } from "lucide-react";
import { getHermosilloToday } from "@/lib/utils";

interface ReporteViajesProps {
  proveedorId?: string;
}

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
  contratos_transporte?: { empresas_transporte?: { nombre?: string | null } | null } | null;
};

export function ReporteViajes({ proveedorId }: ReporteViajesProps) {
  const [loading, setLoading] = useState(true);
  const [periodo, setPeriodo] = useState<"hoy" | "semana" | "mes">("hoy");
  const [viajes, setViajes] = useState<ViajeRow[]>([]);

  const load = useCallback(async () => {
    if (!proveedorId) return;
    setLoading(true);

    // Fechas según periodo (Hermosillo)
    const today = getHermosilloToday();
    let desde = today;
    if (periodo === "semana") {
      const d = new Date(today);
      d.setDate(d.getDate() - 6);
      desde = d.toISOString().slice(0, 10);
    } else if (periodo === "mes") {
      const d = new Date(today);
      d.setDate(d.getDate() - 29);
      desde = d.toISOString().slice(0, 10);
    }

    // 1. Contratos del concesionario
    const { data: contratos } = await supabase
      .from("contratos_transporte")
      .select("id")
      .eq("concesionario_id", proveedorId);

    const contratoIds = (contratos || []).map((c: any) => c.id);
    if (contratoIds.length === 0) {
      setViajes([]);
      setLoading(false);
      return;
    }

    const { data, error } = await (supabase as any)
      .from("viajes_realizados")
      .select(`
        id, fecha, numero_viaje, estado, inicio_at, fin_at, chofer_id, unidad_id, contrato_id,
        choferes_empresa(nombre),
        unidades_empresa(numero_economico, placas),
        contratos_transporte(empresas_transporte(nombre))
      `)
      .in("contrato_id", contratoIds)
      .gte("fecha", desde)
      .order("fecha", { ascending: false })
      .order("numero_viaje", { ascending: false });

    if (error) {
      console.error("Error cargando viajes:", error);
      setViajes([]);
    } else {
      setViajes((data || []) as ViajeRow[]);
    }
    setLoading(false);
  }, [proveedorId, periodo]);

  useEffect(() => {
    load();
    if (!proveedorId) return;
    const ch = supabase
      .channel(`reporte_viajes_${proveedorId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "viajes_realizados" },
        () => load()
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [load, proveedorId]);

  // Agrupar por unidad
  const porUnidad = viajes.reduce<Record<string, { label: string; total: number; completados: number }>>((acc, v) => {
    const key = v.unidad_id || "sin_unidad";
    const label = v.unidades_empresa?.numero_economico
      ? `Eco. ${v.unidades_empresa.numero_economico}`
      : v.unidades_empresa?.placas || "Sin unidad";
    if (!acc[key]) acc[key] = { label, total: 0, completados: 0 };
    acc[key].total++;
    if (v.estado === "completado") acc[key].completados++;
    return acc;
  }, {});

  // Agrupar por chofer
  const porChofer = viajes.reduce<Record<string, { label: string; total: number; completados: number }>>((acc, v) => {
    const key = v.chofer_id;
    const label = v.choferes_empresa?.nombre || "Chofer";
    if (!acc[key]) acc[key] = { label, total: 0, completados: 0 };
    acc[key].total++;
    if (v.estado === "completado") acc[key].completados++;
    return acc;
  }, {});

  const totalCompletados = viajes.filter(v => v.estado === "completado").length;
  const totalEnCurso = viajes.filter(v => v.estado === "en_curso").length;

  return (
    <div className="space-y-3">
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <Calendar className="h-4 w-4" /> Reporte de viajes
            </CardTitle>
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={load} disabled={loading}>
              <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            </Button>
          </div>
          <div className="flex gap-1 mt-2">
            {(["hoy", "semana", "mes"] as const).map(p => (
              <Button
                key={p}
                size="sm"
                variant={periodo === p ? "default" : "outline"}
                className="h-7 text-xs capitalize"
                onClick={() => setPeriodo(p)}
              >
                {p === "hoy" ? "Hoy" : p === "semana" ? "Últimos 7 días" : "Últimos 30 días"}
              </Button>
            ))}
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex justify-center py-6">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3 mb-3">
              <div className="p-3 rounded-lg bg-primary/10 text-center">
                <p className="text-2xl font-bold text-primary">{totalCompletados}</p>
                <p className="text-[10px] text-muted-foreground">Completados</p>
              </div>
              <div className="p-3 rounded-lg bg-secondary/40 text-center">
                <p className="text-2xl font-bold text-foreground">{totalEnCurso}</p>
                <p className="text-[10px] text-muted-foreground">En curso</p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {!loading && viajes.length === 0 && (
        <Card>
          <CardContent className="p-6 text-center text-sm text-muted-foreground">
            Aún no hay viajes registrados en este periodo.
          </CardContent>
        </Card>
      )}

      {!loading && Object.keys(porUnidad).length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Por unidad</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1.5">
            {Object.entries(porUnidad).map(([k, v]) => (
              <div key={k} className="flex items-center justify-between text-xs py-1.5 border-b border-border last:border-0">
                <span className="font-medium">{v.label}</span>
                <Badge variant="outline">{v.completados} completados</Badge>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {!loading && Object.keys(porChofer).length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Por chofer</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1.5">
            {Object.entries(porChofer).map(([k, v]) => (
              <div key={k} className="flex items-center justify-between text-xs py-1.5 border-b border-border last:border-0">
                <span className="font-medium">{v.label}</span>
                <Badge variant="outline">{v.completados} completados</Badge>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {!loading && viajes.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Detalle ({viajes.length})</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {viajes.slice(0, 50).map(v => (
              <div key={v.id} className="text-xs p-2 rounded border border-border space-y-0.5">
                <div className="flex items-center justify-between">
                  <span className="font-semibold">
                    Viaje #{v.numero_viaje} · {v.fecha}
                  </span>
                  <Badge variant={v.estado === "completado" ? "default" : "secondary"} className="text-[10px]">
                    {v.estado === "completado" ? "✓ Completado" : v.estado === "en_curso" ? "En curso" : "Cancelado"}
                  </Badge>
                </div>
                <div className="text-muted-foreground flex items-center gap-1">
                  <MapPin className="h-3 w-3" />
                  {v.choferes_empresa?.nombre || "Chofer"} ·{" "}
                  {v.unidades_empresa?.numero_economico ? `Eco. ${v.unidades_empresa.numero_economico}` : "Sin unidad"} ·{" "}
                  {v.contratos_transporte?.empresas_transporte?.nombre || "—"}
                </div>
                {v.inicio_at && (
                  <div className="text-[10px] text-muted-foreground">
                    {new Date(v.inicio_at).toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" })}
                    {v.fin_at && ` → ${new Date(v.fin_at).toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" })}`}
                  </div>
                )}
              </div>
            ))}
            {viajes.length > 50 && (
              <p className="text-[10px] text-center text-muted-foreground pt-2">
                Mostrando 50 de {viajes.length} viajes
              </p>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
