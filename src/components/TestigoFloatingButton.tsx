import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useLocation, useNavigate } from "react-router-dom";
import { Html5Qrcode } from "html5-qrcode";
import { Scale, X, Loader2, Map as MapIcon, ScanLine } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { getPosicionActual, registrarPuntoTraza } from "@/lib/traza";

const HIDDEN_PATHS = ["/auth", "/landing", "/"];

export const TestigoFloatingButton = () => {
  const { user } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [procesando, setProcesando] = useState(false);
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const lockRef = useRef(false);
  const ultimoScanRef = useRef<{ clave: string; ts: number } | null>(null);


  useEffect(() => {
    if (!open || !scanning) return;
    lockRef.current = false;
    let cancelled = false;

    (async () => {
      try {
        const s = new Html5Qrcode("testigo-qr-reader", { verbose: false } as any);
        if (cancelled) return;
        scannerRef.current = s;
        await s.start(
          { facingMode: "environment" },
          { fps: 10, qrbox: { width: 240, height: 240 } },
          (text) => {
            if (lockRef.current) return;
            lockRef.current = true;
            // Apagamos la cámara de inmediato: un solo escaneo por vez
            const s2 = scannerRef.current;
            scannerRef.current = null;
            if (s2) {
              s2.stop().then(() => s2.clear()).catch(() => {});
            }
            void registrarTestigo(String(text));
          },
          () => {}
        );
      } catch (e) {
        toast({
          title: "No se pudo abrir la cámara",
          description: "Revisa los permisos de cámara del navegador.",
          variant: "destructive",
        });
        setScanning(false);
      }
    })();

    return () => {
      cancelled = true;
      const s = scannerRef.current;
      scannerRef.current = null;
      if (s) {
        s.stop()
          .then(() => s.clear())
          .catch(() => {});
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, scanning]);

  useEffect(() => {
    setOpen(false);
    setScanning(false);
  }, [location.pathname]);

  async function registrarTestigo(text: string) {
    // Acepta cualquier QR: si trae 16 dígitos (tarjeta QaRd) los usamos,
    // si no, guardamos el contenido como referencia.
    const digits = (text.match(/\d/g) || []).join("");
    const qard = digits.length >= 16 ? digits.slice(0, 16) : null;

    // Anti-duplicado: mismo código en menos de 30 segundos se ignora
    const clave = qard || text.slice(0, 120);
    const ahora = Date.now();
    const ultimo = ultimoScanRef.current;
    if (ultimo && ultimo.clave === clave && ahora - ultimo.ts < 30000) {
      toast({
        title: "Ya lo registré",
        description: "Ese mismo código se acaba de guardar hace unos segundos.",
      });
      setOpen(false);
      return;
    }
    ultimoScanRef.current = { clave, ts: ahora };

    setProcesando(true);
    try {
      const pos = await getPosicionActual();
      if (!pos) {
        toast({
          title: "Necesito tu ubicación",
          description: "Activa el permiso de ubicación para dejar constancia del lugar.",
          variant: "destructive",
        });
        return;
      }

      let etiqueta: string | null = null;
      let esMio = false;
      if (qard) {
        const { data } = await supabase.rpc("rpc_registrar_punto_traza", {
          _target_qard: qard,
          _lat: pos.lat,
          _lng: pos.lng,
          _tipo: "testigo",
          _lugar: null,
        });
        const r = data as any;
        etiqueta = r?.etiqueta || r?.nombre || null;
        esMio = !!r?.es_mio && !!r?.ok;
      }

      // Si la tarjeta escaneada es MÍA, el RPC ya dejó el punto en mi mapa:
      // no lo insertamos otra vez para no duplicar.
      if (!esMio) {
        const enMiMapa = await registrarPuntoTraza({
          tipo: "testigo",
          receptorNombre: etiqueta,
          receptorId: qard,
          lugar: qard ? null : text.slice(0, 120),
          lat: pos.lat,
          lng: pos.lng,
          force: true,
        });

        if (!enMiMapa) {
          toast({
            title: "No se pudo guardar",
            description: "Intenta de nuevo en unos segundos.",
            variant: "destructive",
          });
          return;
        }
      }

      toast({
        title: "Presencia registrada",
        description: `Quedó constancia de ${etiqueta || (qard ? "esa tarjeta" : "ese código")} con hora y ubicación. Abriendo tu mapa…`,
      });
      setOpen(false);
      navigate("/mi-trazabilidad");
    } catch (e: any) {
      toast({ title: "Error", description: e.message || "No se pudo registrar", variant: "destructive" });
    } finally {
      setProcesando(false);
      setOpen(false);
    }
  }



  if (!user) return null;
  if (HIDDEN_PATHS.includes(location.pathname)) return null;

  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        onClick={() => { setScanning(false); setOpen(true); }}
        aria-label="Testigo virtual"
        title="Testigo virtual"
        className={`flex flex-col items-center gap-0.5 h-auto py-2 px-1 min-w-0 flex-1 bg-transparent shadow-none ${open ? 'text-primary' : 'text-muted-foreground'}`}
      >
        <Scale className="h-5 w-5" />
        <span className="text-[9px] leading-tight truncate max-w-full">Testigo</span>
      </Button>

      {open && createPortal(
        <div role="dialog" aria-modal="true" aria-label="Testigo virtual" className="fixed inset-0 z-[100] bg-background flex flex-col overflow-y-auto safe-area-bottom">
          <div className="flex items-center justify-between p-4 border-b">
            <div className="flex items-center gap-2 font-semibold">
              <Scale className="h-5 w-5" /> Testigo virtual
            </div>
            <Button variant="ghost" size="icon" onClick={() => { setOpen(false); setScanning(false); }} aria-label="Cerrar">
              <X className="h-5 w-5" />
            </Button>
          </div>
          <div className="p-4 flex flex-col gap-3 border-b border-border">
            <Button variant="outline" className="min-h-12 h-auto whitespace-normal" disabled={procesando} onClick={() => { setOpen(false); setScanning(false); navigate('/mi-trazabilidad'); }}>
              <MapIcon className="h-5 w-5 mr-2 shrink-0" />
              Ver mi mapa e información de trazabilidad
            </Button>
            {!scanning && (
              <Button className="min-h-12" onClick={() => setScanning(true)}>
                <ScanLine className="h-5 w-5 mr-2" /> Escanear QR
              </Button>
            )}
          </div>
          {scanning && <div className="flex-1 min-h-72 relative">
            <div id="testigo-qr-reader" className="w-full h-full" />
            {procesando && (
              <div className="absolute inset-0 bg-background/80 flex items-center justify-center">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
              </div>
            )}
          </div>}
        </div>, document.body
      )}
    </>
  );
};
