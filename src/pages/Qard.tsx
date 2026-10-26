import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "@/hooks/use-toast";
import { QRCodeSVG } from "qrcode.react";
import { CreditCard, Plus, Minus, RefreshCw, Trash2, ArrowLeft, Wallet, Eye, EyeOff, RotateCw, Printer, History, Download, Landmark } from "lucide-react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { generarPdfTarjetasQard } from "@/lib/qardPrint";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { downloadCSV } from "@/lib/csvExport";

import { useQardIdentidad } from "@/hooks/useQardIdentidad";
import ActivarQardDialog from "@/components/qard/ActivarQardDialog";
import VerificarIdentidadDialog from "@/components/qard/VerificarIdentidadDialog";
import UpgradeMoralDialog from "@/components/qard/UpgradeMoralDialog";
import VerificarSubQrDialog from "@/components/qard/VerificarSubQrDialog";
import { formatHermosillo } from "@/lib/utils";
import { useAuth } from "@/hooks/useAuth";
import { useIngresosTransporte, panelDeRuta } from "@/hooks/useIngresosTransporte";
import { construirLibro, estadoDeCuenta, MENSAJE_ERROR_AMABLE, type Ambito, type InfoPasaje } from "@/lib/qardEtiquetas";
import { groupRoutesByType } from "@/lib/transportRouteTypes";
import { RouteTypeBadge, RouteTypeIcon } from "@/components/RouteTypeBadge";
import QardTarjeta from "@/components/qard/QardTarjeta";



type SubQR = {
  id: string;
  sub_index: number;
  qard_number: string;
  alias: string;
  limite_por_transaccion: number | null;
  saldo_mxn: number;
  estado: "activa" | "apagada" | "cancelada";
  fecha_vencimiento: string | null;
  cvv: string | null;
  cvv_dinamico: string | null;
  curp_verificada?: boolean | null;
  nombre_completo?: string | null;
};
type WalletRow = { id: string; saldo_mxn: number; estado: string; cvv_dinamico: string | null };
type Movimiento = {
  id: string; tipo: string; monto_mxn: number; saldo_despues: number;
  descripcion: string | null; created_at: string; comercio_nombre: string | null;
  sub_qr_id: string | null; comercio_user_id?: string | null;
  metadata?: Record<string, unknown> | null;
};

type MovimientoEstadoCuenta = Movimiento & {
  idEstadoCuenta: string;
  etiquetaEstadoCuenta?: string;
  montoEstadoCuenta?: number;
};

function formatNumero(n?: string | null) {
  if (!n) return "---- ---- ---- ----";
  return `${n.slice(0, 4)} ${n.slice(4, 8)} ${n.slice(8, 12)} ${n.slice(12, 16)}`;
}

const PERIODOS: { d: number; label: string }[] = [
  { d: 7, label: "7 días" },
  { d: 15, label: "15 días" },
  { d: 30, label: "1 mes" },
  { d: 62, label: "2 meses" },
];

function PeriodoSelector({ valor, onChange }: { valor: number; onChange: (d: number) => void }) {
  return (
    <div className="flex gap-1 mb-3">
      {PERIODOS.map(p => (
        <button
          key={p.d}
          onClick={() => onChange(p.d)}
          className={`flex-1 h-7 rounded-md text-[11px] font-medium border transition ${
            valor === p.d
              ? "bg-primary text-primary-foreground border-primary"
              : "bg-background text-muted-foreground border-input"
          }`}
        >
          {p.label}
        </button>
      ))}
    </div>
  );
}


export default function Qard() {
  const nav = useNavigate();
  const [params] = useSearchParams();
  const { user: authUser } = useAuth();
  const rutasIngreso = useIngresosTransporte(authUser?.id);
  const [verTodasRutas, setVerTodasRutas] = useState(false);
  const [loading, setLoading] = useState(true);
  const [pasajes, setPasajes] = useState<Map<string, InfoPasaje>>(new Map());
  const [nombrePerfil, setNombrePerfil] = useState("");
  const [wallet, setWallet] = useState<WalletRow | null>(null);
  const [subs, setSubs] = useState<SubQR[]>([]);
  const [cambiandoEstado, setCambiandoEstado] = useState<string | null>(null);
  const [mov, setMov] = useState<Movimiento[]>([]);
  const [qardNumber, setQardNumber] = useState<string>("");
  const [monto, setMonto] = useState<string>("");
  const [newAlias, setNewAlias] = useState("");
  const [newLimite, setNewLimite] = useState("");
  const [cvvVisible, setCvvVisible] = useState<Record<string, boolean>>({});
  const [cvvDinVisible, setCvvDinVisible] = useState(false);
  const [filtroGrupo, setFiltroGrupo] = useState<"activa" | "apagada" | "cancelada">("activa");
  const [subMovOpen, setSubMovOpen] = useState<SubQR | null>(null);
  const [ejeOpen, setEjeOpen] = useState(false);
  const [periodoEje, setPeriodoEje] = useState<number>(30);
  const [periodoSub, setPeriodoSub] = useState<number>(30);
  const [cobrosOpen, setCobrosOpen] = useState(false);
  const [periodoCobros, setPeriodoCobros] = useState<number>(30);
  const [qrFullscreen, setQrFullscreen] = useState<{ value: string; label: string } | null>(null);
  const [printOpen, setPrintOpen] = useState(false);
  const [printSel, setPrintSel] = useState<string[]>(["titular"]);
  // P2P transfer
  const [p2pFromId, setP2pFromId] = useState<string>(""); // qard_number origen (eje o sub)
  const [p2pTo, setP2pTo] = useState("");
  const [p2pCvv, setP2pCvv] = useState("");
  const [p2pMonto, setP2pMonto] = useState("");
  const [p2pEnviando, setP2pEnviando] = useState(false);
  // Transferencia a sub-QR
  const [subTransferOpen, setSubTransferOpen] = useState(false);
  const [subTransferTarget, setSubTransferTarget] = useState<SubQR | null>(null);
  const [subTransferSigno, setSubTransferSigno] = useState<1 | -1>(1);
  const [subTransferMonto, setSubTransferMonto] = useState("");
  // Rotar CVV
  const [cvvRotarOpen, setCvvRotarOpen] = useState(false);
  const [cvvRotarId, setCvvRotarId] = useState<string | null>(null);
  const [cvvRotarValor, setCvvRotarValor] = useState("");
  // Identidad financiera (activación de la tarjeta)
  const { identidad, limite, activa, recargarDatos } = useQardIdentidad();
  const [activarOpen, setActivarOpen] = useState(false);
  const [moralOpen, setMoralOpen] = useState(false);
  const [verificarOpen, setVerificarOpen] = useState(false);
  const nivelVerificacion = identidad?.verification_level ?? 0;
  const pedirActivacion = () => {
    toast({
      title: "Tu QaRd está inactiva",
      description: "Actívala para poder recargar, pagar y transferir.",
      variant: "destructive",
    });
    setActivarOpen(true);
  };



  const abrirMovsSub = (sub: SubQR) => setSubMovOpen(sub);

  const rotarCvv = (id: string) => {
    setCvvRotarId(id);
    setCvvRotarValor("");
    setCvvRotarOpen(true);
  };

  const ejecutarRotarCvv = async () => {
    if (!cvvRotarId) return;
    const custom = cvvRotarValor.trim();
    if (custom && !/^\d{3}$/.test(custom)) {
      return toast({ title: "CVV inválido", description: "Debe tener exactamente 3 dígitos o dejarse vacío para aleatorio.", variant: "destructive" });
    }
    const { data, error } = await supabase.rpc("qard_sub_qr_rotar_cvv" as any, {
      _sub_qr_id: cvvRotarId, _nuevo_cvv: custom || null,
    });
    if (error) return toast({ title: "No se pudo cambiar", description: MENSAJE_ERROR_AMABLE, variant: "destructive" });
    toast({ title: "CVV actualizado", description: `Nuevo CVV: ${data}` });
    setCvvVisible(v => ({ ...v, [cvvRotarId]: true }));
    setCvvRotarOpen(false);
    setCvvRotarId(null);
    setCvvRotarValor("");
    cargar();
  };



  // Empata cada cobro de transporte con su viaje para mostrar "Pasaje · Ruta X".
  const cargarPasajes = async (movs: any[], numeros: string[]) => {
    const cobros = movs.filter(x => x.tipo === "cobro_comercio" && /^(Transporte|Cobro automático)/.test(x.comercio_nombre || ""));
    if (!cobros.length || !numeros.length) { setPasajes(new Map()); return; }
    const { data: vs } = await supabase.from("qard_viajes_pasajero" as any)
      .select("id, producto_id, subida_at, bajada_at, estado, monto_cobrado_mxn")
      .in("qard_number", numeros).in("estado", ["cerrado", "auto_cerrado"]).order("bajada_at", { ascending: true }).limit(500);
    const viajes = ((vs as any[]) ?? []);
    const ids = [...new Set(viajes.map(v => v.producto_id).filter(Boolean))];
    const { data: ps } = ids.length ? await supabase.from("productos").select("id, nombre").in("id", ids) : { data: [] as any[] };
    const nombre = new Map(((ps as any[]) ?? []).map(p => [p.id, p.nombre as string]));
    const usados = new Set<string>();
    const mapa = new Map<string, InfoPasaje>();
    for (const c of [...cobros].sort((a, b) => a.created_at < b.created_at ? -1 : 1)) {
      const t = new Date(c.created_at).getTime();
      const auto = (c.comercio_nombre || "").startsWith("Cobro automático");
      const candidatos = viajes.filter(v => !usados.has(v.id) && (auto ? v.estado === "auto_cerrado" : v.estado === "cerrado")
        && Math.abs(Number(v.monto_cobrado_mxn) - Math.abs(Number(c.monto_mxn))) < 0.01
        && v.bajada_at && new Date(v.bajada_at).getTime() <= t + 5000);
      const v = auto ? candidatos[0] : candidatos.find(x => Math.abs(new Date(x.bajada_at).getTime() - t) < 60000);
      const rutaTexto = (c.comercio_nombre || "").split("·")[1]?.trim();
      if (v) usados.add(v.id);
      const ruta = (v && nombre.get(v.producto_id)) || rutaTexto;
      if (ruta) mapa.set(c.id, { ruta, viajeAt: v?.subida_at ?? null, auto });
    }
    setPasajes(mapa);
  };

  const cargar = async () => {
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { nav("/auth"); return; }

    // Asegura wallet + titular sub-QR (+ QaRd Empresarial si el comerciante está aprobado)
    await supabase.rpc("qard_ensure_wallet" as any, { _user_id: user.id });
    await supabase.rpc("qard_ensure_empresarial" as any, { _user_id: user.id });

    const [{ data: prof }, { data: w }, { data: s }, { data: m }] = await Promise.all([
      supabase.from("profiles").select("qard_number, nombre").eq("user_id", user.id).maybeSingle(),
      supabase.from("qard_wallets" as any).select("*").eq("titular_user_id", user.id).maybeSingle(),
      supabase.from("qard_sub_qr" as any).select("*").eq("titular_user_id", user.id).order("sub_index"),
      supabase.from("qard_movimientos" as any).select("*").eq("titular_user_id", user.id).gte("created_at", new Date(Date.now() - 62 * 24 * 3600 * 1000).toISOString()).order("created_at", { ascending: false }).limit(500),
    ]);
    setQardNumber((prof as any)?.qard_number ?? "");
    setNombrePerfil((prof as any)?.nombre ?? "");
    void cargarPasajes(((m as any[]) ?? []), [(prof as any)?.qard_number, ...(((s as any[]) ?? []).map(r => r.qard_number))].filter(Boolean));

    // Los CVV viven cifrados en la base. Solo el dueño los ve en claro vía RPC segura.
    const { data: cvvs } = await supabase.rpc("qard_mis_cvv" as any);
    const mapaCvv = new Map<string, { cvv: string | null; cvv_dinamico: string | null }>(
      ((cvvs as any[]) ?? []).map(r => [r.sub_qr_id as string, { cvv: r.cvv, cvv_dinamico: r.cvv_dinamico }])
    );
    const subsPlano = (((s as any[]) ?? []).map(row => ({
      ...row,
      cvv: mapaCvv.get(row.id)?.cvv ?? null,
      cvv_dinamico: mapaCvv.get(row.id)?.cvv_dinamico ?? null,
    })));
    const ejeCvvDin = subsPlano.find((r: any) => r.sub_index === 0)?.cvv_dinamico ?? null;

    setWallet(w ? ({ ...(w as any), cvv_dinamico: ejeCvvDin }) as any : (w as any));
    setSubs(subsPlano as any);
    setMov((m as any) ?? []);
    setLoading(false);
  };

  useEffect(() => {
    cargar();
    if (params.get("recarga") === "success") {
      toast({ title: "Recarga exitosa", description: `+$${params.get("monto")} MXN acreditados` });
    }
    // realtime
    const ch = supabase.channel("qard-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "qard_wallets" }, () => cargar())
      .on("postgres_changes", { event: "*", schema: "public", table: "qard_sub_qr" }, () => cargar())
      .on("postgres_changes", { event: "*", schema: "public", table: "qard_movimientos" }, () => cargar())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
    // eslint-disable-next-line
  }, []);

  const transferirSub = (sub: SubQR, signo: 1 | -1) => {
    setSubTransferTarget(sub);
    setSubTransferSigno(signo);
    setSubTransferMonto("");
    setSubTransferOpen(true);
  };

  const ejecutarTransferirSub = async () => {
    if (!subTransferTarget) return;
    const m = Number(subTransferMonto);
    if (!m || m <= 0) return toast({ title: "Monto inválido", variant: "destructive" });
    const { error } = await supabase.rpc("qard_transferir_a_sub" as any, {
      _sub_qr_id: subTransferTarget.id, _monto_mxn: m * subTransferSigno,
    });
    if (error) return toast({ title: "No se pudo transferir", description: MENSAJE_ERROR_AMABLE, variant: "destructive" });
    toast({ title: subTransferSigno > 0 ? "Saldo asignado" : "Saldo devuelto", description: `$${m.toFixed(2)}` });
    setSubTransferOpen(false);
    setSubTransferMonto("");
    setSubTransferTarget(null);
    cargar();
  };

  const toggleSub = async (sub: SubQR) => {
    if (cambiandoEstado || sub.estado === "cancelada") return;
    const nuevo = sub.estado === "activa" ? "apagada" : "activa";
    setCambiandoEstado(sub.id);
    try {
      const { error } = await supabase.rpc("qard_sub_set_estado" as any, {
        _sub_qr_id: sub.id, _estado: nuevo,
      });
      if (error) throw error;
      setSubs(actuales => actuales.map(s => s.id === sub.id ? { ...s, estado: nuevo } : s));
      toast({ title: nuevo === "activa" ? "QaRd encendida" : "QaRd apagada" });
      await cargar();
    } catch {
      toast({ title: "No se pudo cambiar", description: MENSAJE_ERROR_AMABLE, variant: "destructive" });
    } finally {
      setCambiandoEstado(null);
    }
  };

  const recargar = async () => {
    if (!activa) return pedirActivacion();
    const m = Number(monto);
    if (!m || m < 300) return toast({ title: "Mínimo 300 QaRd pesos", description: "La recarga mínima es de $300 pesos por 300 QaRd pesos.", variant: "destructive" });
    if (limite?.disponible !== null && limite && m > limite.disponible) {
      return toast({
        title: "Pasas tu tope del mes",
        description: `Este mes solo te quedan $${limite.disponible.toFixed(2)} de entradas (recargas + cobros). El día 1 se reinicia.`,
        variant: "destructive",
      });
    }
    const { data, error } = await supabase.functions.invoke("qard-recargar", { body: { monto_mxn: m } });
    if (error || !data?.url) return toast({ title: "Error al recargar", description: MENSAJE_ERROR_AMABLE, variant: "destructive" });
    window.location.href = data.url;
  };


  const enviarP2P = async () => {
    if (!activa) return pedirActivacion();
    const desde = (p2pFromId || qardNumber).replace(/\s+/g, "");

    const hacia = p2pTo.replace(/\s+/g, "");
    const cvv = p2pCvv.trim();
    const m = Number(p2pMonto);
    const misNumeros = new Set<string>([qardNumber, ...subs.map(s => (s.qard_number || "").replace(/\s+/g, ""))].filter(Boolean));
    const mismoDueno = misNumeros.has(hacia);
    if (desde.length !== 16) return toast({ title: "Selecciona la cuenta origen", variant: "destructive" });
    if (hacia.length !== 16) return toast({ title: "El número destino debe tener 16 dígitos", variant: "destructive" });
    if (desde === hacia) return toast({ title: "Origen y destino son la misma cuenta", variant: "destructive" });
    if (!mismoDueno && cvv.length !== 4) return toast({ title: "CVV dinámico de 4 dígitos requerido", variant: "destructive" });
    if (!m || m <= 0) return toast({ title: "Monto inválido", variant: "destructive" });
    const label = mismoDueno ? "una cuenta tuya" : `la QaRd terminada en ${hacia.slice(-4)}`;
    if (!confirm(`¿Enviar $${m.toFixed(2)} MXN a ${label}?\n\nEs gratis y no se puede revertir.`)) return;
    setP2pEnviando(true);
    const { data, error } = await supabase.rpc("qard_transfer_p2p" as any, {
      _from_numero16: desde, _to_numero16: hacia, _cvv: mismoDueno ? "" : cvv, _monto: m,
    });
    setP2pEnviando(false);
    if (error) return toast({ title: "Error", description: MENSAJE_ERROR_AMABLE, variant: "destructive" });
    const res = data as any;
    if (!res?.ok) return toast({ title: "No se pudo enviar", description: res?.error ?? MENSAJE_ERROR_AMABLE, variant: "destructive" });
    toast({ title: "Transferencia enviada", description: `$${m.toFixed(2)} MXN a •••• ${hacia.slice(-4)}` });
    setP2pTo(""); setP2pCvv(""); setP2pMonto("");
    cargar();
  };



  const [subVerificar, setSubVerificar] = useState<SubQR | null>(null);

  const crearSub = async () => {
    if (!newAlias.trim()) return toast({ title: "Escribe un alias", variant: "destructive" });
    const { data: { user } } = await supabase.auth.getUser();
    if (!user || !wallet) return;
    const usados = subs.map(s => s.sub_index);
    // La terminación 01 está reservada para la QaRd Empresarial: las familiares empiezan en 02
    let idx = 2;
    while (usados.includes(idx) && idx < 100) idx++;
    if (idx >= 100) return toast({ title: "Máximo de sub-QR alcanzado", variant: "destructive" });

    const base = qardNumber.slice(0, 14);
    const numero = base + String(idx).padStart(2, "0");
    const { error } = await supabase.from("qard_sub_qr" as any).insert({
      wallet_id: wallet.id,
      titular_user_id: user.id,
      sub_index: idx,
      qard_number: numero,
      alias: newAlias.trim(),
      limite_por_transaccion: newLimite ? Number(newLimite) : null,
    });
    if (error) return toast({ title: "No se pudo crear", description: MENSAJE_ERROR_AMABLE, variant: "destructive" });
    setNewAlias(""); setNewLimite("");
    toast({ title: "Sub-QR creado", description: formatNumero(numero) });
    cargar();
  };

  const cancelarSub = async (id: string) => {
    if (!confirm("¿Cancelar este sub-QR?")) return;
    const { error } = await supabase.from("qard_sub_qr" as any).update({ estado: "cancelada" }).eq("id", id);
    if (error) return toast({ title: "Error", description: MENSAJE_ERROR_AMABLE, variant: "destructive" });
    toast({ title: "Cancelado" });
    cargar();
  };

  if (loading) return <div className="p-6 text-center">Cargando QaRd…</div>;

  const saldo = Number(wallet?.saldo_mxn ?? 0);
  const saldoColor = saldo < 0 ? "text-destructive" : "qard-balance";

  return (
    <div className="p-4 max-w-3xl mx-auto pb-40 space-y-4">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="icon" onClick={() => nav(-1)}><ArrowLeft className="h-5 w-5" /></Button>
        <h1 className="text-2xl font-bold flex items-center gap-2"><Wallet className="h-6 w-6" /> QaRd</h1>
        <Button variant="ghost" size="icon" className="ml-auto" onClick={cargar}><RefreshCw className="h-4 w-4" /></Button>
      </div>

      {/* Tarjeta titular — estilo bancario real */}
      {(() => {
        const titular = subs.find(s => s.sub_index === 0);
        return (
          <div className="space-y-3">
            <QardTarjeta
              numero={qardNumber}
              nombre={identidad?.nombre_completo || titular?.nombre_completo || ""}
              indice={0}
              estado={titular?.estado ?? "apagada"}
              vence={titular?.fecha_vencimiento}
              cvv={titular?.cvv}
              cvvVisible={!!titular && !!cvvVisible[titular.id]}
              onVerCvv={() => { if (titular) setCvvVisible(v => ({ ...v, [titular.id]: !v[titular.id] })); }}
              onRotarCvv={() => { if (titular) rotarCvv(titular.id); }}
              onQr={() => setQrFullscreen({ value: qardNumber, label: "Tarjeta principal" })}
              onImprimir={() => { setPrintSel(["titular"]); setPrintOpen(true); }}
              nivel={nivelVerificacion}
              activada={activa && nivelVerificacion > 0}
              encendida={titular?.estado === "activa"}
              cambiandoEstado={!!titular && cambiandoEstado === titular.id}
              powerDisabled={!titular || titular.estado === "cancelada" || cambiandoEstado !== null}
              onPowerChange={() => { if (titular) void toggleSub(titular); }}
            />

            {/* Datos debajo del plástico */}
            <Card className="p-4">
              <div className="text-xs text-muted-foreground">Saldo</div>
              <div className="flex items-baseline gap-2 flex-wrap">
                <span className={saldoColor}>${saldo.toFixed(2)}</span>
                <span className="text-sm font-semibold text-muted-foreground">QaRd pesos</span>
              </div>
              {saldo < 0 && <div className="text-xs text-red-600 mt-1">Recarga para seguir usando (máx −$50)</div>}

              {wallet?.cvv_dinamico && (
                <div className="mt-3">
                  <div className="text-xs text-muted-foreground">CVV dinámico (para recibir transferencias)</div>
                  <div className="flex items-center gap-2">
                    <span className="font-mono font-extrabold text-primary text-2xl tracking-widest">
                      {cvvDinVisible ? wallet.cvv_dinamico : "••••"}
                    </span>
                    <button onClick={() => setCvvDinVisible(v => !v)}>
                      {cvvDinVisible ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                    </button>
                    <span className="text-[10px] text-muted-foreground">Cambia tras cada transferencia recibida</span>
                  </div>
                </div>
              )}

            </Card>

          </div>
        );
      })()}

      {/* QaRd Empresarial (Nivel 3) — terminación 01, solo comerciantes aprobados */}
      {(() => {
        const emp = subs.find(s => s.sub_index === 1);
        if (!emp) return null;
        const empAprobada = identidad?.estado === "moral_approved";
        return (
          <div className="space-y-3">
            <QardTarjeta
              empresarial
              numero={emp.qard_number}
              nombre={emp.alias}
              indice={1}
              estado={emp.estado}
              vence={emp.fecha_vencimiento}
              cvv={emp.cvv}
              cvvVisible={!!cvvVisible[emp.id]}
              onVerCvv={() => setCvvVisible(v => ({ ...v, [emp.id]: !v[emp.id] }))}
              onRotarCvv={() => rotarCvv(emp.id)}
              onQr={() => setQrFullscreen({ value: emp.qard_number, label: "QaRd Empresarial" })}
              onImprimir={() => { setPrintSel([emp.id]); setPrintOpen(true); }}
              nivel={3}
              activada={empAprobada}
              encendida={emp.estado === "activa"}
              cambiandoEstado={cambiandoEstado === emp.id}
              powerDisabled={emp.estado === "cancelada" || cambiandoEstado !== null}
              onPowerChange={() => void toggleSub(emp)}
            />
            <Card className="p-4">
              <div className="text-xs text-muted-foreground">Saldo empresarial</div>
              <div className="flex items-baseline gap-2 flex-wrap">
                <span className={Number(emp.saldo_mxn) < 0 ? "text-destructive" : "qard-balance"}>${Number(emp.saldo_mxn ?? 0).toFixed(2)}</span>
                <span className="text-sm font-semibold text-muted-foreground">QaRd pesos</span>
              </div>
            </Card>
          </div>
        );
      })()}

      {/* Activación / identidad financiera */}
      {!activa ? (
        <Card className="p-4 border-amber-400/60 bg-amber-50 dark:bg-amber-950/20">
          <div className="font-semibold mb-1">Tu tarjeta QaRd está INACTIVA</div>
          <div className="text-xs text-muted-foreground mb-3">
            Puedes usar los chats, el mapa y todo lo gratis con tu apodo. Para mover dinero
            (recargar, pagar y transferir) necesitas activarla: verificamos tu teléfono, tu correo
            y pedimos tu nombre completo y CURP.
          </div>
          <Button className="w-full" onClick={() => setActivarOpen(true)}>Activar mi QaRd</Button>
        </Card>
      ) : (
        <Card className="p-4">
          <div className="text-xs text-muted-foreground">Titular (nombre legal)</div>
          <div className="font-semibold">{identidad?.nombre_completo ?? "—"}</div>

          {nivelVerificacion === 1 && (
            <Button variant="outline" size="sm" className="mt-3 w-full" onClick={() => setVerificarOpen(true)}>
              Subir mi límite a 3,000 UDIS (INE)
            </Button>
          )}

          {identidad?.estado === "moral_review" && (
            <div className="text-xs text-amber-600 mt-2">
              Tu solicitud de empresa está en revisión (24 a 48 horas).
            </div>
          )}
          {identidad?.estado === "moral_approved" ? (
            <div className="text-xs text-sky-700 mt-2 font-medium">
              Cuenta Comerciante aprobada: sin tope mensual de entradas.
            </div>
          ) : identidad?.estado === "active" ? (
            <Button variant="outline" size="sm" className="mt-3 w-full" onClick={() => setMoralOpen(true)}>
              Convertir mi cuenta a Persona Moral / Proveedor
            </Button>
          ) : null}
        </Card>
      )}


      {/* Recargar */}
      <Card className="p-4">
        <div className="font-semibold mb-2">Recargar QaRd pesos</div>
        <div className="flex gap-2">
          <Input type="number" min={300} step={50} value={monto} disabled={!activa} onChange={e => setMonto(e.target.value)} />
          <Button onClick={recargar} disabled={!activa || Number(monto) < 300}><Plus className="h-4 w-4 mr-1" /> Recargar QaRd pesos</Button>
        </div>
        <Button
          variant="outline"
          className="w-full mt-2"
          disabled={!activa}
          onClick={() => nav("/qard/recargar")}
        >
          <Landmark className="h-4 w-4 mr-2" /> Recargar por transferencia (SPEI)
        </Button>
        <div className="text-xs text-muted-foreground mt-1">El mínimo de recarga es de 300 pesos por 300 QaRd pesos. 1 QaRd peso = 1 peso mexicano.</div>
        {activa && limite && limite.tope !== null && (
          <div className="mt-3">
            <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
              <div
                className="h-full bg-primary transition-all"
                style={{ width: `${Math.min(100, (limite.usado / limite.tope) * 100)}%` }}
              />
            </div>
            <div className="text-xs text-muted-foreground mt-1">
              Has recibido ${limite.usado.toFixed(2)} de tus ${limite.tope.toFixed(2)} disponibles este mes (recargas + cobros).
              Tu saldo no caduca ni tiene tope: solo se limita cuánto dinero nuevo entra al mes. El día 1 se reinicia.
            </div>
          </div>
        )}
        {activa && limite && limite.tope === null && (
          <div className="text-xs text-sky-700 mt-2 font-medium">Cuenta Comerciante: entradas sin tope mensual.</div>
        )}
      </Card>


      {/* Transferir a otra QaRd (P2P gratis) */}
      <Card className="p-4 border-primary/40">
        <div className="font-semibold mb-1">Transferir a otra QaRd</div>
        <div className="text-xs text-muted-foreground mb-3">
          Gratis entre usuarios. Necesitas los 16 dígitos de la QaRd destino + su <b>CVV dinámico de 4 dígitos</b>. El CVV de 3 dígitos no se comparte ni se envía para cobrar. El dinámico es de un solo uso.
        </div>
        <div className="space-y-2">
          <div>
            <Label className="text-xs">Origen</Label>
            <select
              className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm"
              value={p2pFromId || qardNumber}
              onChange={e => setP2pFromId(e.target.value)}
            >
              <option value={qardNumber}>Principal (00) · {formatNumero(qardNumber)}</option>
              {subs.filter(s => s.sub_index > 0 && s.estado === "activa").map(s => (
                <option key={s.id} value={s.qard_number}>
                  {s.alias} · {String(s.sub_index).padStart(2,"0")} · saldo ${Number(s.saldo_mxn).toFixed(2)}
                </option>
              ))}
            </select>
          </div>
          <div>
            <Label className="text-xs">Número destino (16 dígitos)</Label>
            <Input
              inputMode="numeric"
              maxLength={19}
              value={p2pTo}
              onChange={e => setP2pTo(e.target.value.replace(/\D/g, "").slice(0, 16))}
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-xs">CVV dinámico (4 dígitos)</Label>
              <Input
                inputMode="numeric"
                maxLength={4}
                value={p2pCvv}
                onChange={e => setP2pCvv(e.target.value.replace(/\D/g, "").slice(0, 4))}
              />
            </div>
            <div>
              <Label className="text-xs">Monto MXN</Label>
              <Input
                type="number"
                min={1}
                step="0.01"
                value={p2pMonto}
                onChange={e => setP2pMonto(e.target.value)}
              />
            </div>
          </div>
          <Button className="w-full" onClick={enviarP2P} disabled={p2pEnviando}>
            {p2pEnviando ? "Enviando…" : "Enviar transferencia"}
          </Button>
        </div>
      </Card>


      {/* Sub-QR familiares */}
      <Card className="p-4">
        <div className="font-semibold mb-3">Sub-QR familiares</div>
        <div className="flex gap-2 mb-3 items-end">
          <div className="flex-1">
            <label className="text-xs font-medium text-muted-foreground mb-1 block">Nombre</label>
            <Input value={newAlias} onChange={e => setNewAlias(e.target.value)} />
          </div>
          <div className="w-28">
            <label className="text-xs font-medium text-muted-foreground mb-1 block">Máx por cobro</label>
            <Input type="number" value={newLimite} onChange={e => setNewLimite(e.target.value)} />
          </div>
          <Button onClick={crearSub}><Plus className="h-4 w-4" /></Button>
        </div>
        <div className="space-y-2">
          {(() => {
            const familiares = subs.filter(s => s.sub_index > 1);
            const counts = {
              activa: familiares.filter(s => s.estado === "activa").length,
              apagada: familiares.filter(s => s.estado === "apagada").length,
              cancelada: familiares.filter(s => s.estado === "cancelada").length,
            };
            const grupos: Array<{ k: "activa" | "apagada" | "cancelada"; label: string }> = [
              { k: "activa", label: `Activas (${counts.activa})` },
              { k: "apagada", label: `Apagadas (${counts.apagada})` },
              { k: "cancelada", label: `Canceladas (${counts.cancelada})` },
            ];
            return (
              <>
                <div className="flex gap-1 mb-2">
                  {grupos.map(g => (
                    <Button
                      key={g.k}
                      size="sm"
                      variant={filtroGrupo === g.k ? "default" : "outline"}
                      className="flex-1 h-8 text-xs"
                      onClick={() => setFiltroGrupo(g.k)}
                    >
                      {g.label}
                    </Button>
                  ))}
                </div>
                {familiares.filter(s => s.estado === filtroGrupo).map(s => (
            <div key={s.id} className="space-y-2 py-3 border-b last:border-b-0">
              <QardTarjeta numero={s.qard_number} nombre={s.nombre_completo || ""} nivel={s.curp_verificada ? 1 : 0} activada={!!s.curp_verificada}
                indice={s.sub_index} estado={s.estado} vence={s.fecha_vencimiento} cvv={s.cvv}
                cvvVisible={!!cvvVisible[s.id]}
                onVerCvv={() => setCvvVisible(v => ({ ...v, [s.id]: !v[s.id] }))}
                onRotarCvv={() => rotarCvv(s.id)}
                onQr={() => setQrFullscreen({ value: s.qard_number, label: `${s.alias} · ${String(s.sub_index).padStart(2, "0")}` })}
                onImprimir={() => { setPrintSel([s.id]); setPrintOpen(true); }}
                encendida={s.estado === "activa"} cambiandoEstado={cambiandoEstado === s.id}
                powerDisabled={s.estado === "cancelada" || cambiandoEstado !== null}
                onPowerChange={() => void toggleSub(s)} />
              <div className="flex items-start gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <div className="font-semibold break-words">{s.alias} · {String(s.sub_index).padStart(2, "0")}</div>
                  {s.estado === "apagada" && <span className="text-[10px] px-1.5 py-0.5 rounded bg-red-100 text-red-700 font-semibold">APAGADA</span>}
                  {s.estado === "cancelada" && <span className="text-[10px] px-1.5 py-0.5 rounded bg-red-200 text-red-800 font-semibold">CANCELADA</span>}
                  {s.curp_verificada
                    ? <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700 font-semibold">VERIFICADA</span>
                    : <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground font-semibold">SIN VERIFICAR</span>}
                </div>
                {s.curp_verificada
                  ? s.nombre_completo && <div className="text-[11px] text-muted-foreground truncate">{s.nombre_completo}</div>
                  : s.estado !== "cancelada" && (
                    <Button size="sm" variant="outline" className="h-7 px-2 mt-1 text-[11px]" onClick={() => setSubVerificar(s)}>
                      Activar con CURP ($100)
                    </Button>
                  )}
                <div className="flex items-center gap-3 mt-1">
                  <div className="text-sm">
                    <span className="text-muted-foreground text-[11px]">Saldo</span>{" "}
                    <b className={Number(s.saldo_mxn) > 0 ? "text-green-700" : "text-muted-foreground"}>
                      ${Number(s.saldo_mxn ?? 0).toFixed(2)}
                    </b>
                  </div>
                  {s.estado !== "cancelada" && (
                    <div className="flex gap-1">
                      <Button size="sm" variant="outline" className="h-7 px-2" onClick={() => transferirSub(s, 1)} title="Asignar saldo">
                        <Plus className="h-3 w-3" />
                      </Button>
                      <Button size="sm" variant="outline" className="h-7 px-2" onClick={() => transferirSub(s, -1)} title="Devolver saldo al titular" disabled={Number(s.saldo_mxn ?? 0) <= 0}>
                        <Minus className="h-3 w-3" />
                      </Button>
                    </div>
                  )}
                </div>
                <div className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] mt-1 items-center">
                  {s.cvv_dinamico && (
                    <span className="flex items-center gap-1">
                      <span className="text-muted-foreground">CVV transf.</span>
                      <b className="font-mono font-extrabold text-base text-cyan-400 tracking-widest">{cvvVisible[`din-${s.id}`] ? s.cvv_dinamico : "••••"}</b>
                      <button onClick={() => setCvvVisible(v => ({ ...v, [`din-${s.id}`]: !v[`din-${s.id}`] }))}>
                        {cvvVisible[`din-${s.id}`] ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                      </button>
                    </span>
                  )}
                </div>
                {s.limite_por_transaccion && <div className="text-[11px] mt-0.5">Máx por cobro: ${Number(s.limite_por_transaccion).toFixed(2)}</div>}
              </div>
              <div className="flex flex-col gap-1">
                <Button size="sm" variant="ghost" title="Ver movimientos" onClick={() => abrirMovsSub(s)}>
                  <History className="h-4 w-4" />
                </Button>
                {s.estado !== "cancelada" && (
                  <Button size="sm" variant="ghost" onClick={() => cancelarSub(s.id)} title="Cancelar definitivamente">
                    <Trash2 className="h-4 w-4 text-red-600" />
                  </Button>
                )}
              </div>
              </div>
            </div>
          ))}
                {familiares.filter(s => s.estado === filtroGrupo).length === 0 && (
                  <div className="text-xs text-muted-foreground">Sin QaRd en este grupo.</div>
                )}
              </>
            );
          })()}
        </div>
      </Card>

      <VerificarSubQrDialog
        abierto={!!subVerificar}
        onOpenChange={(v) => { if (!v) setSubVerificar(null); }}
        subQr={subVerificar}
        saldoTitular={Number(wallet?.saldo_mxn ?? 0)}
        onVerificado={cargar}
      />

      {(() => {
        const titularId = subs.find(s => s.sub_index === 0)?.id;
        const libro = construirLibro(mov as any, titularId, pasajes);
        const saldoEje = Number(wallet?.saldo_mxn ?? 0);
        const saldoCobros = Number((wallet as any)?.saldo_comercio_mxn ?? 0);
        const subsActivas = subs.filter(s => s.sub_index > 0 && s.estado === "activa");
        const pozoRutas = (rutasIngreso || []).reduce((a, r) => a + r.pozo, 0);
        const total = saldoEje + saldoCobros + subsActivas.reduce((a, s) => a + Number(s.saldo_mxn ?? 0), 0) + pozoRutas;
        const rutasOrden = [...(rutasIngreso || [])].sort((a, b) => b.pozo + b.standN - (a.pozo + a.standN));
        const conDinero = rutasOrden.filter(r => r.pozo > 0 || r.standN > 0 || r.sinSaldoN > 0);
        const rutasVisibles = verTodasRutas ? rutasOrden : conDinero;

        const Estado = ({ titulo, ambito, saldoVivo, subId, periodo, setPeriodo }: {
          titulo: string; ambito: Ambito; saldoVivo: number; subId?: string | null; periodo: number; setPeriodo: (d: number) => void;
        }) => {
          const desde = Date.now() - periodo * 24 * 3600 * 1000;
          const filas = estadoDeCuenta(libro, ambito, saldoVivo, subId).filter(f => new Date(f.r.created_at).getTime() >= desde);
          const mesLabel = (d: string) =>
            new Date(d).toLocaleDateString("es-MX", { month: "long", year: "numeric", timeZone: "America/Hermosillo" });
          const meses: { label: string; filas: typeof filas }[] = [];
          filas.forEach(f => {
            const lbl = mesLabel(f.r.created_at);
            const last = meses[meses.length - 1];
            if (last && last.label === lbl) last.filas.push(f); else meses.push({ label: lbl, filas: [f] });
          });
          const exportar = (label: string, fs: typeof filas) => downloadCSV(
            `qard-${titulo.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}-${label.replace(/\s+/g, "-")}.csv`,
            ["Fecha", "Concepto", "Ingreso", "Egreso", "Saldo"],
            [
              ...fs.map(f => [formatHermosillo(f.r.created_at), f.r.etiqueta,
                f.monto > 0 ? f.monto.toFixed(2) : "", f.monto < 0 ? Math.abs(f.monto).toFixed(2) : "", f.saldoDespues.toFixed(2)]),
              ["", "Saldo inicial del periodo", "", "", (fs[fs.length - 1]?.saldoAntes ?? saldoVivo).toFixed(2)],
            ],
          );
          return (
            <>
              <PeriodoSelector valor={periodo} onChange={setPeriodo} />
              <div className="max-h-[60vh] overflow-y-auto">
                {filas.length === 0 && <div className="text-xs text-muted-foreground">Sin movimientos en este periodo. Saldo ${saldoVivo.toFixed(2)}</div>}
                {meses.map(mes => (
                  <div key={mes.label} className="mb-5">
                    <div className="flex items-center justify-between mb-2">
                      <div className="text-sm font-semibold capitalize">{mes.label}</div>
                      <Button size="sm" variant="outline" onClick={() => exportar(mes.label, mes.filas)}>
                        <Download className="h-4 w-4 mr-1" /> CSV
                      </Button>
                    </div>
                    <div className="divide-y">
                      {mes.filas.map(f => (
                        <div key={f.r.key} className="flex justify-between items-center gap-2 py-2">
                          <div className="min-w-0">
                            <div className="font-medium text-sm truncate">{f.r.etiqueta}</div>
                            {f.r.detalle && <div className="text-xs text-muted-foreground">{f.r.detalle}</div>}
                            <div className="text-xs text-muted-foreground">{formatHermosillo(f.r.created_at)}</div>
                          </div>
                          <div className="text-right shrink-0">
                            <div className={`font-semibold text-sm ${f.monto > 0 ? "text-green-600" : "text-red-600"}`}>
                              {f.monto > 0 ? "+" : "−"}${Math.abs(f.monto).toFixed(2)}
                            </div>
                            <div className="text-xs text-muted-foreground">Saldo ${f.saldoDespues.toFixed(2)}</div>
                          </div>
                        </div>
                      ))}
                      <div className="flex justify-between items-center py-2 text-sm">
                        <div className="text-muted-foreground">Saldo inicial</div>
                        <div className="font-semibold">${(mes.filas[mes.filas.length - 1]?.saldoAntes ?? 0).toFixed(2)}</div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </>
          );
        };

        return (
          <>
            {/* Mi dinero: saldos vivos de cada cubeta */}
            <Card className="p-4">
              <div className="font-semibold mb-2">Mi dinero</div>
              <div className="divide-y text-sm">
                <div className="flex justify-between py-2">
                  <button className="underline-offset-2 hover:underline" onClick={() => setEjeOpen(true)}>Cuenta eje</button>
                  <b>${saldoEje.toFixed(2)}</b>
                </div>
                {subsActivas.map(s => (
                  <div key={s.id} className="flex justify-between py-2">
                    <button className="underline-offset-2 hover:underline truncate" onClick={() => abrirMovsSub(s)}>{s.alias}</button>
                    <b>${Number(s.saldo_mxn ?? 0).toFixed(2)}</b>
                  </div>
                ))}
                <div className="flex justify-between py-2">
                  <button className="underline-offset-2 hover:underline" onClick={() => setCobrosOpen(true)}>Cobros</button>
                  <b>${saldoCobros.toFixed(2)}</b>
                </div>
                {rutasIngreso && rutasIngreso.length > 0 && (conDinero.length > 0 || verTodasRutas) && (
                  <div className="py-2">
                    <div className="text-xs font-semibold text-muted-foreground mb-1">Ingresos de transporte · por cobrar</div>
                    {groupRoutesByType(rutasVisibles, r => r.routeType).map(grupo => (
                      <section key={grupo.type} aria-label={grupo.group} className="mt-3">
                        <div className="flex items-center gap-2 border-b pb-1.5 text-sm font-semibold">
                          <RouteTypeIcon routeType={grupo.type} />
                          <span>{grupo.group}</span>
                          <span className="ml-auto text-xs text-muted-foreground">{grupo.routes.length}</span>
                        </div>
                        {grupo.routes.map(r => (
                          <Button key={r.id} variant="ghost" className="w-full h-auto px-0 py-2 justify-start text-left font-normal whitespace-normal" onClick={() => nav(panelDeRuta(r))}>
                            <div className="w-full min-w-0">
                              <div className="flex justify-between items-start gap-3">
                                <span className="min-w-0 break-words">{r.nombre}</span>
                                <b className="shrink-0">${r.pozo.toFixed(2)}</b>
                              </div>
                              <div className="mt-1"><RouteTypeBadge routeType={r.routeType} /></div>
                              {r.standN > 0 && (
                                <div className="text-xs text-muted-foreground mt-1">+ {r.standN} en stand se cobrará al cierre del día (${r.standMonto.toFixed(2)})</div>
                              )}
                              {r.sinSaldoN > 0 && (
                                <div className="text-xs text-destructive mt-1">{r.sinSaldoN} sin saldo, pendiente aparte (${r.sinSaldoMonto.toFixed(2)})</div>
                              )}
                            </div>
                          </Button>
                        ))}
                      </section>
                    ))}
                    <button className="text-xs text-muted-foreground underline mt-1" onClick={() => setVerTodasRutas(v => !v)}>{verTodasRutas ? "Ocultar rutas en cero" : "Ver todas las rutas"}</button>
                  </div>
                )}
                {rutasIngreso && rutasIngreso.length > 0 && conDinero.length === 0 && !verTodasRutas && (
                  <div className="py-1"><button className="text-xs text-muted-foreground underline" onClick={() => setVerTodasRutas(true)}>Ver todas las rutas</button></div>
                )}
                <div className="flex justify-between py-2 text-base">
                  <span className="font-semibold">Total de tu dinero</span>
                  <b className="text-primary">${total.toFixed(2)}</b>
                </div>
              </div>
            </Card>

            <Card className="p-4 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="font-semibold">Estados de cuenta</div>
                <div className="text-xs text-muted-foreground">Cuenta eje y cobros, por separado.</div>
              </div>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={() => setEjeOpen(true)}><History className="h-4 w-4 mr-1" /> Eje</Button>
                <Button size="sm" variant="outline" onClick={() => setCobrosOpen(true)}><History className="h-4 w-4 mr-1" /> Cobros</Button>
              </div>
            </Card>

            <Dialog open={ejeOpen} onOpenChange={setEjeOpen}>
              <DialogContent className="max-w-md">
                <DialogHeader><DialogTitle>Estado de cuenta · cuenta eje</DialogTitle></DialogHeader>
                <Estado titulo="cuenta eje" ambito="eje" saldoVivo={saldoEje} periodo={periodoEje} setPeriodo={setPeriodoEje} />
              </DialogContent>
            </Dialog>

            <Dialog open={cobrosOpen} onOpenChange={setCobrosOpen}>
              <DialogContent className="max-w-md">
                <DialogHeader><DialogTitle>Estado de cuenta · cobros</DialogTitle></DialogHeader>
                <Estado titulo="cobros" ambito="cobros" saldoVivo={saldoCobros} periodo={periodoCobros} setPeriodo={setPeriodoCobros} />
              </DialogContent>
            </Dialog>

            <Dialog open={!!subMovOpen} onOpenChange={(o) => !o && setSubMovOpen(null)}>
              <DialogContent className="max-w-md">
                <DialogHeader><DialogTitle>Estado de cuenta · {subMovOpen?.alias}</DialogTitle></DialogHeader>
                {subMovOpen && (
                  <Estado titulo={`sub-qr ${subMovOpen.alias}`} ambito="sub_qr" subId={subMovOpen.id}
                    saldoVivo={Number(subs.find(s => s.id === subMovOpen.id)?.saldo_mxn ?? subMovOpen.saldo_mxn ?? 0)}
                    periodo={periodoSub} setPeriodo={setPeriodoSub} />
                )}
              </DialogContent>
            </Dialog>
          </>
        );
      })()}

      {/* Elegir qué tarjetas imprimir */}
      <Dialog open={printOpen} onOpenChange={setPrintOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>¿Qué tarjetas quieres imprimir?</DialogTitle>
          </DialogHeader>
          <div className="text-xs text-muted-foreground -mt-2 mb-2">
            Si eliges una sola, se imprimen 4 copias en la hoja. Si eliges varias, se imprime una copia de cada una (4 por hoja).
          </div>
          <div className="divide-y max-h-[50vh] overflow-y-auto">
            {subs.filter(s => s.estado === "activa" && (s.sub_index === 0 ? activa && nivelVerificacion > 0 : s.curp_verificada)).map(s => ({
              id: s.sub_index === 0 ? "titular" : s.id, nombre: s.alias, term: String(s.sub_index).padStart(2, "0"),
            })).map(op => {
              const checked = printSel.includes(op.id);
              return (
                <label key={op.id} className="flex items-center gap-3 py-2 cursor-pointer">
                  <input
                    type="checkbox"
                    className="h-4 w-4 accent-primary"
                    checked={checked}
                    onChange={() =>
                      setPrintSel(prev =>
                        checked ? prev.filter(x => x !== op.id) : [...prev, op.id]
                      )
                    }
                  />
                  <span className="flex-1 text-sm font-medium truncate">{op.nombre}</span>
                  <span className="font-mono text-xs text-muted-foreground">· {op.term}</span>
                </label>
              );
            })}
          </div>
          <Button
            className="w-full"
            disabled={printSel.length === 0}
            onClick={async () => {
              const cards = subs.filter(s => printSel.includes(s.sub_index === 0 ? "titular" : s.id)
                && s.estado === "activa" && (s.sub_index === 0 ? activa && nivelVerificacion > 0 : s.curp_verificada))
                .map(s => ({
                  qardNumber: s.qard_number,
                  vencimiento: s.fecha_vencimiento,
                  alias: s.sub_index === 0 ? identidad?.nombre_completo || s.nombre_completo : s.nombre_completo,
                  nivel: s.sub_index === 0 ? nivelVerificacion : 1,
                  activada: true,
                }));
              if (!cards.length) {
                toast({ title: "Selecciona una tarjeta activada y encendida" });
                return;
              }
              setPrintOpen(false);
              try {
                const { data } = await supabase.functions.invoke("qard-saldo-publico", { body: { action: "token", numeros: cards.map(c => c.qardNumber) } });
                const tokens = ((data as any)?.tokens ?? {}) as Record<string, string>;
                cards.forEach((c: any) => { const t = tokens[(c.qardNumber || "").replace(/\D/g, "")]; if (t) c.saldoUrl = `https://todocerca.mx/saldo?k=${t}`; });
              } catch { /* si falla, se imprime sin QR de saldo */ }
              await generarPdfTarjetasQard(cards);
            }}
          >
            <Printer className="h-4 w-4 mr-2" />
            Imprimir {printSel.length > 0 ? `(${printSel.length})` : ""}
          </Button>
        </DialogContent>
      </Dialog>

      {/* Dialog: asignar / retirar saldo de sub-QR */}
      <Dialog open={subTransferOpen} onOpenChange={(o) => { if (!o) { setSubTransferOpen(false); setSubTransferMonto(""); setSubTransferTarget(null); } }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>
              {subTransferSigno > 0 ? `Asignar a ${subTransferTarget?.alias}` : `Retirar de ${subTransferTarget?.alias}`}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-xs">Monto MXN</Label>
              <Input
                type="number"
                min={1}
                step="0.01"
                value={subTransferMonto}
                onChange={e => setSubTransferMonto(e.target.value)}
                autoFocus
              />
            </div>
            <Button className="w-full" onClick={ejecutarTransferirSub}>
              {subTransferSigno > 0 ? "Asignar saldo" : "Retirar saldo"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Dialog: rotar CVV */}
      <Dialog open={cvvRotarOpen} onOpenChange={(o) => { if (!o) { setCvvRotarOpen(false); setCvvRotarValor(""); setCvvRotarId(null); } }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Cambiar CVV de compras</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-xs">Nuevo CVV de 3 dígitos</Label>
              <Input
                inputMode="numeric"
                maxLength={3}
                value={cvvRotarValor}
                onChange={e => setCvvRotarValor(e.target.value.replace(/\D/g, "").slice(0, 3))}
                autoFocus
              />
              <p className="text-xs text-muted-foreground mt-1">Déjalo vacío para generar uno aleatorio.</p>
            </div>
            <Button className="w-full" onClick={ejecutarRotarCvv}>Guardar CVV</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* QR fullscreen para pagar */}
      {qrFullscreen && (
        <div
          className="fixed inset-0 z-[100] bg-white flex flex-col items-center justify-center p-6"
          onClick={() => setQrFullscreen(null)}
        >
          <div className="text-black text-lg font-semibold mb-4">{qrFullscreen.label}</div>
          <QRCodeSVG value={qrFullscreen.value} size={Math.min(window.innerWidth, window.innerHeight) - 80} level="H" />
          <div className="text-black/60 text-sm mt-6">Toca para cerrar</div>
        </div>
      )}

      <ActivarQardDialog
        open={activarOpen}
        onOpenChange={setActivarOpen}
        phoneVerified={!!identidad?.phone_verified}
        emailVerified={!!identidad?.email_verified}
        onActivada={() => { recargarDatos(); cargar(); }}
        onQuiereIne={() => setVerificarOpen(true)}
      />

      <VerificarIdentidadDialog
        open={verificarOpen}
        onOpenChange={setVerificarOpen}
        nivelActual={nivelVerificacion}
        nombreGuardado={identidad?.nombre_completo ?? null}
        curpGuardada={identidad?.curp ?? null}
        onVerificada={() => { recargarDatos(); cargar(); }}
      />

      <UpgradeMoralDialog open={moralOpen} onOpenChange={setMoralOpen} onEnviada={recargarDatos} />

      <Button variant="outline" className="w-full" onClick={() => nav("/qard/cobrar")}>
        Soy comercio · Cobrar a un QR
      </Button>

    </div>
  );
}
