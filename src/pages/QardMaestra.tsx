import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { toast } from "@/hooks/use-toast";
import BackButton from "@/components/BackButton";
import { downloadCSV } from "@/lib/csvExport";
import {
  BarChart, Bar, PieChart, Pie, Cell, LineChart, Line,
  XAxis, YAxis, Tooltip, ResponsiveContainer, Legend,
} from "recharts";
import {
  Loader2, Download, FileText, Wallet, TrendingUp, TrendingDown,
  ShieldCheck, Search, ArrowUpDown,
} from "lucide-react";

type Tipo = "account_opening" | "reload_fee" | "withdrawal_fee";

type Comision = {
  id: string;
  user_id: string | null;
  qard_number: string | null;
  transaction_type: Tipo;
  amount: number;
  original_amount: number | null;
  percentage: number | null;
  description: string | null;
  spei_tracking_key: string | null;
  created_at: string;
};

type Maestra = {
  qard_number: string;
  name: string;
  current_balance: number;
  total_commissions_earned: number;
  total_account_openings: number;
  total_reload_fees: number;
  total_withdrawal_fees: number;
  last_reconciliation: string | null;
};

const ETIQUETA: Record<Tipo, string> = {
  account_opening: "Apertura de cuenta",
  reload_fee: "Comisión por recarga",
  withdrawal_fee: "Comisión por retiro",
};

const COLOR: Record<Tipo, string> = {
  account_opening: "hsl(var(--primary))",
  reload_fee: "hsl(160 84% 39%)",
  withdrawal_fee: "hsl(38 92% 50%)",
};

const RANGOS = [
  { id: "hoy", label: "Hoy" },
  { id: "7d", label: "Últimos 7 días" },
  { id: "mes", label: "Este mes" },
  { id: "mes_ant", label: "Mes anterior" },
  { id: "30d", label: "Últimos 30 días" },
  { id: "anio", label: "Año fiscal" },
  { id: "custom", label: "Rango a la medida" },
] as const;
type RangoId = typeof RANGOS[number]["id"];

const pesos = (n: number) =>
  `$${Number(n || 0).toLocaleString("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

// Fechas en horario de Hermosillo (UTC-7)
function hoyHermosillo(): Date {
  const ahora = new Date();
  return new Date(ahora.getTime() - 7 * 60 * 60 * 1000);
}

function rangoFechas(id: RangoId, desde: string, hasta: string): { ini: Date; fin: Date; iniPrev: Date; finPrev: Date } {
  const h = hoyHermosillo();
  const y = h.getUTCFullYear(), m = h.getUTCMonth(), d = h.getUTCDate();
  const dia = (yy: number, mm: number, dd: number) => new Date(Date.UTC(yy, mm, dd, 7, 0, 0));
  let ini: Date, fin: Date;

  switch (id) {
    case "hoy": ini = dia(y, m, d); fin = dia(y, m, d + 1); break;
    case "7d": ini = dia(y, m, d - 6); fin = dia(y, m, d + 1); break;
    case "mes": ini = dia(y, m, 1); fin = dia(y, m, d + 1); break;
    case "mes_ant": ini = dia(y, m - 1, 1); fin = dia(y, m, 1); break;
    case "30d": ini = dia(y, m, d - 29); fin = dia(y, m, d + 1); break;
    case "anio": ini = dia(y, 0, 1); fin = dia(y, m, d + 1); break;
    default:
      ini = desde ? new Date(`${desde}T07:00:00.000Z`) : dia(y, m, 1);
      fin = hasta ? new Date(new Date(`${hasta}T07:00:00.000Z`).getTime() + 86400000) : dia(y, m, d + 1);
  }
  const dur = fin.getTime() - ini.getTime();
  return { ini, fin, iniPrev: new Date(ini.getTime() - dur), finPrev: new Date(ini.getTime()) };
}

export default function QardMaestra() {
  const navigate = useNavigate();
  const [cargando, setCargando] = useState(true);
  const [autorizado, setAutorizado] = useState(false);
  const [maestra, setMaestra] = useState<Maestra | null>(null);
  const [filas, setFilas] = useState<Comision[]>([]);
  const [previas, setPrevias] = useState<number>(0);
  const [nombres, setNombres] = useState<Record<string, string>>({});

  const [rango, setRango] = useState<RangoId>("mes");
  const [desde, setDesde] = useState("");
  const [hasta, setHasta] = useState("");
  const [tipo, setTipo] = useState<Tipo | "todas">("todas");
  const [busqueda, setBusqueda] = useState("");
  const [orden, setOrden] = useState<{ campo: "created_at" | "amount" | "transaction_type"; asc: boolean }>({
    campo: "created_at", asc: false,
  });

  // Solo el administrador maestro
  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { navigate("/auth"); return; }
      const { data } = await supabase.rpc("is_admin" as any);
      if (data !== true) { setAutorizado(false); setCargando(false); return; }
      setAutorizado(true);
    })();
  }, [navigate]);

  const cargar = async () => {
    setCargando(true);
    const { ini, fin, iniPrev, finPrev } = rangoFechas(rango, desde, hasta);

    let q = supabase
      .from("commission_transactions" as any)
      .select("*")
      .gte("created_at", ini.toISOString())
      .lt("created_at", fin.toISOString())
      .order("created_at", { ascending: false })
      .limit(1000);
    if (tipo !== "todas") q = q.eq("transaction_type", tipo);

    const [{ data: cuenta }, { data: rows }, { data: prev }] = await Promise.all([
      supabase.from("master_qard_account" as any).select("*").maybeSingle(),
      q,
      supabase
        .from("commission_transactions" as any)
        .select("amount")
        .gte("created_at", iniPrev.toISOString())
        .lt("created_at", finPrev.toISOString()),
    ]);

    setMaestra(cuenta ? ({
      ...(cuenta as any),
      current_balance: Number((cuenta as any).current_balance),
      total_commissions_earned: Number((cuenta as any).total_commissions_earned),
      total_withdrawal_fees: Number((cuenta as any).total_withdrawal_fees),
    } as Maestra) : null);

    const lista = ((rows as any[]) ?? []).map(r => ({ ...r, amount: Number(r.amount), original_amount: r.original_amount === null ? null : Number(r.original_amount) })) as Comision[];
    setFilas(lista);
    setPrevias(((prev as any[]) ?? []).reduce((s, r) => s + Number(r.amount), 0));

    const ids = Array.from(new Set(lista.map(f => f.user_id).filter(Boolean))) as string[];
    if (ids.length) {
      const { data: profs } = await supabase.from("profiles").select("user_id, apodo, nombre").in("user_id", ids);
      const mapa: Record<string, string> = {};
      (profs ?? []).forEach((p: any) => { mapa[p.user_id] = p.apodo || p.nombre || "Usuario"; });
      setNombres(mapa);
    } else setNombres({});

    setCargando(false);
  };

  useEffect(() => { if (autorizado) void cargar(); /* eslint-disable-next-line */ }, [autorizado, rango, tipo, desde, hasta]);

  const visibles = useMemo(() => {
    const t = busqueda.trim().toLowerCase();
    const filtradas = !t ? filas : filas.filter(f =>
      (f.qard_number ?? "").includes(t.replace(/\D/g, "")) && t.replace(/\D/g, "") !== ""
      || (nombres[f.user_id ?? ""] ?? "").toLowerCase().includes(t)
      || (f.spei_tracking_key ?? "").toLowerCase().includes(t)
      || String(f.amount).includes(t)
    );
    const dir = orden.asc ? 1 : -1;
    return [...filtradas].sort((a, b) => {
      if (orden.campo === "amount") return (a.amount - b.amount) * dir;
      if (orden.campo === "transaction_type") return a.transaction_type.localeCompare(b.transaction_type) * dir;
      return (new Date(a.created_at).getTime() - new Date(b.created_at).getTime()) * dir;
    });
  }, [filas, busqueda, orden, nombres]);

  const resumen = useMemo(() => {
    const por = (t: Tipo) => filas.filter(f => f.transaction_type === t);
    const suma = (arr: Comision[]) => arr.reduce((s, f) => s + f.amount, 0);
    const total = suma(filas);
    const { ini, fin } = rangoFechas(rango, desde, hasta);
    const dias = Math.max(1, Math.round((Math.min(fin.getTime(), Date.now()) - ini.getTime()) / 86400000));
    return {
      total,
      cantidad: filas.length,
      promedioDiario: total / dias,
      proyeccionMensual: (total / dias) * 30,
      crecimiento: previas > 0 ? ((total - previas) / previas) * 100 : null,
      aperturas: { n: por("account_opening").length, m: suma(por("account_opening")) },
      recargas: { n: por("reload_fee").length, m: suma(por("reload_fee")) },
      retiros: { n: por("withdrawal_fee").length, m: suma(por("withdrawal_fee")) },
    };
  }, [filas, previas, rango, desde, hasta]);

  const porDia = useMemo(() => {
    const mapa: Record<string, number> = {};
    filas.forEach(f => {
      const dia = new Date(new Date(f.created_at).getTime() - 7 * 3600 * 1000).toISOString().slice(0, 10);
      mapa[dia] = (mapa[dia] ?? 0) + f.amount;
    });
    const dias = Object.keys(mapa).sort();
    let acumulado = 0;
    return dias.map(d => {
      acumulado += mapa[d];
      return { dia: d.slice(5), monto: +mapa[d].toFixed(2), acumulado: +acumulado.toFixed(2) };
    });
  }, [filas]);

  const pastel = useMemo(() => ([
    { name: ETIQUETA.account_opening, value: +resumen.aperturas.m.toFixed(2), tipo: "account_opening" as Tipo },
    { name: ETIQUETA.reload_fee, value: +resumen.recargas.m.toFixed(2), tipo: "reload_fee" as Tipo },
    { name: ETIQUETA.withdrawal_fee, value: +resumen.retiros.m.toFixed(2), tipo: "withdrawal_fee" as Tipo },
  ].filter(p => p.value > 0)), [resumen]);

  const conciliacion = useMemo(() => {
    if (!maestra) return null;
    const dif = Math.abs(maestra.total_commissions_earned - maestra.current_balance);
    return {
      dif,
      color: dif === 0 ? "bg-emerald-500" : dif < 100 ? "bg-amber-500" : "bg-destructive",
      texto: dif === 0 ? "Cuadra perfecto" : dif < 100 ? `Diferencia menor: ${pesos(dif)}` : `Revisar: ${pesos(dif)}`,
    };
  }, [maestra]);

  const exportarCsv = () => {
    downloadCSV(
      `qard-maestra-${new Date().toISOString().slice(0, 10)}.csv`,
      ["Fecha", "Tipo", "Usuario", "QaRd", "Monto original", "Comisión", "Concepto", "Clave de rastreo"],
      visibles.map(f => [
        new Date(f.created_at).toLocaleString("es-MX"),
        ETIQUETA[f.transaction_type],
        nombres[f.user_id ?? ""] ?? "Sistema",
        f.qard_number ?? "—",
        f.original_amount != null ? f.original_amount.toFixed(2) : "",
        f.amount.toFixed(2),
        f.description ?? "",
        f.spei_tracking_key ?? "",
      ]),
    );
    toast({ title: "Reporte descargado" });
  };

  const exportarPdf = async () => {
    const { default: jsPDF } = await import("jspdf");
    const doc = new jsPDF();
    doc.setFontSize(16);
    doc.text("TodoCerca · QaRd Maestra", 14, 18);
    doc.setFontSize(10);
    doc.text(`Periodo: ${RANGOS.find(r => r.id === rango)?.label}`, 14, 26);
    doc.text(`Total de comisiones: ${pesos(resumen.total)}  ·  Operaciones: ${resumen.cantidad}`, 14, 32);
    doc.text(`Aperturas: ${resumen.aperturas.n} (${pesos(resumen.aperturas.m)})`, 14, 38);
    doc.text(`Recargas: ${resumen.recargas.n} (${pesos(resumen.recargas.m)})`, 14, 44);
    doc.text(`Retiros: ${resumen.retiros.n} (${pesos(resumen.retiros.m)})`, 14, 50);
    let y = 60;
    doc.text("Fecha            Tipo                   Usuario           Comisión", 14, y);
    visibles.slice(0, 40).forEach(f => {
      y += 6;
      if (y > 280) { doc.addPage(); y = 20; }
      doc.text(
        `${new Date(f.created_at).toLocaleDateString("es-MX")}  ${ETIQUETA[f.transaction_type].padEnd(22).slice(0, 22)} ${(nombres[f.user_id ?? ""] ?? "Sistema").padEnd(16).slice(0, 16)} ${pesos(f.amount)}`,
        14, y,
      );
    });
    doc.save(`qard-maestra-${new Date().toISOString().slice(0, 10)}.pdf`);
  };

  if (cargando && !maestra) {
    return <div className="min-h-screen flex items-center justify-center"><Loader2 className="h-6 w-6 animate-spin" /></div>;
  }

  if (!autorizado) {
    return (
      <div className="min-h-screen p-4 pb-40">
        <BackButton />
        <Card className="mt-4"><CardContent className="p-6 text-center text-sm text-muted-foreground">
          Esta pantalla es exclusiva del administrador.
        </CardContent></Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen p-4 pb-40 space-y-4">
      <BackButton />

      <div className="flex items-center gap-2">
        <ShieldCheck className="h-5 w-5 text-primary" />
        <h1 className="text-xl font-bold">QaRd Maestra de TodoCerca</h1>
      </div>

      <Card>
        <CardContent className="p-4 space-y-1">
          <p className="font-mono text-lg tracking-widest">5200 0000 0000 0100</p>
          <p className="text-3xl font-bold">{pesos(maestra?.current_balance ?? 0)}</p>
          <p className="text-xs text-muted-foreground">
            Histórico: {pesos(maestra?.total_commissions_earned ?? 0)} ·
            {" "}{maestra?.total_account_openings ?? 0} aperturas ·
            {" "}{maestra?.total_reload_fees ?? 0} recargas
          </p>
          {conciliacion && (
            <div className="flex items-center gap-2 pt-2">
              <span className={`h-3 w-3 rounded-full ${conciliacion.color}`} />
              <span className="text-xs text-muted-foreground">Conciliación: {conciliacion.texto}</span>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Filtros */}
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm">Filtros</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap gap-2">
            {RANGOS.map(r => (
              <Button key={r.id} size="sm" variant={rango === r.id ? "default" : "outline"}
                onClick={() => setRango(r.id)}>{r.label}</Button>
            ))}
          </div>
          {rango === "custom" && (
            <div className="grid grid-cols-2 gap-2">
              <div><Label className="text-xs">Desde</Label><Input type="date" value={desde} onChange={e => setDesde(e.target.value)} /></div>
              <div><Label className="text-xs">Hasta</Label><Input type="date" value={hasta} onChange={e => setHasta(e.target.value)} /></div>
            </div>
          )}
          <div className="flex flex-wrap gap-2">
            {(["todas", "account_opening", "reload_fee", "withdrawal_fee"] as const).map(t => (
              <Button key={t} size="sm" variant={tipo === t ? "default" : "outline"} onClick={() => setTipo(t)}>
                {t === "todas" ? "Todas" : ETIQUETA[t]}
              </Button>
            ))}
          </div>
          <div className="relative">
            <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input className="pl-8" placeholder="Buscar por QaRd, usuario, monto o clave de rastreo"
              value={busqueda} onChange={e => setBusqueda(e.target.value)} />
          </div>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" className="flex-1" onClick={exportarCsv}>
              <Download className="h-4 w-4 mr-1" /> CSV
            </Button>
            <Button size="sm" variant="outline" className="flex-1" onClick={exportarPdf}>
              <FileText className="h-4 w-4 mr-1" /> PDF
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-2">
        <Card><CardContent className="p-3">
          <p className="text-xs text-muted-foreground">Total del periodo</p>
          <p className="text-xl font-bold">{pesos(resumen.total)}</p>
          {resumen.crecimiento !== null && (
            <p className={`text-xs flex items-center gap-1 ${resumen.crecimiento >= 0 ? "text-emerald-600" : "text-destructive"}`}>
              {resumen.crecimiento >= 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
              {resumen.crecimiento.toFixed(0)}% vs periodo anterior
            </p>
          )}
        </CardContent></Card>
        <Card><CardContent className="p-3">
          <p className="text-xs text-muted-foreground">Operaciones</p>
          <p className="text-xl font-bold">{resumen.cantidad}</p>
          <p className="text-xs text-muted-foreground">Promedio diario {pesos(resumen.promedioDiario)}</p>
        </CardContent></Card>
      </div>

      <div className="grid grid-cols-3 gap-2">
        {([["Aperturas", resumen.aperturas], ["Recargas", resumen.recargas], ["Retiros", resumen.retiros]] as const).map(([t, v]) => (
          <Card key={t}><CardContent className="p-3 text-center">
            <p className="text-xs text-muted-foreground">{t}</p>
            <p className="font-bold">{pesos(v.m)}</p>
            <p className="text-xs text-muted-foreground">{v.n}</p>
          </CardContent></Card>
        ))}
      </div>

      <Card><CardContent className="p-3">
        <p className="text-xs text-muted-foreground">Proyección mensual</p>
        <p className="text-lg font-bold">{pesos(resumen.proyeccionMensual)}</p>
      </CardContent></Card>

      {/* Gráficas */}
      {pastel.length > 0 && (
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Distribución por tipo</CardTitle></CardHeader>
          <CardContent className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={pastel} dataKey="value" nameKey="name" outerRadius={70} label>
                  {pastel.map(p => <Cell key={p.tipo} fill={COLOR[p.tipo]} />)}
                </Pie>
                <Tooltip formatter={(v: number) => pesos(v)} />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {porDia.length > 0 && (
        <>
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm">Ingresos por día</CardTitle></CardHeader>
            <CardContent className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={porDia}>
                  <XAxis dataKey="dia" fontSize={10} /><YAxis fontSize={10} />
                  <Tooltip formatter={(v: number) => pesos(v)} />
                  <Bar dataKey="monto" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm">Crecimiento acumulado</CardTitle></CardHeader>
            <CardContent className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={porDia}>
                  <XAxis dataKey="dia" fontSize={10} /><YAxis fontSize={10} />
                  <Tooltip formatter={(v: number) => pesos(v)} />
                  <Line type="monotone" dataKey="acumulado" stroke="hsl(160 84% 39%)" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </>
      )}

      {/* Tabla */}
      <Card>
        <CardHeader className="pb-2 flex-row items-center justify-between">
          <CardTitle className="text-sm">Detalle ({visibles.length})</CardTitle>
          <div className="flex gap-1">
            {(["created_at", "amount", "transaction_type"] as const).map(c => (
              <Button key={c} size="sm" variant="ghost" className="text-xs px-2"
                onClick={() => setOrden(o => ({ campo: c, asc: o.campo === c ? !o.asc : false }))}>
                <ArrowUpDown className="h-3 w-3 mr-1" />
                {c === "created_at" ? "Fecha" : c === "amount" ? "Monto" : "Tipo"}
              </Button>
            ))}
          </div>
        </CardHeader>
        <CardContent className="space-y-2">
          {cargando && <Loader2 className="h-4 w-4 animate-spin mx-auto" />}
          {!cargando && visibles.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-6">Sin movimientos en este periodo.</p>
          )}
          {visibles.map(f => (
            <div key={f.id} className="rounded-lg border p-3 text-sm space-y-1">
              <div className="flex items-center justify-between gap-2">
                <Badge variant="outline" style={{ borderColor: COLOR[f.transaction_type], color: COLOR[f.transaction_type] }}>
                  {ETIQUETA[f.transaction_type]}
                </Badge>
                <span className="font-bold">{pesos(f.amount)}</span>
              </div>
              <p className="text-xs text-muted-foreground">
                {new Date(f.created_at).toLocaleString("es-MX")} · {nombres[f.user_id ?? ""] ?? "Sistema"}
              </p>
              <p className="text-xs font-mono">{f.qard_number ?? "—"}</p>
              {f.original_amount != null && (
                <p className="text-xs text-muted-foreground">Monto original: {pesos(f.original_amount)}</p>
              )}
              {f.description && <p className="text-xs">{f.description}</p>}
              {f.spei_tracking_key && <p className="text-xs text-muted-foreground">Rastreo: {f.spei_tracking_key}</p>}
            </div>
          ))}
        </CardContent>
      </Card>

      <p className="text-xs text-muted-foreground flex items-center gap-1">
        <Wallet className="h-3 w-3" /> Cuenta de sistema: no aparece en búsquedas ni se puede eliminar.
      </p>
    </div>
  );
}
