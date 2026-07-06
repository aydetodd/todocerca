import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "@/hooks/use-toast";
import { QRCodeSVG } from "qrcode.react";
import { CreditCard, Plus, RefreshCw, Trash2, ArrowLeft, Wallet, Eye, EyeOff, RotateCw } from "lucide-react";
import { useNavigate, useSearchParams } from "react-router-dom";

type SubQR = {
  id: string;
  sub_index: number;
  qard_number: string;
  alias: string;
  limite_por_transaccion: number | null;
  estado: "activa" | "cancelada";
  fecha_vencimiento: string | null;
  cvv: string | null;
};
type WalletRow = { id: string; saldo_mxn: number; estado: string };
type Movimiento = {
  id: string; tipo: string; monto_mxn: number; saldo_despues: number;
  descripcion: string | null; created_at: string; comercio_nombre: string | null;
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
      .on("postgres_changes", { event: "*", schema: "public", table: "qard_movimientos" }, () => cargar())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
    // eslint-disable-next-line
  }, []);

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
          </div>
          {qardNumber && (
            <div className="bg-white p-2 rounded-lg">
              <QRCodeSVG value={qardNumber} size={96} level="H" />
            </div>
          )}
        </div>
      </Card>

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
          {subs.filter(s => s.sub_index > 0).map(s => (
            <div key={s.id} className="flex items-center gap-3 border rounded p-2">
              <div className="bg-white p-1 rounded"><QRCodeSVG value={s.qard_number} size={56} /></div>
              <div className="flex-1 min-w-0">
                <div className="font-semibold truncate">{s.alias} · {String(s.sub_index).padStart(2, "0")}</div>
                <div className="font-mono text-xs text-muted-foreground">{formatNumero(s.qard_number)}</div>
                {s.limite_por_transaccion && <div className="text-xs">Límite: ${Number(s.limite_por_transaccion).toFixed(2)}</div>}
                {s.estado === "cancelada" && <div className="text-xs text-red-600">CANCELADO</div>}
              </div>
              {s.estado === "activa" && (
                <Button size="sm" variant="ghost" onClick={() => cancelarSub(s.id)}><Trash2 className="h-4 w-4 text-red-600" /></Button>
              )}
            </div>
          ))}
          {subs.filter(s => s.sub_index > 0).length === 0 && (
            <div className="text-xs text-muted-foreground">Aún no tienes sub-QR familiares.</div>
          )}
        </div>
      </Card>

      {/* Movimientos */}
      <Card className="p-4">
        <div className="font-semibold mb-2">Últimos movimientos</div>
        {mov.length === 0 && <div className="text-xs text-muted-foreground">Sin movimientos.</div>}
        <div className="space-y-2">
          {mov.map(m => (
            <div key={m.id} className="flex justify-between text-sm border-b pb-1">
              <div>
                <div className="font-medium">{m.tipo === "recarga" ? "Recarga" : m.tipo === "cobro_comercio" ? `Cobro ${m.comercio_nombre ?? ""}` : m.tipo}</div>
                <div className="text-xs text-muted-foreground">{new Date(m.created_at).toLocaleString()}</div>
              </div>
              <div className={`font-semibold ${m.tipo === "recarga" ? "text-green-600" : "text-red-600"}`}>
                {m.tipo === "recarga" ? "+" : "−"}${Math.abs(Number(m.monto_mxn)).toFixed(2)}
              </div>
            </div>
          ))}
        </div>
      </Card>

      <Button variant="outline" className="w-full" onClick={() => nav("/qard/cobrar")}>
        Soy comercio · Cobrar a un QR
      </Button>
    </div>
  );
}
