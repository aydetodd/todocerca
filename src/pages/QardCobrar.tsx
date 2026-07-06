import { useEffect, useRef, useState } from "react";
import { Html5Qrcode } from "html5-qrcode";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { ArrowLeft, ScanLine, CircleDollarSign } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";
import { toast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";

export default function QardCobrar() {
  const nav = useNavigate();
  const [monto, setMonto] = useState("");
  const [scanning, setScanning] = useState(false);
  const [manualOpen, setManualOpen] = useState(false);
  const [manualQard, setManualQard] = useState("");
  const [manualVenc, setManualVenc] = useState("12/99");
  const [manualCvv, setManualCvv] = useState("");
  const [ultimo, setUltimo] = useState<any>(null);
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
          await procesarCobro(text, m);
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
      toast({ title: data.mensaje, description: `Saldo restante $${Number(data.saldo_despues).toFixed(2)}` });
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

  const confirmarManual = async () => {
    const digits = manualQard.replace(/\D/g, "");
    if (digits.length !== 16) return toast({ title: "El QR debe tener 16 dígitos", variant: "destructive" });
    if (manualVenc !== "12/99") return toast({ title: "Vencimiento inválido", description: "Todas las QaRd vencen 12/99", variant: "destructive" });
    if (!/^\d{3,4}$/.test(manualCvv)) return toast({ title: "CVV inválido", description: "3 o 4 dígitos", variant: "destructive" });
    const m = Number(monto);
    setManualOpen(false);
    await procesarCobro(digits, m, { cvv: manualCvv, manual: true });
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
            placeholder="100.00" className="text-2xl h-14"
            disabled={scanning}
          />
          <p className="text-xs text-muted-foreground mt-1">Comisión 6% (recibes 94%). Sin membresías.</p>
        </div>

        {!scanning ? (
          <div className="flex gap-2">
            <Button className="flex-1" size="lg" onClick={iniciarEscaneo}><ScanLine className="h-5 w-5 mr-2" /> ESCANEAR QR</Button>
            <Button variant="outline" onClick={abrirManual}>Manual</Button>
          </div>
        ) : (
          <div>
            <div id="qard-reader" className="w-full rounded overflow-hidden bg-black" />
            <Button variant="destructive" className="w-full mt-2" onClick={stopScan}>Cancelar</Button>
          </div>
        )}
      </Card>

      {ultimo && (
        <Card className={`p-6 text-center border-4 ${
          ultimo.color === "verde" ? "border-green-500 bg-green-50" :
          ultimo.color === "amarillo" ? "border-yellow-500 bg-yellow-50" :
          ultimo.color === "naranja" ? "border-orange-500 bg-orange-50" :
          "border-red-500 bg-red-50"
        }`}>
          <div className={`text-3xl font-bold ${
            ultimo.color === "verde" ? "text-green-700" :
            ultimo.color === "amarillo" ? "text-yellow-700" :
            ultimo.color === "naranja" ? "text-orange-700" : "text-red-700"
          }`}>{ultimo.mensaje}</div>
          {ultimo.ok && (
            <>
              <div className="text-sm mt-2">Sub-QR: {String(ultimo.sub_index).padStart(2, "0")} · {ultimo.alias}</div>
              <div className="mt-3 text-sm">Recibirás: <b>${Number(ultimo.neto).toFixed(2)}</b> (comisión ${Number(ultimo.comision).toFixed(2)})</div>
              <div className="text-xs text-muted-foreground mt-1">Saldo del cliente: ${Number(ultimo.saldo_despues).toFixed(2)}</div>
            </>
          )}
        </Card>
      )}

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
                placeholder="0000 0000 0000 0000"
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
                  placeholder="12/99"
                  maxLength={5}
                />
                <p className="text-[10px] text-muted-foreground mt-1">Todas vencen 12/99</p>
              </div>
              <div>
                <label className="text-sm font-medium">CVV</label>
                <Input
                  inputMode="numeric"
                  type="password"
                  value={manualCvv}
                  onChange={(e) => setManualCvv(e.target.value.replace(/\D/g, "").slice(0, 4))}
                  placeholder="•••"
                  maxLength={4}
                />
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
    </div>
  );
}
