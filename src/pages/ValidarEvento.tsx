import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Html5Qrcode } from "html5-qrcode";
import { GlobalHeader } from "@/components/GlobalHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import {
  CalendarCheck,
  Camera,
  CheckCircle2,
  CloudOff,
  Download,
  Loader2,
  RefreshCw,
  ScanLine,
  XCircle,
} from "lucide-react";

interface ValidadorEvento {
  id: string; // id del validador
  evento_id: string;
  nombre: string;
  evento_nombre: string;
}

interface PaseCache {
  id: string;
  codigo: string;
  nombre_invitado: string | null;
  personas: number;
  estado: string; // valid | used | cancelled
}

interface ColaItem {
  pase_id: string;
  codigo: string;
  tipo: "entrada" | "salida";
  escaneado_en: string;
  lat: number | null;
  lng: number | null;
}

type ScanResult =
  | { kind: "ok"; pase: PaseCache }
  | { kind: "repetido"; pase: PaseCache }
  | { kind: "cancelado"; pase: PaseCache }
  | { kind: "no_lista"; codigo: string };

const LS_PASES = (ev: string) => `ev_pases_${ev}`;
const LS_COLA = (ev: string) => `ev_cola_${ev}`;

const beep = (ok: boolean) => {
  try {
    const ctx = new AudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.frequency.value = ok ? 880 : 220;
    osc.type = "sine";
    gain.gain.value = 0.15;
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    setTimeout(() => {
      osc.stop();
      ctx.close();
    }, ok ? 150 : 350);
  } catch {
    /* sin audio */
  }
  if (navigator.vibrate) navigator.vibrate(ok ? 80 : [100, 60, 100]);
};

export default function ValidarEvento() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [params, setParams] = useSearchParams();

  const [misEventos, setMisEventos] = useState<ValidadorEvento[]>([]);
  const [evento, setEvento] = useState<ValidadorEvento | null>(null);
  const [pases, setPases] = useState<PaseCache[]>([]);
  const [cola, setCola] = useState<ColaItem[]>([]);
  const [syncing, setSyncing] = useState(false);
  const [escaneando, setEscaneando] = useState(false);
  const [resultado, setResultado] = useState<ScanResult | null>(null);
  const [modo, setModo] = useState<"entrada" | "salida">("entrada");
  const [online, setOnline] = useState(navigator.onLine);
  const [ultimaSync, setUltimaSync] = useState<string | null>(null);

  const scannerRef = useRef<Html5Qrcode | null>(null);
  const procesandoRef = useRef(false);

  // Aceptar invitación si viene ?t=TOKEN
  useEffect(() => {
    const token = params.get("t");
    if (!token || !user) return;
    (async () => {
      const { data, error } = await supabase.rpc("ev_aceptar_validador", { _token: token });
      if (error) {
        toast({ title: "No se pudo aceptar", description: error.message, variant: "destructive" });
      } else {
        const rows = Array.isArray(data) ? data : [];
        toast({
          title: rows.length > 0 ? "Ya eres validador" : "Invitación no válida",
          description: rows.length > 0 ? "El evento ya aparece en tu lista." : "Pide un enlace nuevo al anfitrión.",
        });
      }
      params.delete("t");
      setParams(params, { replace: true });
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, params.get("t")]);

  const cargarEventos = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase
      .from("ev_validadores")
      .select("id,evento_id,nombre,ev_eventos(nombre)")
      .eq("user_id", user.id)
      .eq("activo", true);
    const lista: ValidadorEvento[] = ((data as any[]) || []).map((v) => ({
      id: v.id,
      evento_id: v.evento_id,
      nombre: v.nombre,
      evento_nombre: v.ev_eventos?.nombre || "Evento",
    }));
    setMisEventos(lista);
  }, [user]);

  useEffect(() => {
    cargarEventos();
  }, [cargarEventos]);

  // Cargar caché local al elegir evento
  useEffect(() => {
    if (!evento) return;
    try {
      setPases(JSON.parse(localStorage.getItem(LS_PASES(evento.evento_id)) || "[]"));
      setCola(JSON.parse(localStorage.getItem(LS_COLA(evento.evento_id)) || "[]"));
    } catch {
      setPases([]);
      setCola([]);
    }
  }, [evento]);

  // Estado de red
  useEffect(() => {
    const up = () => setOnline(true);
    const down = () => setOnline(false);
    window.addEventListener("online", up);
    window.addEventListener("offline", down);
    return () => {
      window.removeEventListener("online", up);
      window.removeEventListener("offline", down);
    };
  }, []);

  const guardarCola = useCallback(
    (items: ColaItem[]) => {
      if (!evento) return;
      setCola(items);
      localStorage.setItem(LS_COLA(evento.evento_id), JSON.stringify(items));
    },
    [evento]
  );

  // Descargar lista de invitados para trabajar sin internet
  const sincronizarLista = async () => {
    if (!evento) return;
    setSyncing(true);
    const { data, error } = await supabase
      .from("ev_pases")
      .select("id,codigo,nombre_invitado,personas,estado")
      .eq("evento_id", evento.evento_id);
    setSyncing(false);
    if (error) {
      toast({ title: "No se pudo descargar la lista", description: error.message, variant: "destructive" });
      return;
    }
    const lista = (data as PaseCache[]) || [];
    setPases(lista);
    localStorage.setItem(LS_PASES(evento.evento_id), JSON.stringify(lista));
    setUltimaSync(new Date().toLocaleTimeString("es-MX", { timeZone: "America/Hermosillo" }));
    toast({ title: "Lista lista para trabajar sin internet", description: `${lista.length} pases guardados en este teléfono.` });
  };

  // Subir escaneos pendientes
  const subirPendientes = useCallback(async () => {
    if (!evento || !navigator.onLine) return;
    const pendientes: ColaItem[] = JSON.parse(localStorage.getItem(LS_COLA(evento.evento_id)) || "[]");
    if (pendientes.length === 0) return;
    const restantes: ColaItem[] = [];
    for (const item of pendientes) {
      const { error } = await supabase.from("ev_escaneos").insert({
        evento_id: evento.evento_id,
        pase_id: item.pase_id,
        validador_id: evento.id,
        tipo: item.tipo,
        resultado: "ok",
        offline: true,
        lat: item.lat,
        lng: item.lng,
        escaneado_en: item.escaneado_en,
      });
      if (error) {
        restantes.push(item);
        continue;
      }
      if (item.tipo === "entrada") {
        await supabase.from("ev_pases").update({ estado: "used" }).eq("id", item.pase_id);
      }
    }
    guardarCola(restantes);
  }, [evento, guardarCola]);

  useEffect(() => {
    if (online && evento) subirPendientes();
  }, [online, evento, subirPendientes]);

  const obtenerPosicion = (): Promise<{ lat: number | null; lng: number | null }> =>
    new Promise((resolve) => {
      if (!navigator.geolocation) return resolve({ lat: null, lng: null });
      navigator.geolocation.getCurrentPosition(
        (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
        () => resolve({ lat: null, lng: null }),
        { timeout: 2500, maximumAge: 30000 }
      );
    });

  const procesarCodigo = async (codigo: string) => {
    if (procesandoRef.current || !evento) return;
    procesandoRef.current = true;
    await detenerScanner();

    const pase = pases.find((p) => p.codigo === codigo);
    if (!pase) {
      setResultado({ kind: "no_lista", codigo });
      beep(false);
      return;
    }
    if (pase.estado === "used") {
      setResultado({ kind: "repetido", pase });
      beep(false);
      return;
    }
    if (pase.estado !== "valid") {
      setResultado({ kind: "cancelado", pase });
      beep(false);
      return;
    }

    const pos = await obtenerPosicion();
    const item: ColaItem = {
      pase_id: pase.id,
      codigo: pase.codigo,
      tipo: modo,
      escaneado_en: new Date().toISOString(),
      lat: pos.lat,
      lng: pos.lng,
    };

    // Marcar localmente para respuesta inmediata
    const nuevos = pases.map((p) =>
      p.id === pase.id && modo === "entrada" ? { ...p, estado: "used" } : p
    );
    setPases(nuevos);
    localStorage.setItem(LS_PASES(evento.evento_id), JSON.stringify(nuevos));

    // Intentar subir en caliente; si falla, queda en cola local
    let subido = false;
    if (navigator.onLine) {
      const { error } = await supabase.from("ev_escaneos").insert({
        evento_id: evento.evento_id,
        pase_id: pase.id,
        validador_id: evento.id,
        tipo: modo,
        resultado: "ok",
        offline: false,
        lat: pos.lat,
        lng: pos.lng,
        escaneado_en: item.escaneado_en,
      });
      if (!error) {
        subido = true;
        if (modo === "entrada") {
          await supabase.from("ev_pases").update({ estado: "used" }).eq("id", pase.id);
        }
      }
    }
    if (!subido) guardarCola([...cola, item]);

    setResultado({ kind: "ok", pase: { ...pase, estado: modo === "entrada" ? "used" : "valid" } });
    beep(true);
  };

  const iniciarScanner = async () => {
    if (pases.length === 0) {
      toast({ title: "Primero descarga la lista", description: "Toca «Sincronizar lista» antes de escanear.", variant: "destructive" });
      return;
    }
    setResultado(null);
    procesandoRef.current = false;
    setEscaneando(true);
    // Esperar a que el div exista
    setTimeout(async () => {
      try {
        const scanner = new Html5Qrcode("ev-reader", { verbose: false } as any);
        scannerRef.current = scanner;
        await scanner.start(
          { facingMode: "environment" },
          { fps: 10, qrbox: { width: 240, height: 240 } },
          (text) => {
            procesarCodigo(text.trim());
          },
          () => {}
        );
      } catch {
        setEscaneando(false);
        toast({ title: "No se pudo abrir la cámara", variant: "destructive" });
      }
    }, 150);
  };

  const detenerScanner = async () => {
    try {
      if (scannerRef.current) {
        await scannerRef.current.stop();
        scannerRef.current.clear();
        scannerRef.current = null;
      }
    } catch {
      /* ya estaba detenido */
    }
    setEscaneando(false);
  };

  useEffect(() => {
    return () => {
      detenerScanner();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const siguiente = () => {
    setResultado(null);
    procesandoRef.current = false;
    iniciarScanner();
  };

  if (!user) {
    return (
      <div className="min-h-screen">
        <GlobalHeader title="Validar accesos" />
        <p className="p-6 text-sm text-muted-foreground">Inicia sesión para validar accesos del evento.</p>
      </div>
    );
  }

  // Vista de escáner (pantalla completa de trabajo)
  if (evento) {
    const usados = pases.filter((p) => p.estado === "used").length;
    return (
      <div className="min-h-screen bg-background pb-40">
        <GlobalHeader title={evento.evento_nombre} />
        <div className="p-4 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <Button variant="outline" size="sm" onClick={() => { detenerScanner(); setEvento(null); setResultado(null); }}>
              ← Cambiar evento
            </Button>
            <Badge variant={online ? "secondary" : "destructive"} className="gap-1">
              {online ? <RefreshCw className="h-3 w-3" /> : <CloudOff className="h-3 w-3" />}
              {online ? "En línea" : "Sin internet"}
            </Badge>
          </div>

          <div className="flex items-center justify-between rounded-lg border p-3 text-sm">
            <span>
              <span className="font-semibold">{usados}</span>/{pases.length} pases usados
              {cola.length > 0 && <span className="text-muted-foreground"> · {cola.length} por subir</span>}
            </span>
            <Button size="sm" variant="outline" onClick={sincronizarLista} disabled={syncing || !online}>
              {syncing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4 mr-1" />}
              Sincronizar lista
            </Button>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <Button
              variant={modo === "entrada" ? "default" : "outline"}
              onClick={() => setModo("entrada")}
            >
              Entrada
            </Button>
            <Button
              variant={modo === "salida" ? "default" : "outline"}
              onClick={() => setModo("salida")}
            >
              Salida (souvenir)
            </Button>
          </div>

          {!escaneando && !resultado && (
            <Button className="w-full h-16 text-lg" onClick={iniciarScanner}>
              <Camera className="h-6 w-6 mr-2" /> Escanear {modo}
            </Button>
          )}

          {escaneando && (
            <div className="space-y-2">
              <div id="ev-reader" className="w-full rounded-xl overflow-hidden bg-black" />
              <Button variant="outline" className="w-full" onClick={detenerScanner}>
                Cancelar
              </Button>
            </div>
          )}

          {resultado && (
            <Card
              className={
                resultado.kind === "ok"
                  ? "border-green-600 bg-green-50 dark:bg-green-950"
                  : "border-destructive bg-red-50 dark:bg-red-950"
              }
            >
              <CardContent className="p-6 text-center space-y-2">
                {resultado.kind === "ok" ? (
                  <>
                    <CheckCircle2 className="h-12 w-12 mx-auto text-green-600" />
                    <p className="text-lg font-semibold text-green-700 dark:text-green-300">
                      {modo === "entrada" ? "¡Adelante!" : "Salida registrada"}
                    </p>
                    <p className="font-medium">{resultado.pase.nombre_invitado}</p>
                    <p className="text-sm text-muted-foreground">
                      {resultado.pase.personas} {resultado.pase.personas === 1 ? "persona" : "personas"}
                    </p>
                  </>
                ) : resultado.kind === "repetido" ? (
                  <>
                    <XCircle className="h-12 w-12 mx-auto text-destructive" />
                    <p className="text-lg font-semibold text-destructive">Este pase ya se usó</p>
                    <p className="font-medium">{resultado.pase.nombre_invitado}</p>
                  </>
                ) : resultado.kind === "cancelado" ? (
                  <>
                    <XCircle className="h-12 w-12 mx-auto text-destructive" />
                    <p className="text-lg font-semibold text-destructive">Pase cancelado</p>
                    <p className="font-medium">{resultado.pase.nombre_invitado}</p>
                  </>
                ) : (
                  <>
                    <XCircle className="h-12 w-12 mx-auto text-destructive" />
                    <p className="text-lg font-semibold text-destructive">No está en la lista</p>
                    <p className="text-xs font-mono text-muted-foreground">{resultado.codigo}</p>
                    <p className="text-xs text-muted-foreground">Verifica con el anfitrión o vuelve a sincronizar.</p>
                  </>
                )}
                <Button className="w-full mt-2" onClick={siguiente}>
                  <ScanLine className="h-5 w-5 mr-2" /> Escanear siguiente
                </Button>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    );
  }

  // Lista de eventos donde soy validador
  return (
    <div className="min-h-screen bg-background pb-40">
      <GlobalHeader title="Validar accesos" />
      <div className="p-4 space-y-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <CalendarCheck className="h-4 w-4" /> Mis eventos como validador
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {misEventos.length === 0 && (
              <p className="text-sm text-muted-foreground">
                Aún no tienes invitaciones. Pide al anfitrión que te envíe tu enlace de validador por WhatsApp.
              </p>
            )}
            {misEventos.map((ev) => (
              <button
                key={ev.id}
                onClick={() => setEvento(ev)}
                className="w-full text-left rounded-lg border p-3"
              >
                <p className="font-medium">{ev.evento_nombre}</p>
                <p className="text-xs text-muted-foreground">Toca para abrir el escáner</p>
              </button>
            ))}
          </CardContent>
        </Card>
        <p className="text-xs text-muted-foreground text-center">
          Consejo: sincroniza la lista teniendo internet antes del evento. Después puedes escanear aunque se vaya la señal.
        </p>
      </div>
    </div>
  );
}
