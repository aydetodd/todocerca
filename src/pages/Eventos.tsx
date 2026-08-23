import { useCallback, useEffect, useState } from "react";
import { GlobalHeader } from "@/components/GlobalHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { Building2, CalendarPlus, Loader2, Plus, QrCode, ScanLine, Share2, UserCheck, Users } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";

interface Validador {
  id: string;
  nombre: string;
  telefono: string | null;
  activo: boolean;
  invite_token: string;
}

interface Lugar {
  id: string;
  nombre: string;
  direccion: string | null;
  ciudad: string | null;
}

interface Evento {
  id: string;
  nombre: string;
  tipo: string;
  descripcion: string | null;
  inicia_en: string | null;
  lugar_id: string | null;
  estado: string;
}

interface Pase {
  id: string;
  codigo: string;
  nombre_invitado: string | null;
  telefono: string | null;
  personas: number;
  estado: string;
  created_at: string;
}

const fmt = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleString("es-MX", {
        timeZone: "America/Hermosillo",
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "Sin fecha";

export default function Eventos() {
  const { user } = useAuth();
  const { toast } = useToast();

  const [loading, setLoading] = useState(true);
  const [lugares, setLugares] = useState<Lugar[]>([]);
  const [eventos, setEventos] = useState<Evento[]>([]);
  const [eventoActivo, setEventoActivo] = useState<Evento | null>(null);
  const [pases, setPases] = useState<Pase[]>([]);

  // formularios
  const [openLugar, setOpenLugar] = useState(false);
  const [lugarNombre, setLugarNombre] = useState("");
  const [lugarDireccion, setLugarDireccion] = useState("");
  const [lugarCiudad, setLugarCiudad] = useState("");

  const [openEvento, setOpenEvento] = useState(false);
  const [evNombre, setEvNombre] = useState("");
  const [evFecha, setEvFecha] = useState("");
  const [evDesc, setEvDesc] = useState("");
  const [evLugar, setEvLugar] = useState<string>("");

  const [openPase, setOpenPase] = useState(false);
  const [paseNombre, setPaseNombre] = useState("");
  const [paseTel, setPaseTel] = useState("");
  const [pasePersonas, setPasePersonas] = useState(1);
  const [guardando, setGuardando] = useState(false);

  const [paseQr, setPaseQr] = useState<Pase | null>(null);

  const [validadores, setValidadores] = useState<Validador[]>([]);
  const [openValidador, setOpenValidador] = useState(false);
  const [valNombre, setValNombre] = useState("");
  const [valTel, setValTel] = useState("");

  const cargarValidadores = useCallback(async (eventoId: string) => {
    const { data } = await supabase
      .from("ev_validadores")
      .select("id,nombre,telefono,activo,invite_token")
      .eq("evento_id", eventoId)
      .order("created_at");
    setValidadores((data as Validador[]) || []);
  }, []);

  const invitarValidador = async () => {
    if (!eventoActivo || !valNombre.trim()) return;
    setGuardando(true);
    const token = crypto.randomUUID().replace(/-/g, "").slice(0, 16);
    const { error } = await supabase.from("ev_validadores").insert({
      evento_id: eventoActivo.id,
      nombre: valNombre.trim(),
      telefono: valTel.trim() || null,
      invite_token: token,
      activo: false,
    });
    setGuardando(false);
    if (error) {
      toast({ title: "No se creó la invitación", description: error.message, variant: "destructive" });
      return;
    }
    const link = `${window.location.origin}/validar-evento?t=${token}`;
    const texto = `Hola ${valNombre.trim()}, serás validador de accesos para ${eventoActivo.nombre}. Abre este enlace e inicia sesión: ${link}`;
    const tel = valTel.replace(/\D/g, "");
    window.open(
      tel ? `https://wa.me/${tel}?text=${encodeURIComponent(texto)}` : `https://wa.me/?text=${encodeURIComponent(texto)}`,
      "_blank"
    );
    setOpenValidador(false);
    setValNombre("");
    setValTel("");
    toast({ title: "Invitación lista", description: "Se abrió WhatsApp para enviar el enlace." });
    cargarValidadores(eventoActivo.id);
  };

  const cargar = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    const [{ data: lg }, { data: ev }] = await Promise.all([
      supabase.from("ev_lugares").select("id,nombre,direccion,ciudad").order("created_at"),
      supabase
        .from("ev_eventos")
        .select("id,nombre,tipo,descripcion,inicia_en,lugar_id,estado")
        .order("created_at", { ascending: false }),
    ]);
    setLugares((lg as Lugar[]) || []);
    setEventos((ev as Evento[]) || []);
    setLoading(false);
  }, [user]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const cargarPases = useCallback(async (eventoId: string) => {
    const { data } = await supabase
      .from("ev_pases")
      .select("id,codigo,nombre_invitado,telefono,personas,estado,created_at")
      .eq("evento_id", eventoId)
      .order("created_at", { ascending: false });
    setPases((data as Pase[]) || []);
  }, []);

  useEffect(() => {
    if (eventoActivo) cargarPases(eventoActivo.id);
  }, [eventoActivo, cargarPases]);

  const crearLugar = async () => {
    if (!user || !lugarNombre.trim()) return;
    setGuardando(true);
    const { error } = await supabase.from("ev_lugares").insert({
      owner_id: user.id,
      nombre: lugarNombre.trim(),
      direccion: lugarDireccion.trim() || null,
      ciudad: lugarCiudad.trim() || null,
    });
    setGuardando(false);
    if (error) {
      toast({ title: "No se pudo guardar", description: error.message, variant: "destructive" });
      return;
    }
    setOpenLugar(false);
    setLugarNombre("");
    setLugarDireccion("");
    setLugarCiudad("");
    toast({ title: "Salón guardado" });
    cargar();
  };

  const crearEvento = async () => {
    if (!user || !evNombre.trim()) return;
    setGuardando(true);
    const { error } = await supabase.from("ev_eventos").insert({
      owner_id: user.id,
      nombre: evNombre.trim(),
      tipo: "privado",
      descripcion: evDesc.trim() || null,
      inicia_en: evFecha ? new Date(evFecha).toISOString() : null,
      lugar_id: evLugar || null,
      estado: "active",
    });
    setGuardando(false);
    if (error) {
      toast({ title: "No se pudo crear el evento", description: error.message, variant: "destructive" });
      return;
    }
    setOpenEvento(false);
    setEvNombre("");
    setEvFecha("");
    setEvDesc("");
    setEvLugar("");
    toast({ title: "Evento creado" });
    cargar();
  };

  const crearPase = async () => {
    if (!eventoActivo || !paseNombre.trim()) return;
    setGuardando(true);
    const { data, error } = await supabase.rpc("ev_crear_grupo_pase", {
      _evento_id: eventoActivo.id,
      _nombre: paseNombre.trim(),
      _telefono: paseTel.trim() || null,
      _personas: pasePersonas,
    });
    setGuardando(false);
    if (error) {
      toast({ title: "No se generó el pase", description: error.message, variant: "destructive" });
      return;
    }
    const row = Array.isArray(data) ? data[0] : data;
    setOpenPase(false);
    setPaseNombre("");
    setPaseTel("");
    setPasePersonas(1);
    toast({ title: "Pase generado", description: `Se cobró $1 QaRd peso. Código ${row?.codigo}` });
    cargarPases(eventoActivo.id);
  };

  const linkPase = (codigo: string) => `${window.location.origin}/pase/${codigo}`;

  const compartir = (p: Pase) => {
    const texto = `Hola ${p.nombre_invitado || ""}, aquí está tu pase para ${eventoActivo?.nombre}: ${linkPase(
      p.codigo
    )}`;
    const tel = (p.telefono || "").replace(/\D/g, "");
    const url = tel
      ? `https://wa.me/${tel}?text=${encodeURIComponent(texto)}`
      : `https://wa.me/?text=${encodeURIComponent(texto)}`;
    window.open(url, "_blank");
  };

  if (!user) {
    return (
      <div className="min-h-screen">
        <GlobalHeader title="Eventos" />
        <p className="p-6 text-sm text-muted-foreground">Inicia sesión para administrar tus eventos.</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <GlobalHeader title="Eventos" />
      <div className="p-4 space-y-4 pb-40">
        {/* Salones */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0">
            <CardTitle className="text-base flex items-center gap-2">
              <Building2 className="h-4 w-4" /> Mis salones
            </CardTitle>
            <Button size="sm" variant="outline" onClick={() => setOpenLugar(true)}>
              <Plus className="h-4 w-4 mr-1" /> Nuevo
            </Button>
          </CardHeader>
          <CardContent className="space-y-2">
            {lugares.length === 0 && (
              <p className="text-sm text-muted-foreground">
                Registra tu salón o recinto. Cada lugar paga $500 al año para usar los accesos.
              </p>
            )}
            {lugares.map((l) => (
              <div key={l.id} className="rounded-lg border p-3">
                <p className="font-medium">{l.nombre}</p>
                <p className="text-xs text-muted-foreground">
                  {[l.direccion, l.ciudad].filter(Boolean).join(" · ") || "Sin dirección"}
                </p>
              </div>
            ))}
          </CardContent>
        </Card>

        {/* Eventos */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0">
            <CardTitle className="text-base flex items-center gap-2">
              <CalendarPlus className="h-4 w-4" /> Mis eventos
            </CardTitle>
            <Button size="sm" onClick={() => setOpenEvento(true)}>
              <Plus className="h-4 w-4 mr-1" /> Crear
            </Button>
          </CardHeader>
          <CardContent className="space-y-2">
            {loading && <Loader2 className="h-4 w-4 animate-spin" />}
            {!loading && eventos.length === 0 && (
              <p className="text-sm text-muted-foreground">Aún no tienes eventos. Crea el primero.</p>
            )}
            {eventos.map((e) => (
              <button
                key={e.id}
                onClick={() => setEventoActivo(e)}
                className={`w-full text-left rounded-lg border p-3 transition ${
                  eventoActivo?.id === e.id ? "border-primary bg-primary/5" : ""
                }`}
              >
                <div className="flex items-center justify-between">
                  <p className="font-medium">{e.nombre}</p>
                  <Badge variant="secondary">{e.tipo === "privado" ? "Invitación" : "Masivo"}</Badge>
                </div>
                <p className="text-xs text-muted-foreground">{fmt(e.inicia_en)}</p>
              </button>
            ))}
          </CardContent>
        </Card>

        {/* Invitados del evento activo */}
        {eventoActivo && (
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0">
              <CardTitle className="text-base flex items-center gap-2">
                <Users className="h-4 w-4" /> Invitados · {eventoActivo.nombre}
              </CardTitle>
              <Button size="sm" onClick={() => setOpenPase(true)}>
                <QrCode className="h-4 w-4 mr-1" /> Generar pase ($1)
              </Button>
            </CardHeader>
            <CardContent className="space-y-2">
              {pases.length === 0 && (
                <p className="text-sm text-muted-foreground">
                  Cada pase QR cuesta $1 QaRd peso y sirve para todo el grupo (familia o mesa).
                </p>
              )}
              {pases.map((p) => (
                <div key={p.id} className="rounded-lg border p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium">{p.nombre_invitado}</p>
                      <p className="text-xs text-muted-foreground">
                        {p.personas} {p.personas === 1 ? "persona" : "personas"} · código {p.codigo}
                      </p>
                    </div>
                    <Badge variant={p.estado === "valid" ? "secondary" : "outline"}>
                      {p.estado === "valid" ? "Vigente" : p.estado === "used" ? "Usado" : "Cancelado"}
                    </Badge>
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" onClick={() => setPaseQr(p)}>
                      <QrCode className="h-4 w-4 mr-1" /> Ver QR
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => compartir(p)}>
                      <Share2 className="h-4 w-4 mr-1" /> Enviar
                    </Button>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        )}
      </div>

      {/* Dialog salón */}
      <Dialog open={openLugar} onOpenChange={setOpenLugar}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nuevo salón</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Nombre</Label>
              <Input autoFocus value={lugarNombre} onChange={(e) => setLugarNombre(e.target.value)} />
            </div>
            <div>
              <Label>Dirección</Label>
              <Input value={lugarDireccion} onChange={(e) => setLugarDireccion(e.target.value)} />
            </div>
            <div>
              <Label>Ciudad</Label>
              <Input value={lugarCiudad} onChange={(e) => setLugarCiudad(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button onClick={crearLugar} disabled={guardando || !lugarNombre.trim()}>
              {guardando && <Loader2 className="h-4 w-4 mr-1 animate-spin" />} Guardar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog evento */}
      <Dialog open={openEvento} onOpenChange={setOpenEvento}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Crear evento</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Nombre del evento</Label>
              <Input autoFocus value={evNombre} onChange={(e) => setEvNombre(e.target.value)} />
            </div>
            <div>
              <Label>Fecha y hora</Label>
              <Input type="datetime-local" value={evFecha} onChange={(e) => setEvFecha(e.target.value)} />
            </div>
            <div>
              <Label>Salón</Label>
              <select
                className="w-full h-10 rounded-md border bg-background px-3 text-sm"
                value={evLugar}
                onChange={(e) => setEvLugar(e.target.value)}
              >
                <option value="">Sin salón</option>
                {lugares.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.nombre}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <Label>Detalles</Label>
              <Textarea value={evDesc} onChange={(e) => setEvDesc(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button onClick={crearEvento} disabled={guardando || !evNombre.trim()}>
              {guardando && <Loader2 className="h-4 w-4 mr-1 animate-spin" />} Crear
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog pase */}
      <Dialog open={openPase} onOpenChange={setOpenPase}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Generar pase</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Nombre del invitado o familia</Label>
              <Input autoFocus value={paseNombre} onChange={(e) => setPaseNombre(e.target.value)} />
            </div>
            <div>
              <Label>WhatsApp (10 dígitos)</Label>
              <Input
                inputMode="numeric"
                value={paseTel}
                onChange={(e) => setPaseTel(e.target.value.replace(/\D/g, ""))}
              />
            </div>
            <div>
              <Label>Personas que entran con este QR</Label>
              <Input
                type="number"
                min={1}
                value={pasePersonas}
                onChange={(e) => setPasePersonas(Math.max(1, Number(e.target.value) || 1))}
              />
            </div>
            <p className="text-xs text-muted-foreground">Costo: $1 QaRd peso por cada QR generado.</p>
          </div>
          <DialogFooter>
            <Button onClick={crearPase} disabled={guardando || !paseNombre.trim()}>
              {guardando && <Loader2 className="h-4 w-4 mr-1 animate-spin" />} Generar y cobrar $1
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* QR grande */}
      <Dialog open={!!paseQr} onOpenChange={(o) => !o && setPaseQr(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{paseQr?.nombre_invitado}</DialogTitle>
          </DialogHeader>
          {paseQr && (
            <div className="flex flex-col items-center gap-3 py-2">
              <div className="bg-white p-4 rounded-xl">
                <QRCodeSVG value={paseQr.codigo} size={220} />
              </div>
              <p className="text-sm font-mono">{paseQr.codigo}</p>
              <p className="text-xs text-muted-foreground text-center">
                {paseQr.personas} {paseQr.personas === 1 ? "persona" : "personas"} · {eventoActivo?.nombre}
              </p>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
