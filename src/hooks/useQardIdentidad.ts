import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export type EstadoQard = "inactive" | "active" | "moral_review" | "moral_approved";

export type QardIdentidad = {
  estado: EstadoQard;
  nombre_completo: string | null;
  curp: string | null;
  phone_verified: boolean;
  email_verified: boolean;
};

export type LimiteRecarga = {
  tope: number | null;
  usado: number;
  disponible: number | null;
};

export const TOPE_MENSUAL_RECARGA = 10000;

export const ESTADO_UI: Record<EstadoQard, { label: string; clase: string }> = {
  inactive: { label: "INACTIVA", clase: "bg-muted text-muted-foreground border-border" },
  active: { label: "ACTIVA", clase: "bg-emerald-500 text-white border-emerald-600" },
  moral_review: { label: "EN REVISIÓN", clase: "bg-amber-500 text-white border-amber-600" },
  moral_approved: { label: "EMPRESA", clase: "bg-sky-600 text-white border-amber-300" },
};

export function useQardIdentidad() {
  const [identidad, setIdentidad] = useState<QardIdentidad | null>(null);
  const [limite, setLimite] = useState<LimiteRecarga | null>(null);
  const [cargando, setCargando] = useState(true);

  const recargarDatos = useCallback(async () => {
    setCargando(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setCargando(false); return; }

    const [{ data: ident }, { data: lim }] = await Promise.all([
      supabase.rpc("qard_mi_identidad" as any),
      supabase.rpc("qard_limite_recarga" as any, { _user_id: user.id }),
    ]);

    const fila = Array.isArray(ident) ? (ident[0] as any) : (ident as any);
    setIdentidad(
      fila
        ? {
            estado: (fila.estado ?? "inactive") as EstadoQard,
            nombre_completo: fila.nombre_completo ?? null,
            curp: fila.curp ?? null,
            phone_verified: !!fila.phone_verified,
            email_verified: !!fila.email_verified,
          }
        : { estado: "inactive", nombre_completo: null, curp: null, phone_verified: false, email_verified: false },
    );

    const filaLim = Array.isArray(lim) ? (lim[0] as any) : (lim as any);
    setLimite(
      filaLim
        ? {
            tope: filaLim.tope === null ? null : Number(filaLim.tope),
            usado: Number(filaLim.usado ?? 0),
            disponible: filaLim.disponible === null ? null : Number(filaLim.disponible),
          }
        : { tope: TOPE_MENSUAL_RECARGA, usado: 0, disponible: TOPE_MENSUAL_RECARGA },
    );
    setCargando(false);
  }, []);

  useEffect(() => { recargarDatos(); }, [recargarDatos]);

  const activa = identidad ? identidad.estado !== "inactive" : false;

  return { identidad, limite, cargando, activa, recargarDatos };
}
