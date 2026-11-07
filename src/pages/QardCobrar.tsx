import { useEffect, useRef, useState, useCallback } from "react";
import { construirLibro, estadoDeCuenta } from "@/lib/qardEtiquetas";
import { Html5Qrcode } from "html5-qrcode";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { ArrowLeft, ScanLine, CircleDollarSign, RefreshCw, Wallet } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Navigate, useNavigate, useSearchParams } from "react-router-dom";
import { toast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { NumericKeypadScreen } from "@/components/qard/NumericKeypadScreen";
import { formatHermosillo } from "@/lib/utils";
import { registrarPuntoTraza, registrarPuntoTrazaDeTercero } from "@/lib/traza";
import { paymentCvvValid, businessBalance } from '@/lib/terminales';

export default function QardCobrar() {
  const nav = useNavigate();
  const [params] = useSearchParams();
  const terminalEntry = params.get('terminal') === '1';
  const [monto, setMonto] = useState("");
  const [scanning, setScanning] = useState(false);
  const [manualOpen, setManualOpen] = useState(false);
  const [manualQard, setManualQard] = useState("");
  const [manualVenc, setManualVenc] = useState("12/99");
  const [manualCvv, setManualCvv] = useState("");
  const [manualCvvKeypadOpen, setManualCvvKeypadOpen] = useState(false);
  const [cvvOpen, setCvvOpen] = useState(false);
  const [pendingQard, setPendingQard] = useState("");
  const [scanCvv, setScanCvv] = useState("");
  const collectionBusy = useRef(false);
  const collectionRequest = useRef<{ signature: string; key: string } | null>(null);

  const [ultimo, setUltimo] = useState<any>(null);
  const [cobros, setCobros] = useState<any[]>([]);
  const [totalNeto, setTotalNeto] = useState(0);
  const [totalBruto, setTotalBruto] = useState(0);
  const cargarCobros = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { data: snapshot, error } = await supabase.rpc('terminal_business_snapshot', { _code: 'collection' });
    if (error) { setCobros([]); setTotalNeto(0); setUltimo({ ok: false, mensaje: error.message }); return; }
    const business = snapshot as { saldo_empresarial: number; movimientos: any[] } | null;
    const rows = business?.movimientos ?? [];
    setCobros(rows);
    setTotalBruto(rows.filter(r => r.tipo === 'cobro_recibido').reduce((n, r) => n + Number(r.monto_mxn), 0));
    setTotalNeto(businessBalance(business));
  }, []);


  useEffect(() => {
    cargarCobros();
    const ch = supabase.channel(`qard-cobros-${crypto.randomUUID()}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "qard_movimientos" }, () => cargarCobros())
      .on("postgres_changes", { event: "*", schema: "public", table: "qard_wallets" }, () => cargarCobros())
      .on("postgres_changes", { event: "*", schema: "public", table: "terminal_permissions" }, () => cargarCobros())
      .subscribe();

    return () => { supabase.removeChannel(ch); };
  }, [cargarCobros]);
  const scannerRef = useRef<Html5Qrcode | null>(null);

  const stopScan = async () => {
    try { await scannerRef.current?.stop(); await scannerRef.current?.clear(); } catch {}
    scannerRef.current = null;
    setScanning(false);
  };

  useEffect(() => () => { stopScan(); }, []);

  const iniciarEscaneo = async () => {
    const m = Number(monto);
    if (!m || m <= 0) return toast({ title: "Escribe un monto válido", variant: "destructive" });
    setUltimo(null);
    setScanning(true);
    await new Promise(r => setTimeout(r, 50));
    const el = document.getElementById("qard-reader");
    if (!el) { setScanning(false); return; }
    const scanner = new Html5Qrcode("qard-reader");
    scannerRef.current = scanner;
    try {
      await scanner.start(
        { facingMode: "environment" },
        { fps: 10, qrbox: 250 },
        async (text) => {
          await stopScan();
          const clean = String(text).replace(/\D/g, "");
          if (clean.length !== 16) {
            setUltimo({ ok: false, mensaje: "QR inválido (no son 16 dígitos)", color: "rojo" });
            return;
          }
          // Todo cobro de comercio pide CVV de la tarjeta (el transporte no lo pide)
          setPendingQard(clean);
          setScanCvv("");
          setCvvOpen(true);
        },

        () => {}
      );
    } catch (e: any) {
      toast({ title: "No se pudo abrir la cámara", description: e.message, variant: "destructive" });
      setScanning(false);
    }
  };

  const procesarCobro = async (qard: string, m: number, opts?: { cvv?: string; manual?: boolean }) => {
    if (!terminalEntry) return;
    if (collectionBusy.current) return;
    const clean = qard.replace(/\D/g, "");
    if (clean.length !== 16) {
      setUltimo({ ok: false, mensaje: "QR inválido (no son 16 dígitos)", color: "rojo" });
      return;
    }
    const signature = `${clean}:${m}`;
    if (collectionRequest.current?.signature !== signature) collectionRequest.current = { signature, key: crypto.randomUUID() };
    collectionBusy.current = true;
    const { data, error } = await supabase.functions.invoke("qard-cobrar-comercio", {
      body: { qard_number: clean, monto_mxn: m, cvv: opts?.cvv, manual: !!opts?.manual,
        request_key: collectionRequest.current.key, terminal: true },
    }).finally(() => { collectionBusy.current = false; });
    if (error) {
      console.error("cobro", error);
      setUltimo({ ok: false, mensaje: "No se pudo completar en este momento; intenta de nuevo", color: "rojo" });
      return;
    }
    setUltimo(data);
    if (data.ok) {
      collectionRequest.current = null;
      setManualCvv("");
      setScanCvv("");
      setMonto("");
      toast({ title: data.mensaje });
      // Punto de trazado del comercio (solo si tiene la trazabilidad activa)
      void registrarPuntoTraza({ tipo: "cobro", receptorId: clean, receptorNombre: data?.pagador_nombre || null });
      // Punto de trazado en el mapa del pagador (si él la tiene activa)
      void registrarPuntoTrazaDeTercero(clean, "pago");
      await cargarCobros();
      setTimeout(() => { cargarCobros(); }, 1200);
    }
  };

  const abrirManual = () => {
    const m = Number(monto);
    if (!m || m <= 0) return toast({ title: "Escribe un monto", variant: "destructive" });
    setManualQard("");
    setManualVenc("12/99");
    setManualCvv("");
    setManualOpen(true);
  };

  const abrirTecladoCvvManual = () => {
    setManualOpen(false);
    setManualCvvKeypadOpen(true);
  };

  const cerrarTecladoCvvManual = () => {
    setManualCvvKeypadOpen(false);
    setManualOpen(true);
  };

  const formatQardInput = (v: string) => {
    const d = v.replace(/\D/g, "").slice(0, 16);
    return d.replace(/(.{4})/g, "$1 ").trim();
  };

  const formatVencInput = (v: string) => {
    const d = v.replace(/\D/g, "").slice(0, 4);
    if (d.length <= 2) return d;
    return `${d.slice(0, 2)}/${d.slice(2)}`;
  };

  const confirmarCvvEscaneo = async () => {
    if (!paymentCvvValid(scanCvv)) return toast({ title: "CVV inválido", description: "CVV de 3 dígitos del pagador", variant: "destructive" });
    const m = Number(monto);
    setCvvOpen(false);
    await procesarCobro(pendingQard, m, { cvv: scanCvv });
  };


  const confirmarManual = async () => {
    const digits = manualQard.replace(/\D/g, "");
    if (digits.length !== 16) return toast({ title: "El QR debe tener 16 dígitos", variant: "destructive" });
    if (manualVenc !== "12/99") return toast({ title: "Vencimiento inválido", description: "Todas las QaRd vencen 12/99", variant: "destructive" });
    if (!paymentCvvValid(manualCvv)) return toast({ title: "CVV inválido", description: "CVV de 3 dígitos del pagador", variant: "destructive" });
    const m = Number(monto);
    setManualOpen(false);
    await procesarCobro(digits, m, { cvv: manualCvv, manual: true });
  };

  if (!terminalEntry) return <Navigate to="/dashboard" replace />;

  return (
    <div className="p-4 max-w-lg mx-auto pb-40 space-y-4">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="icon" onClick={() => nav(-1)}><ArrowLeft className="h-5 w-5" /></Button>
        <h1 className="text-2xl font-bold flex items-center gap-2"><CircleDollarSign className="h-6 w-6" /> Terminal de cobro</h1>
      </div>

      <Card className="p-4 space-y-3">
        <div>
          <label className="text-sm font-medium">Monto a cobrar (MXN)</label>
          <Input
            type="number" step="0.01" min="0"
            value={monto} onChange={e => setMonto(e.target.value)}
            className="text-2xl h-14"
            disabled={scanning}
          />
          <p className="text-xs text-muted-foreground mt-1">El cliente autoriza el pago con su CVV de 3 dígitos.</p>
        </div>

        {!scanning ? (
          <div className="flex gap-2">
            <Button className="flex-1" size="lg" onClick={iniciarEscaneo}><ScanLine className="h-5 w-5 mr-2" /> ESCANEAR QR</Button>
            <Button variant="outline" onClick={abrirManual}>Manual</Button>
          </div>
        ) : (
          <div>
            <div id="qard-reader" className="w-full rounded overflow-hidden bg-black" />
            <Button variant="outline" className="w-full mt-2" onClick={stopScan}>Cancelar</Button>
          </div>
        )}
      </Card>

      {ultimo && (
        <Card className={`p-6 text-center border-4 ${
          ultimo.ok
            ? "border-primary bg-primary text-primary-foreground"
            : "border-destructive bg-destructive/10 text-destructive"
        }`}>
          <div className="text-2xl font-bold leading-snug">{ultimo.mensaje}</div>

          {ultimo.ok && (
            <>
              {ultimo.titular_nombre && (
                <div className="mt-2 text-base font-semibold uppercase tracking-wide">
                  {ultimo.titular_nombre}
                </div>
              )}
              <div className="text-sm mt-2 opacity-90">Sub-QR: {String(ultimo.sub_index).padStart(2, "0")} · {ultimo.alias}</div>
              <div className="mt-3 text-sm">Recibes: <b>${Number(ultimo.neto).toFixed(2)}</b></div>
              
            </>
          )}

        </Card>
      )}

      <Card className="p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2 font-semibold text-foreground">
            <Wallet className="h-5 w-5 text-primary" /> Libro de cobros empresarial
          </div>
          <Button variant="ghost" size="icon" onClick={cargarCobros} title="Actualizar">
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>
        <div className="grid grid-cols-2 gap-2 text-center mb-3">
          <div className="rounded bg-muted p-2">
            <div className="text-[10px] text-muted-foreground uppercase">Cobrado</div>
            <div className="font-bold text-foreground">${totalBruto.toFixed(2)}</div>
          </div>
          <div className="rounded-xl bg-primary p-2 shadow-[var(--shadow-button)]">
            <div className="text-[10px] text-primary-foreground/90 uppercase">Saldo Empresarial</div>
            <div className="font-bold text-primary-foreground text-[20px] leading-tight">${totalNeto.toFixed(2)}</div>
          </div>
        </div>

        <div className="text-[11px] text-muted-foreground mb-2">
          Últimos {cobros.length} movimientos.
        </div>
        {cobros.length === 0 ? (
          <div className="text-xs text-muted-foreground text-center py-3">Sin movimientos aún.</div>
        ) : (
          <div className="space-y-1 max-h-72 overflow-y-auto">
            {(() => {
              const ledger = estadoDeCuenta(construirLibro(cobros, null), 'cobros', totalNeto);
              const balances = new Map(ledger.map(r => [r.r.key, r]));
              return cobros.map((m) => {
                const entry = balances.get(m.id);
                const esRetiro = (entry?.monto ?? 0) < 0;
                const importe = Math.abs(Number(m.monto_mxn ?? 0));
                return (
                  <div key={m.id} className="flex justify-between items-center text-sm border-b border-border pb-1">
                    <div className="min-w-0 pr-2">
                      <div className="font-medium truncate text-foreground">{entry?.r.etiqueta ?? "Movimiento empresarial"}</div>
                      <div className="text-[11px] text-muted-foreground">
                        {formatHermosillo(m.created_at)}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className={`font-semibold ${esRetiro ? "text-destructive" : "text-foreground"}`}>
                        {esRetiro ? "−" : "+"}${importe.toFixed(2)}
                      </div>
                      <div className="text-[11px] text-muted-foreground">
                        Saldo ${(entry?.saldoDespues ?? m.saldo_despues).toFixed(2)}
                      </div>
                    </div>
                  </div>
                );
              });
            })()}
          </div>

        )}
      </Card>






      <NumericKeypadScreen
        open={cvvOpen}
        onClose={() => setCvvOpen(false)}
        onSubmit={confirmarCvvEscaneo}
        value={scanCvv}
        onChange={setScanCvv}
        maxLength={3}
        title="CVV de 3 dígitos del pagador"
        subtitle={`Tarjeta •••• ${pendingQard.slice(-4)} · Monto $${Number(monto || 0).toFixed(2)}`}
      />

      <Dialog open={manualOpen} onOpenChange={setManualOpen}>

        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Cobro manual</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <label className="text-sm font-medium">Número QaRd (16 dígitos)</label>
              <Input
                inputMode="numeric"
                value={manualQard}
                onChange={(e) => setManualQard(formatQardInput(e.target.value))}
                
                className="text-lg tracking-widest"
                maxLength={19}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-sm font-medium">Vence</label>
                <Input
                  inputMode="numeric"
                  value={manualVenc}
                  onChange={(e) => setManualVenc(formatVencInput(e.target.value))}
                  
                  maxLength={5}
                />
                <p className="text-[10px] text-muted-foreground mt-1">Todas vencen 12/99</p>
              </div>
              <div>
                <label className="text-sm font-medium">CVV</label>
                <Button
                  type="button"
                  variant="outline"
                  className="w-full justify-start h-11"
                   onClick={abrirTecladoCvvManual}
                >
                   <span className={manualCvv ? "text-lg tracking-[0.5em]" : "text-sm whitespace-nowrap"}>
                    {manualCvv ? "•".repeat(manualCvv.length) : "Escribir CVV"}
                  </span>
                </Button>
              </div>
            </div>
            <div className="text-sm bg-muted rounded p-2">
              Monto a cobrar: <b>${Number(monto || 0).toFixed(2)}</b>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setManualOpen(false)}>Cancelar</Button>
            <Button onClick={confirmarManual}>Cobrar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <NumericKeypadScreen
        open={manualCvvKeypadOpen}
        onClose={cerrarTecladoCvvManual}
        onSubmit={cerrarTecladoCvvManual}
        value={manualCvv}
        onChange={setManualCvv}
        maxLength={3}
        title="CVV de 3 dígitos del pagador"
      />

    </div>
  );
}
