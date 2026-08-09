import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

/**
 * Verifica que la llamada provenga de un job programado (pg_cron) o del
 * service role. El secreto vive en la tabla `app_cron_secret`, accesible
 * solo por el service role, de modo que ni el cliente ni anon pueden leerlo.
 */
export async function isAuthorizedCronCall(req: Request): Promise<boolean> {
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const auth = req.headers.get("authorization") ?? "";
  if (serviceKey && auth === `Bearer ${serviceKey}`) return true;

  const envSecret = Deno.env.get("CRON_SECRET");
  const provided = req.headers.get("x-cron-secret") ?? "";
  if (!provided) return false;
  if (envSecret && provided === envSecret) return true;

  try {
    const supabase = createClient(Deno.env.get("SUPABASE_URL") ?? "", serviceKey);
    const { data } = await supabase.from("app_cron_secret").select("secret").limit(1).maybeSingle();
    const dbSecret = (data as any)?.secret as string | undefined;
    return !!dbSecret && provided === dbSecret;
  } catch (_e) {
    return false;
  }
}

export function unauthorizedResponse(corsHeaders: Record<string, string>) {
  return new Response(JSON.stringify({ error: "unauthorized" }), {
    status: 401,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
