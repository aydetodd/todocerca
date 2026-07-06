import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "@/hooks/use-toast";
import { QRCodeSVG } from "qrcode.react";
import { CreditCard, Plus, Minus, RefreshCw, Trash2, ArrowLeft, Wallet, Eye, EyeOff, RotateCw, Printer, Power, History } from "lucide-react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { generarPdfTarjetasQard } from "@/lib/qardPrint";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

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
};
type WalletRow = { id: string; saldo_mxn: number; estado: string };
type Movimiento = {
  id: string; tipo: string; monto_mxn: number; saldo_despues: number;
  descripcion: string | null; created_at: string; comercio_nombre: string | null;
  sub_qr_id: string | null;
};

function formatNumero(n?: string | null) {
  if (!n) return "---- ---- ---- ----";
  return `${n.slice(0, 4)} ${n.slice(4, 8)} ${n.slice(8, 12)} ${n.slice(12, 16)}`;
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
  const [filtroGrupo, setFiltroGrupo] = useState<"activa" | "apagada" | "cancelada">("activa");
  const [subMovOpen, setSubMovOpen] = useState<SubQR | null>(null);
  const [subMovs, setSubMovs] = useState<Movimiento[]>([]);

  const abrirMovsSub = async (sub: SubQR) => {
    setSubMovOpen(sub);
    setSubMovs([]);
    const { data } = await supabase
      .from("qard_movimientos" as any)
      .select("*")
      .eq("sub_qr_id", sub.id)
      .order("created_at", { ascending: false })
      .limit(50);
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
      supabase.from("qard_movimientos" as any).select("*").eq("titular_user_id", user.id).order("created_at", { ascending: false }).limit(20),
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
  const saldoColor = saldo < 0 ? "text-red-600" : "text-green-600";

  return (
    <div className="p-4 max-w-3xl mx-auto pb-40 space-y-4">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="icon" onClick={() => nav(-1)}><ArrowLeft className="h-5 w-5" /></Button>
        <h1 className="text-2xl font-bold flex items-center gap-2"><Wallet className="h-6 w-6" /> QaRd</h1>
        <Button variant="ghost" size="icon" className="ml-auto" onClick={cargar}><RefreshCw className="h-4 w-4" /></Button>
      </div>

      {/* Tarjeta titular */}
      {(() => {
        const titular = subs.find(s => s.sub_index === 0);
        return (
          <Card className="p-5 bg-gradient-to-br from-primary/10 to-primary/5 border-primary/30">
            <div className="flex items-center gap-2 mb-2 text-xs uppercase tracking-wider text-muted-foreground">
              <CreditCard className="h-4 w-4" /> Tarjeta principal (00)
            </div>
            <div className="font-mono text-xl tracking-wider mb-3">{formatNumero(qardNumber)}</div>
            <div className="flex items-end justify-between gap-4">
              <div>
                <div className="text-xs text-muted-foreground">Saldo</div>
                <div className={`text-3xl font-bold ${saldoColor}`}>${saldo.toFixed(2)}</div>
                {saldo < 0 && <div className="text-xs text-red-600 mt-1">Recarga para seguir usando (máx −$50)</div>}
                <div className="flex gap-4 mt-2 text-xs">
                  <div>
                    <div className="text-muted-foreground">Vence</div>
                    <div className="font-mono font-semibold">{titular?.fecha_vencimiento ?? "12/99"}</div>
                  </div>
                  <div>
                    <div className="text-muted-foreground">CVV</div>
                    <div className="flex items-center gap-1">
                      <span className="font-mono font-semibold">
                        {titular && cvvVisible[titular.id] ? titular.cvv : "•••"}
                      </span>
                      {titular && (
                        <>
                          <button onClick={() => setCvvVisible(v => ({ ...v, [titular.id]: !v[titular.id] }))}>
                            {cvvVisible[titular.id] ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                          </button>
                          <button onClick={() => rotarCvv(titular.id)} title="Cambiar CVV">
                            <RotateCw className="h-3 w-3" />
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              </div>
              {qardNumber && (
                <div className="bg-white p-2 rounded-lg">
                  <QRCodeSVG value={qardNumber} size={96} level="H" />
                </div>
              )}
            </div>
            {qardNumber && (
              <Button
                variant="outline"
                size="sm"
                className="w-full mt-3"
                onClick={() => generarPdfTarjetasQard(qardNumber, titular?.fecha_vencimiento ?? "12/99")}
              >
                <Printer className="h-4 w-4 mr-2" />
                Imprimir tarjetas (PDF · 4 por hoja)
              </Button>
            )}
          </Card>
        );
      })()}

      {/* Recargar */}
      <Card className="p-4">
        <div className="font-semibold mb-2">Recargar saldo</div>
        <div className="flex gap-2">
          <Input type="number" min={200} step={50} value={monto} onChange={e => setMonto(e.target.value)} placeholder="Monto MXN" />
          <Button onClick={recargar}><Plus className="h-4 w-4 mr-1" /> Recargar</Button>
        </div>
        <div className="text-xs text-muted-foreground mt-1">Mínimo $200 MXN. Recibes el monto exacto, sin descuentos.</div>
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
              <div className="bg-white p-1 rounded"><QRCodeSVG value={s.qard_number} size={56} /></div>
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
                <div className="flex gap-3 text-[11px] mt-1">
                  <span>Vence <b className="font-mono">{s.fecha_vencimiento ?? "12/99"}</b></span>
                  <span className="flex items-center gap-1">
                    CVV <b className="font-mono">{cvvVisible[s.id] ? s.cvv : "•••"}</b>
                    <button onClick={() => setCvvVisible(v => ({ ...v, [s.id]: !v[s.id] }))}>
                      {cvvVisible[s.id] ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                    </button>
                    <button onClick={() => rotarCvv(s.id)} title="Cambiar CVV"><RotateCw className="h-3 w-3" /></button>
                  </span>
                </div>
                {s.limite_por_transaccion && <div className="text-[11px] mt-0.5">Máx por cobro: ${Number(s.limite_por_transaccion).toFixed(2)}</div>}
              </div>
              <div className="flex flex-col gap-1">
                <Button
                  size="sm"
                  variant="ghost"
                  title="Imprimir tarjetas (PDF)"
                  onClick={() =>
                    generarPdfTarjetasQard(s.qard_number, s.fecha_vencimiento ?? "12/99", s.alias)
                  }
                >
                  <Printer className="h-4 w-4" />
                </Button>
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

      {/* Movimientos de la cuenta eje */}
      {(() => {
        const titularId = subs.find(s => s.sub_index === 0)?.id;
        const ejeMov = mov.filter(m =>
          !m.sub_qr_id || m.sub_qr_id === titularId ||
          m.tipo === "transfer_a_sub" || m.tipo === "transfer_desde_sub" || m.tipo === "recarga"
        );
        return (
          <Card className="p-4">
            <div className="font-semibold mb-2">Últimos movimientos · cuenta eje</div>
            {ejeMov.length === 0 && <div className="text-xs text-muted-foreground">Sin movimientos.</div>}
            <div className="space-y-2">
              {ejeMov.map(m => {
                const aliasFromDesc = (m.descripcion || "").replace(/^(Asignado a sub-QR |Retirado de sub-QR )/, "");
                const label =
                  m.tipo === "recarga" ? "Recarga" :
                  m.tipo === "cobro_comercio" ? `Cobro ${m.comercio_nombre ?? ""}` :
                  m.tipo === "transfer_a_sub" ? `Transferir a ${aliasFromDesc}` :
                  m.tipo === "transfer_desde_sub" ? `Devolver de ${aliasFromDesc}` :
                  m.tipo;
                const positivo = m.tipo === "recarga" || m.tipo === "transfer_desde_sub";
                return (
                  <div key={m.id} className="flex justify-between text-sm border-b pb-1">
                    <div>
                      <div className="font-medium">{label}</div>
                      <div className="text-xs text-muted-foreground">{new Date(m.created_at).toLocaleString()}</div>
                    </div>
                    <div className={`font-semibold ${positivo ? "text-green-600" : "text-red-600"}`}>
                      {positivo ? "+" : "−"}${Math.abs(Number(m.monto_mxn)).toFixed(2)}
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>
        );
      })()}

      {/* Dialog: movimientos de un sub-QR */}
      <Dialog open={!!subMovOpen} onOpenChange={(o) => !o && setSubMovOpen(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Movimientos · {subMovOpen?.alias}</DialogTitle>
          </DialogHeader>
          {subMovs.length === 0 && <div className="text-xs text-muted-foreground">Sin movimientos.</div>}
          <div className="space-y-2 max-h-[60vh] overflow-y-auto">
            {subMovs.map(m => {
              const label =
                m.tipo === "cobro_comercio" ? `Cobro ${m.comercio_nombre ?? ""}` :
                m.tipo === "transfer_a_sub" ? "Recibido del titular" :
                m.tipo === "transfer_desde_sub" ? "Devuelto al titular" :
                m.tipo;
              const positivo = m.tipo === "transfer_a_sub";
              return (
                <div key={m.id} className="flex justify-between text-sm border-b pb-1">
                  <div>
                    <div className="font-medium">{label}</div>
                    <div className="text-xs text-muted-foreground">{new Date(m.created_at).toLocaleString()}</div>
                  </div>
                  <div className={`font-semibold ${positivo ? "text-green-600" : "text-red-600"}`}>
                    {positivo ? "+" : "−"}${Math.abs(Number(m.monto_mxn)).toFixed(2)}
                  </div>
                </div>
              );
            })}
          </div>
        </DialogContent>
      </Dialog>

      <Button variant="outline" className="w-full" onClick={() => nav("/qard/cobrar")}>
        Soy comercio · Cobrar a un QR
      </Button>
    </div>
  );
}
