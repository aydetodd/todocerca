import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "@/hooks/use-toast";
import { QRCodeSVG } from "qrcode.react";
import { CreditCard, Plus, Minus, RefreshCw, Trash2, ArrowLeft, Wallet, Eye, EyeOff, RotateCw, Printer, Power, History, Download, Receipt } from "lucide-react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { generarPdfTarjetasQard } from "@/lib/qardPrint";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { downloadCSV } from "@/lib/csvExport";
import todocercaLogoAsset from "@/assets/todocerca-logo.jpeg.asset.json";
const todocercaLogo = todocercaLogoAsset.url;


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
};
type WalletRow = { id: string; saldo_mxn: number; estado: string; cvv_dinamico: string | null };
type Movimiento = {
  id: string; tipo: string; monto_mxn: number; saldo_despues: number;
  descripcion: string | null; created_at: string; comercio_nombre: string | null;
  sub_qr_id: string | null; comercio_user_id?: string | null;
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
  const [loading, setLoading] = useState(true);
  const [wallet, setWallet] = useState<WalletRow | null>(null);
  const [subs, setSubs] = useState<SubQR[]>([]);
  const [mov, setMov] = useState<Movimiento[]>([]);
  const [qardNumber, setQardNumber] = useState<string>("");
  const [monto, setMonto] = useState<string>("200");
  const [newAlias, setNewAlias] = useState("");
  const [newLimite, setNewLimite] = useState("");
  const [cvvVisible, setCvvVisible] = useState<Record<string, boolean>>({});
  const [cvvDinVisible, setCvvDinVisible] = useState(false);
  const [filtroGrupo, setFiltroGrupo] = useState<"activa" | "apagada" | "cancelada">("activa");
  const [subMovOpen, setSubMovOpen] = useState<SubQR | null>(null);
  const [subMovs, setSubMovs] = useState<Movimiento[]>([]);
  const [ejeOpen, setEjeOpen] = useState(false);
  const [periodoEje, setPeriodoEje] = useState<number>(30);
  const [periodoSub, setPeriodoSub] = useState<number>(30);
  const [qrFullscreen, setQrFullscreen] = useState<{ value: string; label: string } | null>(null);
  const [printOpen, setPrintOpen] = useState(false);
  const [printSel, setPrintSel] = useState<string[]>(["titular"]);
  // P2P transfer
  const [p2pFromId, setP2pFromId] = useState<string>(""); // qard_number origen (eje o sub)
  const [p2pTo, setP2pTo] = useState("");
  const [p2pCvv, setP2pCvv] = useState("");
  const [p2pMonto, setP2pMonto] = useState("");
  const [p2pEnviando, setP2pEnviando] = useState(false);

  const abrirMovsSub = async (sub: SubQR) => {
    setSubMovOpen(sub);
    setSubMovs([]);
    const { data } = await supabase
      .from("qard_movimientos" as any)
      .select("*")
      .eq("sub_qr_id", sub.id)
      .gte("created_at", new Date(Date.now() - 62 * 24 * 3600 * 1000).toISOString())
      .order("created_at", { ascending: false })
      .limit(500);
    setSubMovs((data as any) ?? []);
  };

  const rotarCvv = async (id: string) => {
    const custom = prompt("Escribe el nuevo CVV de 3 dígitos o deja vacío para uno aleatorio:");
    if (custom === null) return;
    const { data, error } = await supabase.rpc("qard_sub_qr_rotar_cvv" as any, {
      _sub_qr_id: id, _nuevo_cvv: custom.trim() || null,
    });
    if (error) return toast({ title: "No se pudo cambiar", description: error.message, variant: "destructive" });
    toast({ title: "CVV actualizado", description: `Nuevo CVV: ${data}` });
    setCvvVisible(v => ({ ...v, [id]: true }));
    cargar();
  };



  const cargar = async () => {
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { nav("/auth"); return; }

    // Asegura wallet + titular sub-QR
    await supabase.rpc("qard_ensure_wallet" as any, { _user_id: user.id });

    const [{ data: prof }, { data: w }, { data: s }, { data: m }] = await Promise.all([
      supabase.from("profiles").select("qard_number").eq("user_id", user.id).maybeSingle(),
      supabase.from("qard_wallets" as any).select("*").eq("titular_user_id", user.id).maybeSingle(),
      supabase.from("qard_sub_qr" as any).select("*").eq("titular_user_id", user.id).order("sub_index"),
      supabase.from("qard_movimientos" as any).select("*").eq("titular_user_id", user.id).gte("created_at", new Date(Date.now() - 62 * 24 * 3600 * 1000).toISOString()).order("created_at", { ascending: false }).limit(500),
    ]);
    setQardNumber((prof as any)?.qard_number ?? "");
    setWallet(w as any);
    setSubs((s as any) ?? []);
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

  const transferirSub = async (sub: SubQR, signo: 1 | -1) => {
    const etiqueta = signo > 0 ? `Asignar a ${sub.alias}` : `Retirar de ${sub.alias}`;
    const raw = prompt(`${etiqueta}\n\nMonto MXN:`, "100");
    if (raw === null) return;
    const m = Number(raw);
    if (!m || m <= 0) return toast({ title: "Monto inválido", variant: "destructive" });
    const { error } = await supabase.rpc("qard_transferir_a_sub" as any, {
      _sub_qr_id: sub.id, _monto_mxn: m * signo,
    });
    if (error) return toast({ title: "No se pudo transferir", description: error.message, variant: "destructive" });
    toast({ title: signo > 0 ? "Saldo asignado" : "Saldo devuelto", description: `$${m.toFixed(2)}` });
    cargar();
  };

  const toggleSub = async (sub: SubQR) => {
    const nuevo = sub.estado === "activa" ? "apagada" : "activa";
    const { error } = await supabase.rpc("qard_sub_set_estado" as any, {
      _sub_qr_id: sub.id, _estado: nuevo,
    });
    if (error) return toast({ title: "No se pudo cambiar", description: error.message, variant: "destructive" });
    toast({ title: nuevo === "activa" ? "QaRd encendida" : "QaRd apagada" });
    cargar();
  };

  const recargar = async () => {
    const m = Number(monto);
    if (!m || m < 200) return toast({ title: "Mínimo $200 MXN", variant: "destructive" });
    const { data, error } = await supabase.functions.invoke("qard-recargar", { body: { monto_mxn: m } });
    if (error || !data?.url) return toast({ title: "Error al recargar", description: error?.message, variant: "destructive" });
    window.location.href = data.url;
  };

  const enviarP2P = async () => {
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
    if (error) return toast({ title: "Error", description: error.message, variant: "destructive" });
    const res = data as any;
    if (!res?.ok) return toast({ title: "No se pudo enviar", description: res?.error ?? "Error desconocido", variant: "destructive" });
    toast({ title: "Transferencia enviada", description: `$${m.toFixed(2)} MXN a •••• ${hacia.slice(-4)}` });
    setP2pTo(""); setP2pCvv(""); setP2pMonto("");
    cargar();
  };



  const crearSub = async () => {
    if (!newAlias.trim()) return toast({ title: "Escribe un alias", variant: "destructive" });
    const { data: { user } } = await supabase.auth.getUser();
    if (!user || !wallet) return;
    const usados = subs.map(s => s.sub_index);
    let idx = 1;
    while (usados.includes(idx) && idx < 100) idx++;
    if (idx >= 100) return toast({ title: "Máximo 100 sub-QR alcanzado", variant: "destructive" });

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
    if (error) return toast({ title: "No se pudo crear", description: error.message, variant: "destructive" });
    setNewAlias(""); setNewLimite("");
    toast({ title: "Sub-QR creado", description: formatNumero(numero) });
    cargar();
  };

  const cancelarSub = async (id: string) => {
    if (!confirm("¿Cancelar este sub-QR?")) return;
    const { error } = await supabase.from("qard_sub_qr" as any).update({ estado: "cancelada" }).eq("id", id);
    if (error) return toast({ title: "Error", description: error.message, variant: "destructive" });
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
        const digits = (qardNumber || "").replace(/\D/g, "");
        const grupos = digits.length === 16
          ? [digits.slice(0,4), digits.slice(4,8), digits.slice(8,12), digits.slice(12,16)]
          : ["••••","••••","••••","••••"];
        return (
          <div className="space-y-3">
            {/* Plástico */}
            <div
              className="relative overflow-hidden rounded-2xl p-5 text-white shadow-xl"
              style={{
                background: "linear-gradient(135deg, hsl(215 40% 14%) 0%, hsl(215 35% 22%) 45%, hsl(16 100% 38%) 100%)",
                aspectRatio: "1.586 / 1",
                minHeight: 210,
              }}
            >
              {/* brillo diagonal */}
              <div className="pointer-events-none absolute -top-16 -left-10 h-48 w-72 rotate-12 rounded-full bg-white/10 blur-2xl" />
              <div className="pointer-events-none absolute -bottom-20 -right-10 h-52 w-72 rounded-full bg-white/5 blur-2xl" />

              <div className="relative flex items-start justify-between">
                <div className="flex items-center gap-2">
                  <img
                    src={todocercaLogo}
                    alt="Logotipo TodoCerca"
                    className="h-11 w-11 rounded-full bg-white object-cover shadow-[0_2px_8px_rgba(0,0,0,0.35)]"
                  />

                  <div>
                    <div className="text-[11px] uppercase tracking-[0.2em] text-white/70">QaRd</div>
                    <div className="text-[10px] text-white/50">Tarjeta principal · 00</div>
                  </div>
                </div>

                {qardNumber && (
                  <div className="flex flex-col items-center">
                    <button
                      className="bg-white p-1.5 rounded-md active:scale-95 transition"
                      onClick={() => setQrFullscreen({ value: qardNumber, label: "Tarjeta principal" })}
                      title="Toca para agrandar y pagar"
                    >
                      <QRCodeSVG value={qardNumber} size={54} level="H" />
                    </button>
                  </div>
                )}
              </div>


              {/* Chip + contactless */}
              <div className="relative mt-3 flex h-8 items-center justify-between">
                <div className="flex items-center gap-3">
                  <div
                    className="h-8 w-11 rounded-md border border-yellow-200/40"
                    style={{ background: "linear-gradient(135deg,#e6c565,#b9902f 45%,#f3dc9a 70%,#c9a13f)" }}
                  >
                    <div className="h-full w-full rounded-md border-x border-yellow-900/20 opacity-60" />
                  </div>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" className="opacity-80">
                    <path d="M6 8a8 8 0 0 1 0 8M10 6a12 12 0 0 1 0 12M14 4a16 16 0 0 1 0 16" stroke="white" strokeWidth="1.6" strokeLinecap="round" />
                  </svg>
                </div>
                {qardNumber && (
                  <button
                    className="mr-[19px] rounded-md p-1 text-white/80 hover:text-white active:scale-95 transition"
                    title="Imprimir tarjetas"
                    aria-label="Imprimir tarjetas"
                    onClick={() => { setPrintSel(["titular"]); setPrintOpen(true); }}
                  >
                    <Printer className="h-4 w-4" />
                  </button>
                )}
              </div>

              {/* Número grabado */}
              <div className="relative mt-3 flex justify-between font-mono text-[19px] tracking-[0.12em] [text-shadow:0_1px_0_rgba(0,0,0,.45)]">
                {grupos.map((g, i) => <span key={i}>{g}</span>)}
              </div>

              {/* Pie de tarjeta */}
              <div className="relative mt-3 flex items-end justify-between">
                <div>
                  <div className="text-[8px] uppercase tracking-widest text-white/50">Titular</div>
                  <div className="text-xs font-semibold uppercase tracking-wide truncate max-w-[150px]">
                    {titular?.alias || "TITULAR QaRd"}
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-[8px] uppercase tracking-widest text-white/50">Vence</div>
                  <div className="font-mono text-xs font-semibold">{titular?.fecha_vencimiento ?? "12/99"}</div>
                </div>
                <div className="text-right">
                  <div className="text-[8px] uppercase tracking-widest text-white/50">CVV</div>
                  <div className="flex items-center gap-1">
                    <span className="font-mono text-xs font-bold tracking-widest">
                      {titular && cvvVisible[titular.id] ? titular.cvv : "•••"}
                    </span>
                    {titular && (
                      <>
                        <button onClick={() => setCvvVisible(v => ({ ...v, [titular.id]: !v[titular.id] }))}>
                          {cvvVisible[titular.id] ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                        </button>
                        <button onClick={() => rotarCvv(titular.id)} title="Cambiar CVV">
                          <RotateCw className="h-3.5 w-3.5" />
                        </button>
                      </>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Datos debajo del plástico */}
            <Card className="p-4">
              <div className="text-xs text-muted-foreground">Saldo</div>
              <div className={saldoColor}>${saldo.toFixed(2)}</div>
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


      {/* Pagar servicios */}
      <Card className="p-4">
        <div className="font-semibold mb-1">Pagar servicios</div>
        <div className="text-xs text-muted-foreground mb-3">
          Luz, agua, gas, internet y predial con tu saldo QaRd.
        </div>
        <Button variant="outline" className="w-full" onClick={() => nav("/qard/servicios")}>
          <Receipt className="h-4 w-4 mr-2" /> Ir a pagar servicios
        </Button>
      </Card>

      {/* Recargar */}
      <Card className="p-4">
        <div className="font-semibold mb-2">Recargar saldo</div>
        <div className="flex gap-2">
          <Input type="number" min={200} step={50} value={monto} onChange={e => setMonto(e.target.value)} />
          <Button onClick={recargar}><Plus className="h-4 w-4 mr-1" /> Recargar</Button>
        </div>
        <div className="text-xs text-muted-foreground mt-1">Mínimo $200 MXN. Recibes el monto exacto, sin descuentos.</div>
      </Card>

      {/* Transferir a otra QaRd (P2P gratis) */}
      <Card className="p-4 border-primary/40">
        <div className="font-semibold mb-1">Transferir a otra QaRd</div>
        <div className="text-xs text-muted-foreground mb-3">
          Gratis entre usuarios. Necesitas los 16 dígitos de la QaRd destino + su <b>CVV dinámico de 4 dígitos</b> (el de 3 dígitos es solo para compras). El CVV dinámico se rota tras cada transferencia.
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
              placeholder="0000 0000 0000 0000"
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
                placeholder="4 dígitos"
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
                placeholder="0.00"
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
        <div className="flex gap-2 mb-3">
          <Input placeholder="Alias (ej. Juan)" value={newAlias} onChange={e => setNewAlias(e.target.value)} />
          <Input type="number" placeholder="Límite/trans (opcional)" value={newLimite} onChange={e => setNewLimite(e.target.value)} />
          <Button onClick={crearSub}><Plus className="h-4 w-4" /></Button>
        </div>
        <div className="space-y-2">
          {(() => {
            const familiares = subs.filter(s => s.sub_index > 0);
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
            <div key={s.id} className={`flex items-center gap-3 border rounded p-2 ${s.estado === "apagada" ? "opacity-60 bg-muted/40" : ""}`}>
              <button
                className="bg-white p-1 rounded cursor-pointer active:scale-95 transition"
                onClick={() => setQrFullscreen({ value: s.qard_number, label: `${s.alias} · ${String(s.sub_index).padStart(2, "0")}` })}
                title="Toca para agrandar y pagar"
              >
                <QRCodeSVG value={s.qard_number} size={56} />
              </button>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <div className="font-semibold truncate">{s.alias} · {String(s.sub_index).padStart(2, "0")}</div>
                  {s.estado === "apagada" && <span className="text-[10px] px-1.5 py-0.5 rounded bg-red-100 text-red-700 font-semibold">APAGADA</span>}
                  {s.estado === "cancelada" && <span className="text-[10px] px-1.5 py-0.5 rounded bg-red-200 text-red-800 font-semibold">CANCELADA</span>}
                </div>
                <div className="font-mono text-xs text-muted-foreground">{formatNumero(s.qard_number)}</div>
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
                  <span>Vence <b className="font-mono">{s.fecha_vencimiento ?? "12/99"}</b></span>
                  <span className="flex items-center gap-1">
                    <span className="text-muted-foreground">CVV</span>
                    <b className="font-mono font-bold text-sm text-amber-400 tracking-wider">{cvvVisible[s.id] ? s.cvv : "•••"}</b>
                    <button onClick={() => setCvvVisible(v => ({ ...v, [s.id]: !v[s.id] }))}>
                      {cvvVisible[s.id] ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                    </button>
                    <button onClick={() => rotarCvv(s.id)} title="Cambiar CVV"><RotateCw className="h-3.5 w-3.5" /></button>
                  </span>
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
                  <Button
                    size="sm"
                    variant="ghost"
                    title={s.estado === "activa" ? "Apagar" : "Encender"}
                    onClick={() => toggleSub(s)}
                  >
                    <Power className={`h-4 w-4 ${s.estado === "activa" ? "text-green-600" : "text-red-600"}`} />
                  </Button>
                )}
                {s.estado !== "cancelada" && (
                  <Button size="sm" variant="ghost" onClick={() => cancelarSub(s.id)} title="Cancelar definitivamente">
                    <Trash2 className="h-4 w-4 text-red-600" />
                  </Button>
                )}
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

      {/* Estado de cuenta estilo banco (2 meses) — se abre con icono */}
      {(() => {
        const titularId = subs.find(s => s.sub_index === 0)?.id;
        const ejeMov = mov.filter(m =>
          !m.comercio_user_id && (
            !m.sub_qr_id || m.sub_qr_id === titularId ||
            m.tipo === "transfer_a_sub" || m.tipo === "transfer_desde_sub" || m.tipo === "recarga"
          )
        );
        const esPositivo = (t: string) =>
          t === "recarga" || t === "transfer_desde_sub" || t === "transferencia_p2p_in";
        const etiqueta = (m: Movimiento) => {
          const aliasFromDesc = (m.descripcion || "").replace(/^(Asignado a sub-QR |Retirado de sub-QR )/, "");
          return m.tipo === "recarga" ? "Recarga" :
            m.tipo === "cobro_comercio" ? `Pago ${m.comercio_nombre ?? ""}` :
            m.tipo === "transfer_a_sub" ? `Transferir a ${aliasFromDesc}` :
            m.tipo === "transfer_desde_sub" ? `Devolver de ${aliasFromDesc}` :
            m.tipo === "retiro_qard" ? "Transferencia enviada" :
            m.tipo === "retiro_oxxo" ? "Retiro en OXXO" :
            m.tipo === "retiro_spei" ? "Envío SPEI" :
            m.tipo === "transferencia_p2p_in" ? "Transferencia recibida" :
            m.tipo === "transferencia_p2p_out" ? "Transferencia enviada" :
            m.tipo;
        };

        // Saldo corrido: partimos del saldo actual y caminamos hacia atrás
        let corrido = Number(wallet?.saldo_mxn ?? 0);
        const todas = ejeMov.map(m => {
          const signo = esPositivo(m.tipo) ? 1 : -1;
          const monto = Math.abs(Number(m.monto_mxn)) * signo;
          const saldoDespues = corrido;
          corrido = +(corrido - monto).toFixed(2);
          return { m, monto, saldoDespues: +saldoDespues.toFixed(2), saldoAntes: corrido };
        });

        const desde = Date.now() - periodoEje * 24 * 3600 * 1000;
        const filas = todas.filter(f => new Date(f.m.created_at).getTime() >= desde);

        const mesLabel = (d: string) =>
          new Date(d).toLocaleDateString("es-MX", { month: "long", year: "numeric" });
        const meses: { label: string; filas: typeof filas }[] = [];
        filas.forEach(f => {
          const lbl = mesLabel(f.m.created_at);
          const last = meses[meses.length - 1];
          if (last && last.label === lbl) last.filas.push(f);
          else meses.push({ label: lbl, filas: [f] });
        });

        const exportarMes = (label: string, fs: typeof filas) => {
          downloadCSV(
            `qard-estado-cuenta-${label.replace(/\s+/g, "-")}.csv`,
            ["Fecha", "Concepto", "Ingreso", "Egreso", "Saldo"],
            [
              ...fs.map(f => [
                new Date(f.m.created_at).toLocaleString("es-MX"),
                etiqueta(f.m),
                f.monto > 0 ? f.monto.toFixed(2) : "",
                f.monto < 0 ? Math.abs(f.monto).toFixed(2) : "",
                f.saldoDespues.toFixed(2),
              ]),
              ["", "Saldo inicial del periodo", "", "", (fs[fs.length - 1]?.saldoAntes ?? 0).toFixed(2)],
            ]
          );
        };

        return (
          <>
            <Card className="p-4 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="font-semibold">Estado de cuenta · cuenta eje</div>
                <div className="text-xs text-muted-foreground">
                  Movimientos de los últimos 2 meses. Ábrelos con el icono.
                </div>
              </div>
              <Button size="icon" variant="outline" title="Ver estado de cuenta" onClick={() => setEjeOpen(true)}>
                <History className="h-5 w-5" />
              </Button>
            </Card>

            <Dialog open={ejeOpen} onOpenChange={setEjeOpen}>
              <DialogContent className="max-w-md">
                <DialogHeader>
                  <DialogTitle>Estado de cuenta · cuenta eje</DialogTitle>
                </DialogHeader>
                <PeriodoSelector valor={periodoEje} onChange={setPeriodoEje} />
                <div className="max-h-[60vh] overflow-y-auto">
                  {filas.length === 0 && (
                    <div className="text-xs text-muted-foreground">Sin movimientos en este periodo.</div>
                  )}
                  {meses.map(mes => (
                    <div key={mes.label} className="mb-5">
                      <div className="flex items-center justify-between mb-2">
                        <div className="text-sm font-semibold capitalize">{mes.label}</div>
                        <Button size="sm" variant="outline" onClick={() => exportarMes(mes.label, mes.filas)}>
                          <Download className="h-4 w-4 mr-1" /> CSV
                        </Button>
                      </div>
                      <div className="divide-y">
                        {mes.filas.map(f => (
                          <div key={f.m.id} className="flex justify-between items-center gap-2 py-2">
                            <div className="min-w-0">
                              <div className="font-medium text-sm truncate">{etiqueta(f.m)}</div>
                              <div className="text-xs text-muted-foreground">
                                {new Date(f.m.created_at).toLocaleString("es-MX")}
                              </div>
                            </div>
                            <div className="text-right shrink-0">
                              <div className={`font-semibold text-sm ${f.monto > 0 ? "text-green-600" : "text-red-600"}`}>
                                {f.monto > 0 ? "+" : "−"}${Math.abs(f.monto).toFixed(2)}
                              </div>
                              <div className="text-xs text-muted-foreground">
                                Saldo ${f.saldoDespues.toFixed(2)}
                              </div>
                            </div>
                          </div>
                        ))}
                        <div className="flex justify-between items-center py-2 text-sm">
                          <div className="text-muted-foreground">Saldo inicial del mes</div>
                          <div className="font-semibold">
                            ${(mes.filas[mes.filas.length - 1]?.saldoAntes ?? 0).toFixed(2)}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </DialogContent>
            </Dialog>
          </>
        );
      })()}


      {/* Dialog: movimientos de un sub-QR */}
      <Dialog open={!!subMovOpen} onOpenChange={(o) => !o && setSubMovOpen(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Movimientos · {subMovOpen?.alias}</DialogTitle>
          </DialogHeader>
          <PeriodoSelector valor={periodoSub} onChange={setPeriodoSub} />
          {(() => {
            const label = (m: Movimiento) =>
              m.tipo === "cobro_comercio" ? `Cobro ${m.comercio_nombre ?? ""}` :
              m.tipo === "transfer_a_sub" ? "Recibido del titular" :
              m.tipo === "transfer_desde_sub" ? "Devuelto al titular" :
              m.tipo === "transferencia_p2p_in" ? "Transferencia recibida" :
              m.tipo === "transferencia_p2p_out" ? "Transferencia enviada" :
              m.tipo;
            const esPositivo = (t: string) => t === "transfer_a_sub" || t === "transferencia_p2p_in";

            // Saldo corrido del sub-QR: desde su saldo actual hacia atrás
            let corrido = Number(subMovOpen?.saldo_mxn ?? 0);
            const todas = subMovs.map(m => {
              const monto = Math.abs(Number(m.monto_mxn)) * (esPositivo(m.tipo) ? 1 : -1);
              const saldoDespues = corrido;
              corrido = +(corrido - monto).toFixed(2);
              return { m, monto, saldoDespues: +saldoDespues.toFixed(2) };
            });
            const desde = Date.now() - periodoSub * 24 * 3600 * 1000;
            const filas = todas.filter(f => new Date(f.m.created_at).getTime() >= desde);

            if (filas.length === 0) {
              return <div className="text-xs text-muted-foreground">Sin movimientos en este periodo.</div>;
            }
            return (
              <div className="divide-y max-h-[60vh] overflow-y-auto">
                {filas.map(f => (
                  <div key={f.m.id} className="flex justify-between items-center gap-2 py-2">
                    <div className="min-w-0">
                      <div className="font-medium text-sm truncate">{label(f.m)}</div>
                      <div className="text-xs text-muted-foreground">
                        {new Date(f.m.created_at).toLocaleString("es-MX")}
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className={`font-semibold text-sm ${f.monto > 0 ? "text-green-600" : "text-red-600"}`}>
                        {f.monto > 0 ? "+" : "−"}${Math.abs(f.monto).toFixed(2)}
                      </div>
                      <div className="text-xs text-muted-foreground">Saldo ${f.saldoDespues.toFixed(2)}</div>
                    </div>
                  </div>
                ))}
              </div>
            );
          })()}
        </DialogContent>
      </Dialog>

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
            {[
              { id: "titular", nombre: subs.find(x => x.sub_index === 0)?.alias || "Titular", term: "00" },
              ...subs
                .filter(s => s.estado !== "cancelada")
                .map(s => ({ id: s.id, nombre: s.alias, term: String(s.sub_index).padStart(2, "0") })),
            ].map(op => {
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
              const cards = printSel.map(id => {
                if (id === "titular") {
                  return {
                    qardNumber: qardNumber,
                    vencimiento: subs.find(x => x.sub_index === 0)?.fecha_vencimiento ?? "12/99",
                    alias: subs.find(x => x.sub_index === 0)?.alias,
                    subtitle: "Tarjeta principal · 00",
                  };
                }
                const s = subs.find(x => x.id === id)!;
                return {
                  qardNumber: s.qard_number,
                  vencimiento: s.fecha_vencimiento ?? "12/99",
                  alias: s.alias,
                  subtitle: `${s.alias} · ${String(s.sub_index).padStart(2, "0")}`,
                };
              });
              setPrintOpen(false);
              await generarPdfTarjetasQard(cards);
            }}
          >
            <Printer className="h-4 w-4 mr-2" />
            Imprimir {printSel.length > 0 ? `(${printSel.length})` : ""}
          </Button>
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

      <Button variant="outline" className="w-full" onClick={() => nav("/qard/cobrar")}>
        Soy comercio · Cobrar a un QR
      </Button>
    </div>
  );
}
