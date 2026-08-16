import { supabase } from "@/integrations/supabase/client";

export type TrazaTipo = "escaneo" | "pago" | "cobro" | "asistencia" | "testigo";

export const TRAZA_LABELS: Record<string, string> = {
  escaneo: "Escaneo",
  pago: "Pago",
  cobro: "Cobro",
  asistencia: "Asistencia",
  testigo: "Testigo virtual",
};

/** Obtiene la ubicación actual una sola vez (no hay rastreo continuo). */
export function getPosicionActual(): Promise<{ lat: number; lng: number } | null> {
  return new Promise((resolve) => {
    if (!navigator.geolocation) return resolve(null);
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude }),
      () => resolve(null),
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 30000 }
    );
  });
}

export async function trazabilidadActiva(userId?: string): Promise<boolean> {
  let uid = userId;
  if (!uid) {
    const { data } = await supabase.auth.getUser();
    uid = data.user?.id;
  }
  if (!uid) return false;
  const { data } = await supabase
    .from("profiles")
    .select("trazabilidad_activa")
    .eq("user_id", uid)
    .maybeSingle();
  return !!data?.trazabilidad_activa;
}

/**
 * Guarda un punto de trazado del usuario actual.
 * No hace nada si el usuario tiene la trazabilidad apagada o no da permiso de ubicación.
 */
export async function registrarPuntoTraza(opts: {
  tipo: TrazaTipo;
  receptorId?: string | null;
  receptorNombre?: string | null;
  lugar?: string | null;
  subQrId?: string | null;
  lat?: number;
  lng?: number;
}): Promise<boolean> {
  try {
    const { data: auth } = await supabase.auth.getUser();
    const uid = auth.user?.id;
    if (!uid) return false;
    if (!(await trazabilidadActiva(uid))) return false;

    let lat = opts.lat;
    let lng = opts.lng;
    if (typeof lat !== "number" || typeof lng !== "number") {
      const pos = await getPosicionActual();
      if (!pos) return false;
      lat = pos.lat;
      lng = pos.lng;
    }

    const { error } = await supabase.from("trazabilidad_puntos").insert({
      user_id: uid,
      lat,
      lng,
      tipo_evento: opts.tipo,
      receptor_id: opts.receptorId ?? null,
      receptor_nombre: opts.receptorNombre ?? null,
      lugar: opts.lugar ?? null,
      sub_qr_id: opts.subQrId ?? null,
    });
    if (error) {
      console.warn("[traza] no se pudo guardar el punto:", error.message);
      return false;
    }
    return true;
  } catch (e) {
    console.warn("[traza] error inesperado:", e);
    return false;
  }
}

/**
 * Deja un punto en el mapa de OTRA persona (la dueña de esa tarjeta QaRd).
 * Solo se guarda si esa persona tiene su trazabilidad activa.
 */
export async function registrarPuntoTrazaDeTercero(
  qardNumber: string,
  tipo: TrazaTipo,
  lugar?: string | null
): Promise<boolean> {
  try {
    const pos = await getPosicionActual();
    if (!pos) return false;
    const { data, error } = await supabase.rpc("rpc_registrar_punto_traza", {
      _target_qard: qardNumber.replace(/\D/g, ""),
      _lat: pos.lat,
      _lng: pos.lng,
      _tipo: tipo,
      _lugar: lugar ?? null,
    });
    if (error) {
      console.warn("[traza] tercero:", error.message);
      return false;
    }
    return !!(data as any)?.ok;
  } catch {
    return false;
  }
}
