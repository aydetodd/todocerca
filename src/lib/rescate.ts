// Modo Rescate: sesión temporal aislada del teléfono prestado.
// La sesión vive SOLO en sessionStorage y nunca toca la sesión del dueño (localStorage).
const BASE = import.meta.env.VITE_SUPABASE_URL;
const ANON = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
const KEY = "rescate_session";

export interface RescateSesion {
  access_token: string;
  refresh_token: string;
  user_id: string;
  nombre: string;
  cuenta_bloqueada: boolean;
  iniciada_en: number; // epoch ms
}

export const RESCATE_MINUTOS = 15;

export function guardarRescate(s: RescateSesion) {
  sessionStorage.setItem(KEY, JSON.stringify(s));
}

export function leerRescate(): RescateSesion | null {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return null;
    const s = JSON.parse(raw) as RescateSesion;
    if (Date.now() - s.iniciada_en > RESCATE_MINUTOS * 60 * 1000) {
      limpiarRescate();
      return null;
    }
    return s;
  } catch {
    return null;
  }
}

export function limpiarRescate() {
  sessionStorage.removeItem(KEY);
}

async function llamar(accion: string, payload: Record<string, unknown> = {}, token?: string) {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    apikey: ANON,
  };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${BASE}/functions/v1/rescate-cuenta`, {
    method: "POST",
    headers,
    body: JSON.stringify({ accion, ...payload }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "No se pudo completar la acción");
  return data;
}

export const rescateEntrar = (telefono: string, clave: string) =>
  llamar("entrar", { telefono, clave }) as Promise<{
    ok: boolean;
    user_id: string;
    session: { access_token: string; refresh_token: string };
    cuenta_bloqueada: boolean;
    nombre: string;
  }>;

export const rescateBloquear = (token: string, motivo: string) =>
  llamar("bloquear", { motivo }, token);

export const rescateCerrarTodo = (token: string) => llamar("cerrar_todo", {}, token);

export const rescateCambiarClave = (token: string, nuevaClave: string) =>
  llamar("cambiar_clave", { nueva_clave: nuevaClave }, token);

export const rescateSolicitarCodigo = (token: string) =>
  llamar("solicitar_codigo_desbloqueo", {}, token) as Promise<{ ok: boolean; email_mask?: string }>;

export const rescateDesbloquear = (token: string, codigo: string) =>
  llamar("desbloquear", { codigo }, token);
