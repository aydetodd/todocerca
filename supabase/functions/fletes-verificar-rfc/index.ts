// Fletes — registro del fletero con RFC validado ante el SAT (Verificamex)
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const RFC_REGEX = /^([A-ZÑ&]{3,4})(\d{2})(0[1-9]|1[0-2])(0[1-9]|[12]\d|3[01])([A-Z\d]{2})([A\d])$/;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  try {
    const auth = req.headers.get("Authorization");
    if (!auth?.startsWith("Bearer ")) return json({ error: "No autenticado" }, 401);
    const { data: u } = await admin.auth.getUser(auth.replace("Bearer ", ""));
    if (!u?.user) return json({ error: "Sesión inválida" }, 401);
    const userId = u.user.id;

    const body = await req.json().catch(() => ({}));
    const nombre = String(body?.nombre_negocio ?? "").trim().slice(0, 150);
    const rfc = String(body?.rfc ?? "").toUpperCase().replace(/[\s-]/g, "");
    if (nombre.length < 3) return json({ error: "Escribe el nombre del negocio o Carta Porte." }, 400);
    if (!RFC_REGEX.test(rfc)) return json({ error: "El RFC no tiene un formato válido." }, 400);

    // Si ya está validado con el mismo RFC, no gastamos otra consulta.
    const { data: previo } = await admin.from("fletes_proveedores").select("rfc, rfc_verificado").eq("user_id", userId).maybeSingle();
    if (previo?.rfc_verificado && previo.rfc === rfc) {
      await admin.from("fletes_proveedores").update({ nombre_negocio: nombre, updated_at: new Date().toISOString() }).eq("user_id", userId);
      return json({ ok: true, ya_verificado: true });
    }
    // Un RFC solo puede estar en una cuenta.
    const { data: otro } = await admin.from("fletes_proveedores").select("user_id").eq("rfc", rfc).eq("rfc_verificado", true).neq("user_id", userId).maybeSingle();
    if (otro) return json({ error: "Este RFC ya está registrado en otra cuenta. No se cobró nada." }, 400);

    const token = Deno.env.get("VERIFICAMEX_BEARER_TOKEN");
    if (!token) return json({ error: "Falta configurar el servicio de verificación." }, 500);
    const base = Deno.env.get("VERIFICAMEX_BASE_URL") ?? "https://api.verificamex.com";

    const res = await fetch(`${base}/identity/v1/miscellaneous/sat/rfc`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json", "Content-Type": "application/json" },
      body: JSON.stringify({ rfc }),
    });
    const texto = await res.text();
    let data: any = null;
    try { data = JSON.parse(texto); } catch { data = { raw: texto }; }
    const valido = res.ok && (data?.data?.status === true || data?.data?.status === "true");

    await admin.from("verificamex_logs").insert({
      user_id: userId, tipo: "rfc_fletes", exito: valido, http_status: res.status,
      mensaje: String(data?.data?.message ?? data?.message ?? texto).slice(0, 500),
    });

    if (!valido) {
      return json({ error: "El SAT no reconoce este RFC como válido y activo. Revisa que esté bien escrito." }, 400);
    }

    await admin.from("fletes_proveedores").upsert({
      user_id: userId, nombre_negocio: nombre, rfc, rfc_verificado: true,
      verificado_at: new Date().toISOString(), updated_at: new Date().toISOString(),
    });
    return json({ ok: true });
  } catch (e) {
    console.error("fletes-verificar-rfc", e);
    return json({ error: "Ocurrió un problema al validar. Inténtalo de nuevo." }, 500);
  }
});
