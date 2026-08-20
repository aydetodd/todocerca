import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Html5Qrcode } from "html5-qrcode";
import { Scale, X, Loader2 } from "lucide-react";
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
  const [procesando, setProcesando] = useState(false);
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const lockRef = useRef(false);

  useEffect(() => {
    if (!open) return;
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
        setOpen(false);
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
  }, [open]);

  async function registrarTestigo(text: string) {
    // Acepta cualquier QR: si trae 16 dígitos (tarjeta QaRd) los usamos,
    // si no, guardamos el contenido como referencia.
    const digits = (text.match(/\d/g) || []).join("");
    const qard = digits.length >= 16 ? digits.slice(0, 16) : null;

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

      let nombre: string | null = null;
      if (qard) {
        const { data } = await supabase.rpc("rpc_registrar_punto_traza", {
          _target_qard: qard,
          _lat: pos.lat,
          _lng: pos.lng,
          _tipo: "testigo",
          _lugar: null,
        });
        nombre = (data as any)?.nombre || null;
      }

      // Siempre dejamos el punto en TU propio mapa (enciende tu trazabilidad si está apagada)
      const enMiMapa = await registrarPuntoTraza({
        tipo: "testigo",
        receptorNombre: nombre,
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

      toast({
        title: "Presencia registrada",
        description: `Quedó constancia de ${nombre || (qard ? "esa tarjeta" : "ese código")} con hora y ubicación. Abriendo tu mapa…`,
      });
      setOpen(false);
      navigate("/mi-trazabilidad");
    } catch (e: any) {
      toast({ title: "Error", description: e.message || "No se pudo registrar", variant: "destructive" });
    } finally {
      setProcesando(false);
      setTimeout(() => (lockRef.current = false), 1500);
    }
  }


  if (!user) return null;
  if (HIDDEN_PATHS.includes(location.pathname)) return null;

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        aria-label="Testigo virtual"
        title="Testigo virtual"
        className="fixed left-4 bottom-24 z-[60] h-14 w-14 rounded-full bg-secondary text-secondary-foreground border border-border shadow-lg flex items-center justify-center active:scale-95 transition-transform"
      >
        <Scale className="h-7 w-7" />
      </button>

      {open && (
        <div className="fixed inset-0 z-[100] bg-background flex flex-col">
          <div className="flex items-center justify-between p-4 border-b">
            <div className="flex items-center gap-2 font-semibold">
              <Scale className="h-5 w-5" /> Testigo virtual
            </div>
            <Button variant="ghost" size="icon" onClick={() => setOpen(false)} aria-label="Cerrar">
              <X className="h-5 w-5" />
            </Button>
          </div>
          <p className="px-4 py-3 text-sm text-muted-foreground">
            Escanea el QR de la otra persona para dejar constancia de su presencia con hora y ubicación.
          </p>
          <div className="flex-1 relative">
            <div id="testigo-qr-reader" className="w-full h-full" />
            {procesando && (
              <div className="absolute inset-0 bg-background/80 flex items-center justify-center">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
};
