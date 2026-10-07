// Selector del tipo de proveedor (Modelo de Terminales).
// Dos familias:
//  - ESPECIALES (flujo propio): concesionario → registro de transporte ($800/unidad);
//    anexo/escuela, gasolinera, penitenciaría → "próximamente, contacta a TodoCerca".
//  - STANDARD ($500 MXN/año): oficios y otro servicio profesional → pago Stripe,
//    solicitar código del 100% o canjear código.
// Si ya es proveedor standard: con suscripción vigente muestra su tipo y vigencia;
// sin suscripción vigente va directo a la pantalla de $500.
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Briefcase, Check, MessageSquare, Ticket } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

export const TIPOS_PROVEEDOR = [
  { value: "concesionario", label: "Concesionario de transporte", familia: "especial" },
  { value: "anexo_escuela", label: "Anexo o Escuela", familia: "especial" },
  { value: "gasolinera", label: "Gasolinera", familia: "especial" },
  { value: "penitenciaria", label: "Penitenciaría", familia: "especial" },
  { value: "oficios", label: "Mecánico, Plomero o Electricista", familia: "standard" },
  { value: "otro", label: "Otro servicio profesional", familia: "standard" },
] as const;

export const etiquetaTipoProveedor = (v?: string | null) =>
  TIPOS_PROVEEDOR.find((t) => t.value === v)?.label ?? null;

const esStandard = (v?: string | null) =>
  TIPOS_PROVEEDOR.some((t) => t.value === v && t.familia === "standard");

/** Canal oficial de TodoCerca en la mensajería interna. */
const TODOCERCA_SISTEMA_ID = "00000000-0000-0000-0000-000000000001";
const PRECIO_ANUAL_MXN = 500;
const BENEFICIOS = [
  "Acceso al motor de búsqueda",
  "Perfil público",
  "Gestión de terminales",
  "Libro inmutable de cobros",
  "Reportes financieros",
  "Y más beneficios en camino",
];

const MENSAJE_PROXIMAMENTE: Record<string, string> = {
  anexo_escuela: "El registro de escuelas y anexos estará disponible próximamente. Por ahora, contacta a TodoCerca para activar tu cuenta.",
  gasolinera: "El registro de gasolineras estará disponible próximamente. Por ahora, contacta a TodoCerca para activar tu cuenta.",
  penitenciaria: "El registro de penitenciarías estará disponible próximamente. Por ahora, contacta a TodoCerca para activar tu cuenta.",
};

type Paso = "cerrado" | "tipo" | "suscripcion" | "especial";

type Props = {
  actual?: string | null;
  suscripcionActiva?: boolean;
  expiraEn?: string | null;
  nombreUsuario?: string | null;
  onGuardado?: () => void;
};

export default function ProveedorTipoSelector({ actual, suscripcionActiva, expiraEn, nombreUsuario, onGuardado }: Props) {
  const yaStandard = esStandard(actual);
  const [paso, setPaso] = useState<Paso>("cerrado");
  const [tipo, setTipo] = useState<string>(actual ?? "");
  const [ocupado, setOcupado] = useState(false);
  const [codigo, setCodigo] = useState("");
  const [codigoOk, setCodigoOk] = useState(false);
  const [codigoError, setCodigoError] = useState("");
  const [solicitudEnviada, setSolicitudEnviada] = useState(false);
  const { toast } = useToast();
  const navigate = useNavigate();

  const terminar = (texto: string) => {
    toast({ title: "Listo", description: texto });
    setPaso("cerrado");
    onGuardado?.();
  };

  const enviarMensaje = async (mensaje: string) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return false;
    const { error } = await supabase.from("messages").insert({
      sender_id: user.id, receiver_id: TODOCERCA_SISTEMA_ID, message: mensaje, is_panic: false, is_read: false,
    });
    return !error;
  };

  // Paso 1 → Continuar según la familia del tipo elegido
  const continuar = async () => {
    if (!tipo) return;
    if (tipo === "concesionario") return setPaso("concesionario");
    if (!esStandard(tipo)) return setPaso("especial");
    if (!suscripcionActiva) return setPaso("suscripcion");
    // Ya tiene suscripción: solo cambia entre tipos standard
    setOcupado(true);
    const { error } = await supabase.rpc("set_tipo_proveedor" as any, { _tipo: tipo });
    setOcupado(false);
    if (error) return toast({ title: "No se pudo guardar", description: "Intenta de nuevo", variant: "destructive" });
    terminar(`Tu tipo de proveedor ahora es: ${etiquetaTipoProveedor(tipo)}`);
  };

  const contactarTodoCerca = async () => {
    setOcupado(true);
    const ok = await enviarMensaje(`Hola, soy ${nombreUsuario || "un usuario de TodoCerca"}. Quiero activar mi cuenta como: ${etiquetaTipoProveedor(tipo)}.`);
    setOcupado(false);
    if (!ok) return toast({ title: "No se pudo enviar", description: "Intenta de nuevo", variant: "destructive" });
    navigate("/mensajes");
  };

  const pagar = async () => {
    setOcupado(true);
    const { data, error } = await supabase.functions.invoke("upgrade-to-provider", { body: { tipo } });
    setOcupado(false);
    if (error || !(data as any)?.url) {
      return toast({ title: "No se pudo abrir el pago", description: (data as any)?.error || "Intenta de nuevo", variant: "destructive" });
    }
    window.open((data as any).url, "_blank");
    toast({ title: "Redirigiendo a pago", description: "Al terminar, regresa a Mi Perfil para activar tu cuenta." });
  };

  const solicitarCodigo = async () => {
    setOcupado(true);
    const ok = await enviarMensaje(`Hola, soy ${nombreUsuario || "un usuario de TodoCerca"}. Solicito un código de descuento del 100% para activar mi cuenta de Proveedor. Mi rol seleccionado es: ${etiquetaTipoProveedor(tipo)}.`);
    setOcupado(false);
    if (!ok) return toast({ title: "No se pudo enviar", description: "Intenta de nuevo", variant: "destructive" });
    setSolicitudEnviada(true);
    toast({ title: "Solicitud enviada", description: "TodoCerca te enviará un código de descuento por mensaje interno en las próximas horas." });
  };

  const revisarCodigo = async () => {
    setCodigoError(""); setCodigoOk(false);
    if (!codigo.trim()) return;
    setOcupado(true);
    const { data, error } = await supabase.rpc("revisar_codigo_proveedor" as any, { _codigo: codigo.trim() });
    setOcupado(false);
    if (error || !(data as any)?.ok) return setCodigoError((data as any)?.error || "Código no válido");
    setCodigoOk(true);
  };

  const activarSinPago = async () => {
    setOcupado(true);
    const { data, error } = await supabase.rpc("canjear_codigo_proveedor" as any, { _codigo: codigo.trim(), _tipo: tipo });
    setOcupado(false);
    if (error || !(data as any)?.ok) {
      setCodigoOk(false);
      return setCodigoError((data as any)?.error || "No se pudo activar");
    }
    terminar(`Ya eres proveedor: ${etiquetaTipoProveedor(tipo)}. Tu suscripción vence en 1 año.`);
  };

  // ── Pantalla cerrada ──
  if (paso === "cerrado") {
    // Caso 5: proveedor standard con suscripción vigente
    if (yaStandard && suscripcionActiva) {
      return (
        <div className="space-y-2 rounded-lg border p-3">
          <p className="text-sm"><span className="font-medium">Tipo de proveedor:</span> {etiquetaTipoProveedor(actual)}</p>
          {expiraEn && (
            <p className="text-sm"><span className="font-medium">Suscripción vigente hasta:</span>{" "}
              {new Date(expiraEn).toLocaleDateString("es-MX", { timeZone: "America/Hermosillo" })}</p>
          )}
          <Button variant="outline" className="w-full" onClick={() => setPaso("tipo")}>
            <Briefcase className="h-4 w-4 mr-2" /> Cambiar tipo de proveedor
          </Button>
        </div>
      );
    }
    // Caso 6: proveedor standard sin suscripción → directo a $500
    return (
      <Button variant="outline" className="w-full" onClick={() => setPaso(yaStandard ? "suscripcion" : "tipo")}>
        <Briefcase className="h-4 w-4 mr-2" />
        {yaStandard ? "Renovar mi suscripción de Proveedor" : "Cambiar mi cuenta a Proveedor"}
      </Button>
    );
  }

  // ── Selector de tipo ──
  if (paso === "tipo") {
    // Si ya es standard con suscripción, solo puede cambiar entre tipos standard
    const opciones = yaStandard && suscripcionActiva
      ? TIPOS_PROVEEDOR.filter((t) => t.familia === "standard")
      : TIPOS_PROVEEDOR;
    return (
      <div className="space-y-3 rounded-lg border p-3">
        <p className="text-sm font-medium">¿Qué tipo de proveedor eres?</p>
        {/* Select nativo: evita portales en móvil */}
        <select
          className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm"
          value={tipo}
          onChange={(e) => setTipo(e.target.value)}
        >
          <option value="">Elige una opción…</option>
          {opciones.map((t) => (
            <option key={t.value} value={t.value}>{t.label}</option>
          ))}
        </select>
        <div className="flex gap-2">
          <Button variant="ghost" className="flex-1" onClick={() => setPaso("cerrado")}>Cancelar</Button>
          <Button className="flex-1" disabled={!tipo || ocupado} onClick={continuar}>
            {ocupado ? "Guardando…" : "Continuar"}
          </Button>
        </div>
      </div>
    );
  }

  // ── Concesionario: elegir subtipo (Foráneo / Urbano / Taxi Colectivo) ──
  if (paso === "concesionario") {
    const subtipos = [
      { label: "🚐 Foráneo", to: "/panel-concesionario/foraneo" },
      { label: "🚌 Urbano", to: "/panel-concesionario/urbano" },
      { label: "🚕 Taxi Colectivo", to: "/panel-concesionario/taxi-colectivo" },
    ];
    return (
      <div className="space-y-3 rounded-lg border p-3">
        <p className="text-sm font-medium">¿Qué tipo de concesionario eres?</p>
        {subtipos.map((s) => (
          <Button key={s.to} variant="outline" className="w-full justify-start" onClick={() => navigate(s.to)}>
            {s.label}
          </Button>
        ))}
        <Button variant="ghost" className="w-full" onClick={() => setPaso("tipo")}>Regresar</Button>
      </div>
    );
  }

  // ── Especiales sin flujo todavía (escuela, gasolinera, penitenciaría) ──
  if (paso === "especial") {
    return (
      <div className="space-y-3 rounded-lg border border-primary/40 p-4">
        <p className="text-xs text-muted-foreground">{etiquetaTipoProveedor(tipo)}</p>
        <p className="text-sm">{MENSAJE_PROXIMAMENTE[tipo]}</p>
        <Button className="w-full" disabled={ocupado} onClick={contactarTodoCerca}>
          <MessageSquare className="h-4 w-4 mr-2" /> Contactar a TodoCerca
        </Button>
        <Button variant="ghost" className="w-full" onClick={() => setPaso("tipo")}>Regresar</Button>
      </div>
    );
  }

  // ── Suscripción standard $500/año ──
  return (
    <div className="space-y-4 rounded-lg border border-primary/40 p-4">
      <div>
        <p className="text-xs text-muted-foreground">{etiquetaTipoProveedor(tipo)}</p>
        <h3 className="text-lg font-bold">Suscripción Anual de Proveedor</h3>
        <p className="text-3xl font-bold text-primary">${PRECIO_ANUAL_MXN} MXN <span className="text-sm font-normal text-muted-foreground">al año</span></p>
      </div>

      <ul className="space-y-1.5">
        {BENEFICIOS.map((b) => (
          <li key={b} className="flex items-center gap-2 text-sm">
            <Check className="h-4 w-4 text-primary shrink-0" /> {b}
          </li>
        ))}
      </ul>

      <Button className="w-full" disabled={ocupado} onClick={pagar}>Pagar suscripción y activar</Button>

      <Button variant="secondary" className="w-full" disabled={ocupado || solicitudEnviada} onClick={solicitarCodigo}>
        <MessageSquare className="h-4 w-4 mr-2" />
        {solicitudEnviada ? "Solicitud enviada" : "Solicitar código de descuento del 100%"}
      </Button>
      {solicitudEnviada && (
        <div className="rounded-md bg-muted p-3 text-sm space-y-2">
          <p>Tu solicitud fue enviada. TodoCerca te enviará un código de descuento por mensaje interno en las próximas horas.</p>
          <Button variant="link" className="h-auto p-0" onClick={() => navigate("/mensajes")}>Ver mis mensajes</Button>
        </div>
      )}

      <div className="space-y-2 border-t pt-3">
        <p className="text-sm font-medium flex items-center gap-2"><Ticket className="h-4 w-4" /> Tengo un código de descuento</p>
        <div className="flex gap-2">
          <Input value={codigo} onChange={(e) => { setCodigo(e.target.value); setCodigoOk(false); setCodigoError(""); }} placeholder="Escribe tu código" />
          <Button variant="outline" disabled={ocupado || !codigo.trim()} onClick={revisarCodigo}>Validar</Button>
        </div>
        {codigoError && <p className="text-sm text-destructive">{codigoError}</p>}
        {codigoOk && <p className="text-sm text-primary">Código válido</p>}
        <Button className="w-full" disabled={!codigoOk || ocupado} onClick={activarSinPago}>Activar sin pago</Button>
      </div>

      <Button variant="ghost" className="w-full" onClick={() => setPaso(yaStandard ? "cerrado" : "tipo")}>Regresar</Button>
    </div>
  );
}
