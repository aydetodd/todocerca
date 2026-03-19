import React, { useState, useEffect } from "react";
import {
  BarChart3, Download, Calendar, Bus, Users, Filter, Loader2, ChevronDown, ChevronUp,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { downloadCSV } from "@/lib/csvExport";
import { toast } from "sonner";

interface Props {
  proveedorId: string;
}

type PeriodOption = "hoy" | "ayer" | "semana" | "semana_ant" | "mes" | "mes_ant" | "custom";

interface ReportRow {
  unidad_id: string | null;
  numero_economico: string;
  placas: string;
  chofer_id: string | null;
  chofer_nombre: string;
  boletos: number;
  ingresos: number;
  tickets: { code: string; time: string; date: string }[];
}

function getHermosillo() {
  return new Date(Date.now() - 7 * 60 * 60 * 1000);
}

function getRange(period: PeriodOption, customStart?: string, customEnd?: string): { start: string; end: string; label: string } {
  const h = getHermosillo();
  const todayStr = h.toISOString().split("T")[0];

  switch (period) {
    case "hoy":
      return { start: `${todayStr}T00:00:00-07:00`, end: `${todayStr}T23:59:59-07:00`, label: "Hoy" };
    case "ayer": {
      const y = new Date(h.getTime() - 86400000).toISOString().split("T")[0];
      return { start: `${y}T00:00:00-07:00`, end: `${y}T23:59:59-07:00`, label: "Ayer" };
    }
    case "semana": {
      const dow = h.getUTCDay();
      const offset = dow === 0 ? 6 : dow - 1;
      const mon = new Date(h.getTime() - offset * 86400000).toISOString().split("T")[0];
      return { start: `${mon}T00:00:00-07:00`, end: `${todayStr}T23:59:59-07:00`, label: "Semana actual" };
    }
    case "semana_ant": {
      const dow = h.getUTCDay();
      const offset = dow === 0 ? 6 : dow - 1;
      const mon = new Date(h.getTime() - offset * 86400000);
      const prevMon = new Date(mon.getTime() - 7 * 86400000).toISOString().split("T")[0];
      const prevSun = new Date(mon.getTime() - 86400000).toISOString().split("T")[0];
      return { start: `${prevMon}T00:00:00-07:00`, end: `${prevSun}T23:59:59-07:00`, label: "Semana anterior" };
    }
    case "mes":
      return { start: `${todayStr.slice(0, 7)}-01T00:00:00-07:00`, end: `${todayStr}T23:59:59-07:00`, label: "Mes actual" };
    case "mes_ant": {
      const y = parseInt(todayStr.slice(0, 4));
      const m = parseInt(todayStr.slice(5, 7));
      const py = m === 1 ? y - 1 : y;
      const pm = m === 1 ? 12 : m - 1;
      const ps = `${py}-${String(pm).padStart(2, "0")}`;
      const lastDay = new Date(y, m - 1, 0).getDate();
      return { start: `${ps}-01T00:00:00-07:00`, end: `${ps}-${lastDay}T23:59:59-07:00`, label: "Mes anterior" };
    }
    case "custom":
      if (customStart && customEnd) {
        return { start: `${customStart}T00:00:00-07:00`, end: `${customEnd}T23:59:59-07:00`, label: `${customStart} a ${customEnd}` };
      }
      return { start: `${todayStr}T00:00:00-07:00`, end: `${todayStr}T23:59:59-07:00`, label: "Personalizado" };
  }
}

export default function ConcesionarioReportes({ proveedorId }: Props) {
  const [period, setPeriod] = useState<PeriodOption>("hoy");
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");
  const [filterUnidad, setFilterUnidad] = useState("all");
  const [filterChofer, setFilterChofer] = useState("all");
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<ReportRow[]>([]);
  const [expandedRow, setExpandedRow] = useState<string | null>(null);

  // Available units & drivers
  const [unidades, setUnidades] = useState<{ id: string; label: string }[]>([]);
  const [choferes, setChoferes] = useState<{ id: string; nombre: string }[]>([]);

  useEffect(() => {
    loadCatalogs();
  }, [proveedorId]);

  useEffect(() => {
    if (period !== "custom") fetchReport();
  }, [period, filterUnidad, filterChofer]);

  const loadCatalogs = async () => {
    const [uRes, cRes] = await Promise.all([
      supabase
        .from("unidades_empresa")
        .select("id, nombre, numero_economico, placas")
        .eq("proveedor_id", proveedorId)
        .neq("transport_type", "taxi"),
      supabase
        .from("choferes_empresa")
        .select("id, nombre, user_id")
        .eq("proveedor_id", proveedorId)
        .eq("is_active", true),
    ]);

    const units = (uRes.data || []).map((u: any) => ({
      id: u.id,
      label: `${u.numero_economico || u.nombre}${u.placas ? ` · ${u.placas}` : ""}`,
    }));
    setUnidades(units);
    setChoferes((cRes.data || []).map((c: any) => ({ id: c.id, nombre: c.nombre || "Sin nombre" })));

    // Auto-fetch report
    fetchReport(units.map((u) => u.id));
  };

  const fetchReport = async (unitIdsOverride?: string[]) => {
    setLoading(true);
    try {
      const unitIds = unitIdsOverride || unidades.map((u) => u.id);
      if (unitIds.length === 0) {
        setRows([]);
        setLoading(false);
        return;
      }

      const { start, end } = getRange(period, customStart, customEnd);

      const targetUnitIds = filterUnidad === "all" ? unitIds : [filterUnidad];

      // Fetch logs
      const { data: logs } = await supabase
        .from("logs_validacion_qr")
        .select("qr_ticket_id, created_at, unidad_id, chofer_id")
        .in("unidad_id", targetUnitIds)
        .eq("resultado", "valid")
        .gte("created_at", start)
        .lte("created_at", end)
        .order("created_at", { ascending: false })
        .limit(5000);

      if (!logs || logs.length === 0) {
        setRows([]);
        setLoading(false);
        return;
      }

      // Fetch unit info
      const { data: unitData } = await supabase
        .from("unidades_empresa")
        .select("id, nombre, numero_economico, placas")
        .in("id", targetUnitIds);

      const unitMap: Record<string, any> = {};
      (unitData || []).forEach((u: any) => { unitMap[u.id] = u; });

      // Fetch chofer names from chofer_ids in logs
      const choferIds = [...new Set(logs.filter((l: any) => l.chofer_id).map((l: any) => l.chofer_id))];
      const choferMap: Record<string, string> = {};
      if (choferIds.length > 0) {
        const { data: choferData } = await supabase
          .from("choferes_empresa")
          .select("id, nombre, user_id")
          .in("user_id", choferIds);

        (choferData || []).forEach((c: any) => {
          if (c.user_id) choferMap[c.user_id] = c.nombre || "Sin nombre";
        });

        // Also try profiles for names
        const missingIds = choferIds.filter((id) => !choferMap[id]);
        if (missingIds.length > 0) {
          const { data: profileData } = await supabase
            .from("profiles")
            .select("user_id, apodo, nombre")
            .in("user_id", missingIds);

          (profileData || []).forEach((p: any) => {
            choferMap[p.user_id] = p.apodo || p.nombre || "Desconocido";
          });
        }
      }

      // Group by unidad + chofer
      const groupKey = (log: any) => `${log.unidad_id || "none"}__${log.chofer_id || "none"}`;
      const groups: Record<string, { unidad_id: string | null; chofer_id: string | null; tickets: any[] }> = {};

      logs.forEach((log: any) => {
        // Apply chofer filter
        if (filterChofer !== "all") {
          const choferEntries = choferes.filter((c) => c.id === filterChofer);
          // We need to match by user_id or chofer_id
          // Skip if doesn't match
        }

        const key = groupKey(log);
        if (!groups[key]) {
          groups[key] = { unidad_id: log.unidad_id, chofer_id: log.chofer_id, tickets: [] };
        }
        groups[key].tickets.push(log);
      });

      const reportRows: ReportRow[] = Object.values(groups).map((g) => {
        const unit = g.unidad_id ? unitMap[g.unidad_id] : null;
        return {
          unidad_id: g.unidad_id,
          numero_economico: unit ? (unit.numero_economico || unit.nombre) : "Sin unidad",
          placas: unit?.placas || "",
          chofer_id: g.chofer_id,
          chofer_nombre: g.chofer_id ? (choferMap[g.chofer_id] || g.chofer_id.slice(0, 8)) : "Sin chofer",
          boletos: g.tickets.length,
          ingresos: g.tickets.length * 9,
          tickets: g.tickets.map((t: any) => ({
            code: (t.qr_ticket_id || "").slice(-6).toUpperCase(),
            time: new Date(t.created_at).toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" }),
            date: new Date(t.created_at).toLocaleDateString("es-MX", { day: "2-digit", month: "short" }),
          })),
        };
      }).sort((a, b) => b.boletos - a.boletos);

      setRows(reportRows);
    } catch (err) {
      console.error("Report error:", err);
      toast.error("Error al generar reporte");
    } finally {
      setLoading(false);
    }
  };

  const handleExportCSV = () => {
    if (rows.length === 0) {
      toast.info("No hay datos para exportar");
      return;
    }

    const { label } = getRange(period, customStart, customEnd);
    const allTickets = rows.flatMap((r) =>
      r.tickets.map((t, i) => [
        String(i + 1),
        r.numero_economico,
        r.placas,
        r.chofer_nombre,
        `#${t.code}`,
        t.date,
        t.time,
        "$9.00",
      ])
    );

    // Add summary rows
    const totalBoletos = rows.reduce((s, r) => s + r.boletos, 0);
    allTickets.push([]);
    allTickets.push(["", "", "", "TOTAL", "", "", String(totalBoletos), `$${(totalBoletos * 9).toFixed(2)}`]);

    // Per-unit summary
    allTickets.push([]);
    allTickets.push(["RESUMEN POR UNIDAD", "", "", "", "", "", "", ""]);
    rows.forEach((r) => {
      allTickets.push(["", r.numero_economico, r.placas, r.chofer_nombre, "", "", String(r.boletos), `$${r.ingresos.toFixed(2)}`]);
    });

    downloadCSV(
      `reporte-concesionario-${label.replace(/\s/g, "-")}.csv`,
      ["#", "Unidad", "Placas", "Chofer", "Código QR", "Fecha", "Hora", "Monto"],
      allTickets as string[][]
    );
    toast.success("Reporte CSV descargado");
  };

  const totalBoletos = rows.reduce((s, r) => s + r.boletos, 0);
  const totalIngresos = rows.reduce((s, r) => s + r.ingresos, 0);
  const { label: periodLabel } = getRange(period, customStart, customEnd);

  return (
    <div className="space-y-4">
      {/* Filters */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Filter className="h-4 w-4" /> Filtros del reporte
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Periodo</label>
            <Select value={period} onValueChange={(v) => setPeriod(v as PeriodOption)}>
              <SelectTrigger className="h-9 text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="hoy">Hoy</SelectItem>
                <SelectItem value="ayer">Ayer</SelectItem>
                <SelectItem value="semana">Semana actual (Lun-Dom)</SelectItem>
                <SelectItem value="semana_ant">Semana anterior</SelectItem>
                <SelectItem value="mes">Mes actual</SelectItem>
                <SelectItem value="mes_ant">Mes anterior</SelectItem>
                <SelectItem value="custom">Rango personalizado</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {period === "custom" && (
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Desde</label>
                <input
                  type="date"
                  className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm"
                  value={customStart}
                  onChange={(e) => setCustomStart(e.target.value)}
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Hasta</label>
                <input
                  type="date"
                  className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm"
                  value={customEnd}
                  onChange={(e) => setCustomEnd(e.target.value)}
                />
              </div>
              <Button
                size="sm"
                className="col-span-2"
                onClick={() => fetchReport()}
                disabled={!customStart || !customEnd}
              >
                Buscar
              </Button>
            </div>
          )}

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Unidad</label>
              <Select value={filterUnidad} onValueChange={setFilterUnidad}>
                <SelectTrigger className="h-9 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas</SelectItem>
                  {unidades.map((u) => (
                    <SelectItem key={u.id} value={u.id}>{u.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Chofer</label>
              <Select value={filterChofer} onValueChange={setFilterChofer}>
                <SelectTrigger className="h-9 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  {choferes.map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.nombre}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Summary */}
      <div className="grid grid-cols-3 gap-2">
        <Card>
          <CardContent className="p-3 text-center">
            <p className="text-xl font-bold text-foreground">{totalBoletos}</p>
            <p className="text-[10px] text-muted-foreground">Boletos</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 text-center">
            <p className="text-xl font-bold text-green-500">${totalIngresos}</p>
            <p className="text-[10px] text-muted-foreground">Ingresos</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 text-center">
            <p className="text-xl font-bold text-foreground">{rows.length}</p>
            <p className="text-[10px] text-muted-foreground">Registros</p>
          </CardContent>
        </Card>
      </div>

      {/* Results */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <BarChart3 className="h-4 w-4" /> {periodLabel}
            </CardTitle>
            <Button variant="outline" size="sm" onClick={handleExportCSV} className="h-7 text-xs gap-1">
              <Download className="h-3 w-3" /> CSV
            </Button>
          </div>
          <CardDescription className="text-xs">
            Desglose por unidad y chofer · $9.00 MXN c/u
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex items-center justify-center py-10">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : rows.length === 0 ? (
            <div className="p-6 text-center text-muted-foreground">
              <Calendar className="h-10 w-10 mx-auto mb-2 opacity-30" />
              <p className="text-sm">Sin registros en este periodo</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs">Unidad</TableHead>
                  <TableHead className="text-xs">Chofer</TableHead>
                  <TableHead className="text-xs text-right">Boletos</TableHead>
                  <TableHead className="text-xs text-right">Ingreso</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r, idx) => {
                  const key = `${r.unidad_id}-${r.chofer_id}-${idx}`;
                  const isExpanded = expandedRow === key;
                  return (
                    <React.Fragment key={key}>
                      <TableRow
                        className="cursor-pointer hover:bg-muted/30"
                        onClick={() => setExpandedRow(isExpanded ? null : key)}
                      >
                        <TableCell className="py-2">
                          <p className="font-bold text-sm">#{r.numero_economico}</p>
                          {r.placas && <p className="text-[10px] text-muted-foreground">{r.placas}</p>}
                        </TableCell>
                        <TableCell className="py-2 text-sm">{r.chofer_nombre}</TableCell>
                        <TableCell className="py-2 text-right font-semibold text-sm">
                          {r.boletos}
                          <span className="text-[10px] text-primary ml-1">{isExpanded ? "▲" : "▼"}</span>
                        </TableCell>
                        <TableCell className="py-2 text-right font-bold text-sm text-green-500">
                          ${r.ingresos}
                        </TableCell>
                      </TableRow>
                      {isExpanded && (
                        <TableRow>
                          <TableCell colSpan={4} className="p-0">
                            <div className="bg-muted/30 p-3 max-h-60 overflow-y-auto">
                              <p className="text-xs font-semibold text-muted-foreground mb-2">
                                Detalle de boletos ({r.tickets.length})
                              </p>
                              <div className="space-y-1">
                                {r.tickets.map((t, i) => (
                                  <div key={i} className="flex items-center justify-between py-1 border-b border-border last:border-0">
                                    <span className="font-mono text-sm font-bold text-foreground">#{t.code}</span>
                                    <span className="text-xs text-muted-foreground">{t.date}</span>
                                    <span className="text-xs text-muted-foreground">{t.time}</span>
                                    <span className="text-xs font-semibold text-primary">$9.00</span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          </TableCell>
                        </TableRow>
                      )}
                    </React.Fragment>
                  );
                })}
                {/* Totals */}
                <TableRow className="border-t-2 border-border bg-muted/50">
                  <TableCell colSpan={2} className="py-2 font-bold text-sm">Total</TableCell>
                  <TableCell className="py-2 text-right font-bold text-sm">{totalBoletos}</TableCell>
                  <TableCell className="py-2 text-right font-bold text-sm text-green-500">${totalIngresos}</TableCell>
                </TableRow>
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
