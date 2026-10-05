// Selector del tipo de proveedor (Modelo de Terminales).
// Guarda la elección en profiles.tipo_proveedor vía la función segura set_tipo_proveedor,
// que además cambia la cuenta a "Proveedor" y crea su ficha si no existe.
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Briefcase } from "lucide-react";
import { Button } from "@/components/ui/button";
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

export default function ProveedorTipoSelector({ actual, onGuardado }: { actual?: string | null; onGuardado?: () => void }) {
  const [abierto, setAbierto] = useState(false);
  const [tipo, setTipo] = useState<string>(actual ?? "");
  const [guardando, setGuardando] = useState(false);
  const { toast } = useToast();
  const navigate = useNavigate();

  const guardar = async () => {
    if (!tipo) return;
    setGuardando(true);
    const { error } = await supabase.rpc("set_tipo_proveedor" as any, { _tipo: tipo });
    setGuardando(false);
    if (error) return toast({ title: "No se pudo guardar", description: "Intenta de nuevo", variant: "destructive" });
    toast({ title: "Listo", description: `Ahora eres proveedor: ${etiquetaTipoProveedor(tipo)}` });
    setAbierto(false);
    onGuardado?.();
    // El concesionario continúa en su flujo de registro de transporte ya existente
    if (tipo === "concesionario") navigate("/dashboard");
  };

  if (!abierto) {
    return (
      <Button variant="outline" className="w-full" onClick={() => setAbierto(true)}>
        <Briefcase className="h-4 w-4 mr-2" />
        {actual ? "Cambiar tipo de proveedor" : "Cambiar mi cuenta a Proveedor"}
      </Button>
    );
  }

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
        <Button variant="ghost" className="flex-1" onClick={() => setAbierto(false)}>Cancelar</Button>
        <Button className="flex-1" disabled={!tipo || guardando} onClick={guardar}>
          {guardando ? "Guardando…" : "Guardar"}
        </Button>
      </div>
    </div>
  );
}
