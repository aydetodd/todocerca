// Selector del tipo de proveedor (Modelo de Terminales) + Suscripción Anual de Proveedor.
// Flujo:
//  1. El usuario elige su tipo y toca "Guardar".
//  2. Si ya tiene suscripción vigente → solo se cambia el tipo (set_tipo_proveedor).
//  3. Si no → pantalla de suscripción: pagar ($500 MXN/año vía Stripe), pedir código del 100%
//     por mensaje interno, o canjear un código (canjear_codigo_proveedor).
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Briefcase, Check, MessageSquare, Ticket } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

export const TIPOS_PROVEEDOR = [
  { value: "concesionario", label: "Concesionario de transporte" },
  { value: "anexo_escuela", label: "Anexo o Escuela" },
  { value: "oficios", label: "Mecánico, Plomero o Electricista" },
  { value: "gasolinera", label: "Gasolinera" },
  { value: "otro", label: "Otro servicio profesional" },
] as const;

export const etiquetaTipoProveedor = (v?: string | null) =>
  TIPOS_PROVEEDOR.find((t) => t.value === v)?.label ?? null;

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

type Props = {
  actual?: string | null;
  suscripcionActiva?: boolean;
  nombreUsuario?: string | null;
  onGuardado?: () => void;
};

export default function ProveedorTipoSelector({ actual, suscripcionActiva, nombreUsuario, onGuardado }: Props) {
  const [paso, setPaso] = useState<"cerrado" | "tipo" | "suscripcion">("cerrado");
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
    if (tipo === "concesionario") navigate("/dashboard");
  };

  // Paso 1 → Guardar
  const guardarTipo = async () => {
    if (!tipo) return;
    if (!suscripcionActiva) return setPaso("suscripcion");
    setOcupado(true);
    const { error } = await supabase.rpc("set_tipo_proveedor" as any, { _tipo: tipo });
    setOcupado(false);
    if (error) return toast({ title: "No se pudo guardar", description: "Intenta de nuevo", variant: "destructive" });
    terminar(`Tu tipo de proveedor ahora es: ${etiquetaTipoProveedor(tipo)}`);
  };

  // Pago con el flujo de Stripe existente (al volver, Mi Perfil verifica el pago)
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

  // Solicitud del código del 100% por mensaje interno a TodoCerca
  const solicitarCodigo = async () => {
    setOcupado(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setOcupado(false); return; }
    const mensaje = `Hola, soy ${nombreUsuario || "un usuario de TodoCerca"}. Solicito un código de descuento del 100% para activar mi cuenta de Proveedor. Mi rol seleccionado es: ${etiquetaTipoProveedor(tipo)}.`;
    const { error } = await supabase.from("messages").insert({
      sender_id: user.id, receiver_id: TODOCERCA_SISTEMA_ID, message: mensaje, is_panic: false, is_read: false,
    });
    setOcupado(false);
    if (error) return toast({ title: "No se pudo enviar", description: "Intenta de nuevo", variant: "destructive" });
    setSolicitudEnviada(true);
    toast({ title: "Solicitud enviada", description: "TodoCerca te enviará un código de descuento por mensaje interno en las próximas horas." });
  };

  // Revisa el código sin gastarlo; si es válido, desbloquea "Activar sin pago"
  const revisarCodigo = async () => {
    setCodigoError(""); setCodigoOk(false);
    if (!codigo.trim()) return;
    setOcupado(true);
    const { data, error } = await supabase.rpc("revisar_codigo_proveedor" as any, { _codigo: codigo.trim() });
    setOcupado(false);
    if (error || !(data as any)?.ok) return setCodigoError((data as any)?.error || "Código no válido");
    setCodigoOk(true);
  };

  // Canjea el código: lo marca usado y activa la suscripción (1 año)
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

  if (paso === "cerrado") {
    return (
      <Button variant="outline" className="w-full" onClick={() => setPaso("tipo")}>
        <Briefcase className="h-4 w-4 mr-2" />
        {actual && suscripcionActiva ? "Cambiar tipo de proveedor" : "Cambiar mi cuenta a Proveedor"}
      </Button>
    );
  }

  if (paso === "tipo") {
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
          {TIPOS_PROVEEDOR.map((t) => (
            <option key={t.value} value={t.value}>{t.label}</option>
          ))}
        </select>
        <div className="flex gap-2">
          <Button variant="ghost" className="flex-1" onClick={() => setPaso("cerrado")}>Cancelar</Button>
          <Button className="flex-1" disabled={!tipo || ocupado} onClick={guardarTipo}>
            {ocupado ? "Guardando…" : "Guardar"}
          </Button>
        </div>
      </div>
    );
  }

  // Pantalla intermedia: Suscripción Anual de Proveedor
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

      {/* Código de descuento */}
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

      <Button variant="ghost" className="w-full" onClick={() => setPaso("tipo")}>Regresar</Button>
    </div>
  );
}
