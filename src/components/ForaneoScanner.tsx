import { useCallback, useEffect, useRef, useState } from "react";
import { Html5Qrcode } from "html5-qrcode";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { X, QrCode, ArrowDownCircle, ArrowUpCircle } from "lucide-react";

interface Props {
  viajeId: string;
  onClose: () => void;
}

type ScanResult = {
  ok: boolean;
  tipo?: "sube" | "baja";
  geocerca?: string;
  monto?: number;
  saldo?: number;
  error?: string;
};

function beep(kind: "sube" | "baja" | "error") {
  try {
    if ("vibrate" in navigator) navigator.vibrate(kind === "error" ? [400, 100, 400] : [120]);
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = "sine";
    o.frequency.value = kind === "sube" ? 880 : kind === "baja" ? 660 : 220;
    o.connect(g);
    g.connect(ctx.destination);
    g.gain.value = 0.2;
    o.start();
    setTimeout(() => { o.stop(); ctx.close(); }, 220);
  } catch {}
}

export function ForaneoScanner({ viajeId, onClose }: Props) {
  const [pos, setPos] = useState<{ lat: number; lng: number } | null>(null);
  const [gpsError, setGpsError] = useState<string | null>(null);
  const [lastResult, setLastResult] = useState<ScanResult | null>(null);
  const [manual, setManual] = useState("");
  const [busy, setBusy] = useState(false);
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const scanningRef = useRef(false);
  const lastTokenRef = useRef<{ token: string; at: number } | null>(null);
  const posRef = useRef<{ lat: number; lng: number } | null>(null);

  useEffect(() => { posRef.current = pos; }, [pos]);

  // GPS
  useEffect(() => {
    if (!navigator.geolocation) { setGpsError("GPS no disponible"); return; }
    const id = navigator.geolocation.watchPosition(
      p => { setGpsError(null); setPos({ lat: p.coords.latitude, lng: p.coords.longitude }); },
      e => setGpsError(e.message || "Sin GPS"),
      { enableHighAccuracy: true, maximumAge: 0, timeout: 15000 }
    );
    return () => navigator.geolocation.clearWatch(id);
  }, []);

  const doScan = useCallback(async (token: string) => {
    const t = token.trim();
    if (!t || busy) return;
    if (!posRef.current) {
      toast.error("Esperando ubicación GPS...");
      beep("error");
      return;
    }
    setBusy(true);
    try {
      const { data, error } = await supabase.rpc("rpc_qard_scan_foraneo" as any, {
        _qard_number: t,
        _viaje_id: viajeId,
        _lat: posRef.current.lat,
        _lng: posRef.current.lng,
      });
      if (error) throw error;
      const res = data as ScanResult;
      setLastResult(res);
      if (!res.ok) {
        beep("error");
        toast.error(res.error || "No se pudo procesar");
      } else if (res.tipo === "sube") {
        beep("sube");
        toast.success(`Sube · ${res.geocerca} · saldo $${Number(res.saldo ?? 0).toFixed(2)}`);
      } else {
        beep("baja");
        toast.success(`Baja · ${res.geocerca} · cobrado $${Number(res.monto ?? 0).toFixed(2)}`);
      }
    } catch (e: any) {
      beep("error");
      toast.error(e.message || "Error de red");
    } finally {
      setBusy(false);
      setManual("");
    }
  }, [busy, viajeId]);

  // Cámara continua
  useEffect(() => {
    let cancelled = false;
    const start = async () => {
      if (scanningRef.current) return;
      scanningRef.current = true;
      try {
        const s = new Html5Qrcode("foraneo-qr-reader", { verbose: false } as any);
        if (cancelled) return;
        scannerRef.current = s;
        await s.start(
          { facingMode: "environment" },
          {
            fps: 15,
            qrbox: (vw: number, vh: number) => {
              const min = Math.min(vw, vh);
              const size = Math.floor(min * 0.7);
              return { width: size, height: size };
            },
            aspectRatio: 1.0,
            experimentalFeatures: { useBarCodeDetectorIfSupported: true },
          } as any,
          (decoded) => {
            const now = Date.now();
            const last = lastTokenRef.current;
            if (last && last.token === decoded && now - last.at < 3000) return;
            lastTokenRef.current = { token: decoded, at: now };
            doScan(decoded);
          },
          () => {}
        );
      } catch (e) {
        console.error("cam err", e);
        toast.error("No se pudo acceder a la cámara");
        scanningRef.current = false;
      }
    };
    const t = setTimeout(start, 300);
    return () => {
      cancelled = true;
      clearTimeout(t);
      (async () => {
        if (scannerRef.current) {
          try { await scannerRef.current.stop(); } catch {}
          try { scannerRef.current.clear(); } catch {}
          scannerRef.current = null;
        }
        scanningRef.current = false;
      })();
    };
  }, [doScan]);

  return (
    <div className="fixed inset-0 z-[200] bg-black flex flex-col">
      {/* Header */}
      <div className="shrink-0 bg-black/90 text-white px-3 py-2 flex items-center justify-between border-b border-white/10">
        <div className="flex items-center gap-2">
          <QrCode className="h-5 w-5" />
          <div>
            <div className="text-sm font-bold">Cobrar QR · foránea</div>
            <div className="text-[10px] opacity-70">
              {gpsError ? "⚠ Sin GPS" : pos ? "GPS activo" : "Esperando GPS..."}
            </div>
          </div>
        </div>
        <Button variant="ghost" size="icon" className="text-white hover:bg-white/10" onClick={onClose}>
          <X className="h-5 w-5" />
        </Button>
      </div>

      {/* Cámara */}
      <div className="relative flex-1 bg-black overflow-hidden">
        <div id="foraneo-qr-reader" className="w-full h-full" />
        {/* Resultado overlay */}
        {lastResult && (
          <div className={`absolute top-3 left-3 right-3 rounded-lg p-3 backdrop-blur ${
            !lastResult.ok ? "bg-red-600/85 text-white"
            : lastResult.tipo === "sube" ? "bg-emerald-600/85 text-white"
            : "bg-blue-600/85 text-white"
          }`}>
            {lastResult.ok ? (
              <div className="flex items-center gap-2">
                {lastResult.tipo === "sube"
                  ? <ArrowUpCircle className="h-6 w-6" />
                  : <ArrowDownCircle className="h-6 w-6" />}
                <div>
                  <div className="font-bold text-base">
                    {lastResult.tipo === "sube" ? "SUBE" : "BAJA"} · {lastResult.geocerca}
                  </div>
                  <div className="text-xs opacity-90">
                    {lastResult.tipo === "sube"
                      ? `Saldo $${Number(lastResult.saldo ?? 0).toFixed(2)} · standby`
                      : `Cobrado $${Number(lastResult.monto ?? 0).toFixed(2)}`}
                  </div>
                </div>
              </div>
            ) : (
              <div className="text-sm font-semibold">⚠ {lastResult.error}</div>
            )}
          </div>
        )}
      </div>

      {/* Input manual */}
      <div className="shrink-0 bg-black/95 border-t border-white/10 p-3 space-y-2">
        <div className="flex gap-2">
          <Input
            value={manual}
            onChange={e => setManual(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter") doScan(manual); }}
            placeholder="Escribe el número QaRd manualmente"
            className="bg-white/10 border-white/20 text-white placeholder:text-white/50"
            disabled={busy}
          />
          <Button onClick={() => doScan(manual)} disabled={busy || !manual}>
            {busy ? "..." : "Cobrar"}
          </Button>
        </div>
        <p className="text-[10px] text-white/60 text-center">
          Al subir: el saldo queda en standby. Al bajar: se cobra la tarifa del tramo.
        </p>
      </div>
    </div>
  );
}
