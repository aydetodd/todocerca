import { useEffect, useRef, useState, useCallback } from "react";
import { Html5Qrcode } from "html5-qrcode";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { ArrowLeft, ScanLine, CircleDollarSign, RefreshCw, Wallet, Banknote, Building2, CreditCard, ArrowRightLeft } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";
import { toast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { NumericKeypadScreen } from "@/components/qard/NumericKeypadScreen";
import { RETIROS_STP_ENABLED, MENSAJE_RETIRO_PROXIMAMENTE } from "@/lib/featureFlags";
import { formatHermosillo } from "@/lib/utils";
import { registrarPuntoTraza, registrarPuntoTrazaDeTercero } from "@/lib/traza";

export default function QardCobrar() {
  const nav = useNavigate();
  const [monto, setMonto] = useState("");
  const [scanning, setScanning] = useState(false);
  const [manualOpen, setManualOpen] = useState(false);
  const [manualQard, setManualQard] = useState("");
  const [manualVenc, setManualVenc] = useState("12/99");
  const [manualCvv, setManualCvv] = useState("");
  const [cvvOpen, setCvvOpen] = useState(false);
  const [pendingQard, setPendingQard] = useState("");
  const [scanCvv, setScanCvv] = useState("");

  const [ultimo, setUltimo] = useState<any>(null);
  const [cobros, setCobros] = useState<any[]>([]);
  const [totalNeto, setTotalNeto] = useState(0);
  const [totalBruto, setTotalBruto] = useState(0);
  const [totalComision, setTotalComision] = useState(0);
  const [totalRetirado, setTotalRetirado] = useState(0);
  const [saldoEje, setSaldoEje] = useState(0);

  // Traspaso de la bolsa de cobros a la cuenta eje (gratis)
  const [traspasoOpen, setTraspasoOpen] = useState(false);
  const [traspasoMonto, setTraspasoMonto] = useState("");
  const [traspasoLoading, setTraspasoLoading] = useState(false);
  const [retiroOrigen, setRetiroOrigen] = useState<"comercio" | "eje">("comercio");

  // Retiro
  const [retiroOpen, setRetiroOpen] = useState(false);
  const [retiroMetodo, setRetiroMetodo] = useState<"oxxo" | "spei" | "qard">("oxxo");
  const [retiroMonto, setRetiroMonto] = useState("");
  const [retiroDestino, setRetiroDestino] = useState("");
  const [retiroCvv, setRetiroCvv] = useState("");
  const [retiroLoading, setRetiroLoading] = useState(false);

  const [manualCvvKeypadOpen, setManualCvvKeypadOpen] = useState(false);
  const [retiroCvvKeypadOpen, setRetiroCvvKeypadOpen] = useState(false);

  const cargarCobros = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const [{ data }, { data: w }] = await Promise.all([
      supabase
        .from("qard_movimientos" as any)
        .select("*")
        .eq("comercio_user_id", user.id)
        .in("tipo", ["cobro_recibido", "retiro_oxxo", "retiro_spei", "retiro_qard", "traspaso_cobros_out"])
        .order("created_at", { ascending: false })
        .limit(80),
      supabase.from("qard_wallets" as any).select("saldo_mxn, saldo_comercio_mxn").eq("titular_user_id", user.id).maybeSingle(),
    ]);
    const rows = (data as any[]) ?? [];
    setCobros(rows);
    const soloCobros = rows.filter(r => r.tipo === "cobro_recibido");
    const soloRetiros = rows.filter(r => String(r.tipo).startsWith("retiro_"));
    // Los cobros internos NO llevan comisión: siempre vale el monto completo.
    const bruto = soloCobros.reduce((s, r) => s + Math.abs(Number(r.monto_mxn ?? 0)), 0);
    const retirado = soloRetiros.reduce((s, r) => s + Math.abs(Number(r.monto_mxn ?? 0)), 0);
    setTotalBruto(bruto);
    setTotalComision(0);
    setTotalRetirado(retirado);
    // Disponible = bolsa de COBROS (separada de la cuenta eje)
    setTotalNeto(Number((w as any)?.saldo_comercio_mxn ?? 0));
    setSaldoEje(Number((w as any)?.saldo_mxn ?? 0));
  }, []);


  useEffect(() => {
    cargarCobros();
    const ch = supabase.channel("qard-cobros-comercio")
      .on("postgres_changes", { event: "*", schema: "public", table: "qard_movimientos" }, () => cargarCobros())
      .on("postgres_changes", { event: "*", schema: "public", table: "qard_wallets" }, () => cargarCobros())
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
    const clean = qard.replace(/\D/g, "");
    if (clean.length !== 16) {
      setUltimo({ ok: false, mensaje: "QR inválido (no son 16 dígitos)", color: "rojo" });
      return;
    }
    const { data, error } = await supabase.functions.invoke("qard-cobrar-comercio", {
      body: { qard_number: clean, monto_mxn: m, cvv: opts?.cvv, manual: !!opts?.manual },
    });
    if (error) {
      setUltimo({ ok: false, mensaje: error.message, color: "rojo" });
      return;
    }
    setUltimo(data);
    if (data.ok) {
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
    if (!/^\d{3,4}$/.test(scanCvv)) return toast({ title: "CVV inválido", description: "3 o 4 dígitos", variant: "destructive" });
    const m = Number(monto);
    setCvvOpen(false);
    await procesarCobro(pendingQard, m, { cvv: scanCvv });
  };


  const confirmarManual = async () => {
    const digits = manualQard.replace(/\D/g, "");
    if (digits.length !== 16) return toast({ title: "El QR debe tener 16 dígitos", variant: "destructive" });
    if (manualVenc !== "12/99") return toast({ title: "Vencimiento inválido", description: "Todas las QaRd vencen 12/99", variant: "destructive" });
    if (!/^\d{3,4}$/.test(manualCvv)) return toast({ title: "CVV inválido", description: "3 o 4 dígitos", variant: "destructive" });
    const m = Number(monto);
    setManualOpen(false);
    await procesarCobro(digits, m, { cvv: manualCvv, manual: true });
  };

  const abrirRetiro = (metodo: "oxxo" | "spei" | "qard") => {
    if (!RETIROS_STP_ENABLED && (metodo === "oxxo" || metodo === "spei")) {
      return toast({ title: "Próximamente", description: MENSAJE_RETIRO_PROXIMAMENTE });
    }
    if (totalNeto <= 0 && saldoEje <= 0) return toast({ title: "Sin saldo disponible", variant: "destructive" });
    setRetiroOrigen(totalNeto > 0 ? "comercio" : "eje");
    setRetiroMetodo(metodo);
    setRetiroMonto("");
    setRetiroDestino("");
    setRetiroCvv("");
    setRetiroOpen(true);
  };

  const confirmarRetiro = async () => {
    const m = Number(retiroMonto);
    if (!m || m < 20) return toast({ title: "Monto mínimo $20", variant: "destructive" });
    const disponibleOrigen = retiroOrigen === "eje" ? saldoEje : totalNeto;
    if (m > disponibleOrigen) return toast({ title: "Excede el saldo de esa bolsa", variant: "destructive" });
    if (retiroMetodo === "qard") {
      const d = retiroDestino.replace(/\D/g, "");
      if (d.length !== 16) {
        return toast({ title: "Ingresa los 16 dígitos de la QaRd destino", variant: "destructive" });
      }
      if (retiroCvv && retiroCvv.length !== 4) {
        return toast({ title: "El CVV dinámico debe tener 4 dígitos", variant: "destructive" });
      }
    }
    if (retiroMetodo === "spei" && retiroDestino) {
      const d = retiroDestino.replace(/\D/g, "");
      if (d.length !== 18) return toast({ title: "CLABE debe tener 18 dígitos", variant: "destructive" });
    }
    setRetiroLoading(true);
    const { data, error } = await supabase.functions.invoke("qard-retirar", {
      body: { metodo: retiroMetodo, monto_mxn: m, destino: retiroDestino, cvv: retiroCvv, origen: retiroOrigen },
    });
    setRetiroLoading(false);
    if (error || !data?.ok) {
      return toast({ title: "No se pudo retirar", description: (data?.error || error?.message) ?? "", variant: "destructive" });
    }
    setRetiroOpen(false);
    toast({ title: data.mensaje, description: `Saldo restante $${Number(data.saldo_despues).toFixed(2)}${data.simulado ? " · Simulado" : ""}` });
    cargarCobros();
  };

  const confirmarTraspaso = async () => {
    const m = Number(traspasoMonto);
    if (!m || m <= 0) return toast({ title: "Escribe un monto", variant: "destructive" });
    if (m > totalNeto) return toast({ title: "Excede tu saldo de cobros", variant: "destructive" });
    setTraspasoLoading(true);
    const { data, error } = await supabase.rpc("qard_pasar_cobros_a_eje" as any, { _monto: m });
    setTraspasoLoading(false);
    const res: any = data;
    if (error || !res?.ok) {
      return toast({ title: "No se pudo traspasar", description: (res?.error || error?.message) ?? "", variant: "destructive" });
    }
    setTraspasoOpen(false);
    setTraspasoMonto("");
    toast({ title: `Pasaste $${m.toFixed(2)} a tu cuenta eje`, description: "Sin comisión" });
    cargarCobros();
  };

  return (
    <div className="p-4 max-w-lg mx-auto pb-40 space-y-4">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="icon" onClick={() => nav(-1)}><ArrowLeft className="h-5 w-5" /></Button>
        <h1 className="text-2xl font-bold flex items-center gap-2"><CircleDollarSign className="h-6 w-6" /> COBRAR con QaRd</h1>
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
          <p className="text-xs text-muted-foreground mt-1">Recibes el monto completo. Transferir a otra QaRd es gratis; solo SPEI y OXXO cobran 2%.</p>
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
            <Wallet className="h-5 w-5 text-primary" /> Mis cobros recibidos
          </div>
          <Button variant="ghost" size="icon" onClick={cargarCobros} title="Actualizar">
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>
        <div className="grid grid-cols-3 gap-2 text-center mb-3">
          <div className="rounded bg-muted p-2">
            <div className="text-[10px] text-muted-foreground uppercase">Cobrado</div>
            <div className="font-bold text-foreground">${totalBruto.toFixed(2)}</div>
          </div>
          <div className="rounded-xl bg-primary p-2 shadow-[var(--shadow-button)]">
            <div className="text-[10px] text-primary-foreground/90 uppercase">En cobros</div>
            <div className="font-bold text-primary-foreground text-[20px] leading-tight">${totalNeto.toFixed(2)}</div>
          </div>
          <div className="rounded bg-muted p-2">
            <div className="text-[10px] text-muted-foreground uppercase">Cuenta eje</div>
            <div className="font-bold text-foreground">${saldoEje.toFixed(2)}</div>
          </div>
        </div>

        <Button
          variant="secondary"
          className="w-full mb-3"
          onClick={() => {
            if (totalNeto <= 0) return toast({ title: "No tienes saldo en cobros", variant: "destructive" });
            setTraspasoMonto(String(totalNeto.toFixed(2)));
            setTraspasoOpen(true);
          }}
        >
          <ArrowRightLeft className="h-4 w-4 mr-2" /> Pasar cobros a mi cuenta eje (gratis)
        </Button>


        <div className="rounded-lg bg-muted p-3 mb-3">
          <div className="text-xs font-semibold mb-2 text-foreground">Retirar saldo</div>
          <div className="grid grid-cols-3 gap-2">
            <Button
              size="sm" variant="outline"
              className={`h-auto py-2 flex-col gap-1 relative ${!RETIROS_STP_ENABLED ? "opacity-50 grayscale" : ""}`}
              onClick={() => abrirRetiro("oxxo")}
            >
              <Banknote className="h-4 w-4" />
              <span className="text-[11px]">OXXO efectivo</span>
              {!RETIROS_STP_ENABLED && <span className="text-[9px] text-muted-foreground">Próximamente</span>}
            </Button>
            <Button
              size="sm" variant="outline"
              className={`h-auto py-2 flex-col gap-1 relative ${!RETIROS_STP_ENABLED ? "opacity-50 grayscale" : ""}`}
              onClick={() => abrirRetiro("spei")}
            >
              <Building2 className="h-4 w-4" />
              <span className="text-[11px]">SPEI a mi banco</span>
              {!RETIROS_STP_ENABLED && <span className="text-[9px] text-muted-foreground">Próximamente</span>}
            </Button>
            <Button size="sm" variant="outline" className="h-auto py-2 flex-col gap-1" onClick={() => abrirRetiro("qard")}>
              <CreditCard className="h-4 w-4" />
              <span className="text-[11px]">A otra QaRd</span>
            </Button>
          </div>
          {!RETIROS_STP_ENABLED && (
            <div className="text-[10px] text-muted-foreground mt-2">
              Transferir a otra QaRd es gratis. SPEI y OXXO cobran 2% (y en OXXO la tienda puede cobrar aparte); estarán disponibles al activar el nuevo proveedor de pagos.
            </div>
          )}
          {totalRetirado > 0 && (
            <div className="text-[10px] text-muted-foreground mt-2">
              Retirado acumulado: ${totalRetirado.toFixed(2)}
            </div>
          )}
        </div>

        <div className="text-[11px] text-muted-foreground mb-2">
          Últimos {cobros.length} movimientos.
        </div>
        {cobros.length === 0 ? (
          <div className="text-xs text-muted-foreground text-center py-3">Sin movimientos aún.</div>
        ) : (
          <div className="space-y-1 max-h-72 overflow-y-auto">
            {(() => {
              // Saldo acumulado desde cero: recorremos del más viejo al más nuevo
              const saldos = new Map<string, number>();
              let acumulado = 0;
              [...cobros].reverse().forEach((m) => {
                const esRet = String(m.tipo).startsWith("retiro_") || m.tipo === "traspaso_cobros_out";
                const imp = Math.abs(Number(m.monto_mxn ?? 0));
                acumulado = +(acumulado + (esRet ? -imp : imp)).toFixed(2);
                saldos.set(m.id, acumulado);
              });
              return cobros.map((m) => {
                const esRetiro = String(m.tipo).startsWith("retiro_") || m.tipo === "traspaso_cobros_out";
                const importe = Math.abs(Number(m.monto_mxn ?? 0));
                return (
                  <div key={m.id} className="flex justify-between items-center text-sm border-b border-border pb-1">
                    <div className="min-w-0 pr-2">
                      <div className="font-medium truncate text-foreground">{m.descripcion || (esRetiro ? "Retiro" : "Cobro QaRd")}</div>
                      <div className="text-[11px] text-muted-foreground">
                        {formatHermosillo(m.created_at)}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className={`font-semibold ${esRetiro ? "text-destructive" : "text-foreground"}`}>
                        {esRetiro ? "−" : "+"}${importe.toFixed(2)}
                      </div>
                      <div className="text-[11px] text-muted-foreground">
                        Saldo ${(saldos.get(m.id) ?? 0).toFixed(2)}
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
        title="CVV de la tarjeta"
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
                  onClick={() => setManualCvvKeypadOpen(true)}
                >
                  <span className="text-lg tracking-[0.5em]">
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
        onClose={() => setManualCvvKeypadOpen(false)}
        onSubmit={() => setManualCvvKeypadOpen(false)}
        value={manualCvv}
        onChange={setManualCvv}
        title="CVV de la tarjeta"
      />

      <Dialog open={retiroOpen} onOpenChange={setRetiroOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>
              {retiroMetodo === "oxxo" && "Retirar efectivo en OXXO"}
              {retiroMetodo === "spei" && "Enviar SPEI a mi banco"}
              {retiroMetodo === "qard" && "Transferir a otra QaRd"}
            </DialogTitle>
            <DialogDescription>
              Disponible: <b>${(retiroOrigen === "eje" ? saldoEje : totalNeto).toFixed(2)}</b>{retiroMetodo !== "qard" ? " · Simulación (sin dinero real)." : ""}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <label className="text-sm font-medium">¿De cuál bolsa?</label>
              <div className="grid grid-cols-2 gap-2 mt-1">
                <Button
                  type="button"
                  variant={retiroOrigen === "comercio" ? "default" : "outline"}
                  className="h-auto py-2 flex-col gap-0.5"
                  onClick={() => setRetiroOrigen("comercio")}
                >
                  <span className="text-[11px]">Mis cobros</span>
                  <span className="text-sm font-bold">${totalNeto.toFixed(2)}</span>
                </Button>
                <Button
                  type="button"
                  variant={retiroOrigen === "eje" ? "default" : "outline"}
                  className="h-auto py-2 flex-col gap-0.5"
                  onClick={() => setRetiroOrigen("eje")}
                >
                  <span className="text-[11px]">Cuenta eje</span>
                  <span className="text-sm font-bold">${saldoEje.toFixed(2)}</span>
                </Button>
              </div>
            </div>
            <div>

              <label className="text-sm font-medium">Monto (MXN)</label>
              <Input
                type="number" step="0.01" min="20"
                value={retiroMonto}
                onChange={e => setRetiroMonto(e.target.value)}
                
                className="text-xl h-12"
              />
              <p className="text-[11px] text-muted-foreground mt-1">
                Mínimo $20. {retiroMetodo === "qard" ? "Sin comisión (0%)." : "Comisión 2% al retirar por este medio."}
              </p>
            </div>

            {retiroMetodo === "spei" && (
              <div>
                <label className="text-sm font-medium">CLABE destino (opcional)</label>
                <Input
                  inputMode="numeric"
                  value={retiroDestino}
                  onChange={e => setRetiroDestino(e.target.value.replace(/\D/g, "").slice(0, 18))}
                  
                  maxLength={18}
                />
                <p className="text-[11px] text-muted-foreground mt-1">Si la dejas vacía, usa la CLABE de tu cuenta de cobros.</p>
              </div>
            )}

            {retiroMetodo === "qard" && (
              <>
                <div>
                  <label className="text-sm font-medium">QaRd destino (16 dígitos)</label>
                  <Input
                    inputMode="numeric"
                    value={retiroDestino}
                    onChange={e => setRetiroDestino(e.target.value.replace(/\D/g, "").slice(0, 16))}
                    
                    maxLength={16}
                    className="tracking-widest"
                  />
                </div>
                <div>
                  <label className="text-sm font-medium">CVV dinámico del destino (4 dígitos)</label>
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full justify-start h-11"
                    onClick={() => setRetiroCvvKeypadOpen(true)}
                  >
                    <span className="text-lg tracking-[0.5em]">
                      {retiroCvv ? "•".repeat(retiroCvv.length) : "Escribir CVV"}
                    </span>
                  </Button>
                  <p className="text-[11px] text-muted-foreground mt-1">
                    Si mandas a otra persona, pide su CVV dinámico de 4 dígitos. Si es tu propia QaRd, puedes dejarlo vacío.
                  </p>
                </div>
              </>
            )}

            {retiroMetodo === "oxxo" && (
              <div className="text-xs bg-muted rounded p-2">
                Se generará una referencia de 14 dígitos válida 72 h en cualquier OXXO.
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRetiroOpen(false)} disabled={retiroLoading}>Cancelar</Button>
            <Button onClick={confirmarRetiro} disabled={retiroLoading}>
              {retiroLoading ? "Procesando…" : "Retirar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <NumericKeypadScreen
        open={retiroCvvKeypadOpen}
        onClose={() => setRetiroCvvKeypadOpen(false)}
        onSubmit={() => setRetiroCvvKeypadOpen(false)}
        value={retiroCvv}
        onChange={setRetiroCvv}
        title="CVV dinámico del destino"
      />
    </div>
  );
}
