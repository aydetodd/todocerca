// Límite de peticiones (rate limiting) para operaciones de dinero.
// Solo se usa en retiros y transferencias. NUNCA en el escaneo del chofer.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

export type RateLimitResult = { ok: boolean; error?: string; restantes?: number };

/**
 * Cuenta los intentos del usuario en una ventana de tiempo y registra el actual.
 * Si la tabla no existe o falla, deja pasar (fail-open) para no romper producción.
 */
export async function checkRateLimit(
  admin: ReturnType<typeof createClient>,
  userId: string,
  accion: string,
  opts: { maxIntentos?: number; ventanaSegundos?: number } = {},
): Promise<RateLimitResult> {
  const maxIntentos = opts.maxIntentos ?? 5;
  const ventanaSegundos = opts.ventanaSegundos ?? 60;
  const desde = new Date(Date.now() - ventanaSegundos * 1000).toISOString();

  try {
    const { count, error } = await admin
      .from("rate_limit_hits")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("accion", accion)
      .gte("created_at", desde);

    if (error) return { ok: true };

    if ((count ?? 0) >= maxIntentos) {
      return {
        ok: false,
        error: `Demasiados intentos. Espera ${ventanaSegundos} segundos antes de volver a intentarlo.`,
      };
    }

    await admin.from("rate_limit_hits").insert({ user_id: userId, accion });
    return { ok: true, restantes: maxIntentos - (count ?? 0) - 1 };
  } catch (_) {
    return { ok: true };
  }
}
