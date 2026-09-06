// STP · Consultar el estatus de una transferencia por clave de rastreo SPEI.
// El usuario consulta sus propios depósitos; el administrador consulta cualquiera.
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const anon = createClient(Deno.env.get("SUPABASE_URL") ?? "", Deno.env.get("SUPABASE_ANON_KEY") ?? "");
  const admin = createClient(Deno.env.get("SUPABASE_URL") ?? "", Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "");

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) throw new Error("No autenticado");
    const { data: userData } = await anon.auth.getUser(authHeader.replace("Bearer ", ""));
    const user = userData.user;
    if (!user) throw new Error("No autenticado");

    const body = await req.json().catch(() => ({}));
    const clave = String(body.clave_rastreo ?? "").trim();
    if (!clave || clave.length > 64) throw new Error("Clave de rastreo inválida");

    const { data: prof } = await admin
      .from("profiles").select("consecutive_number").eq("user_id", user.id).maybeSingle();
    const esAdmin = prof?.consecutive_number === 1;

    const { data: dep } = await admin
      .from("stp_depositos").select("*").eq("clave_rastreo", clave).maybeSingle();

    if (dep && !esAdmin && dep.user_id !== user.id) throw new Error("No autorizado");

    // Consulta directa a STP (solo admin, para soporte)
    let stp: unknown = null;
    const base = Deno.env.get("STP_BASE_URL");
    const token = Deno.env.get("STP_API_TOKEN");
    if (esAdmin && base && token) {
      try {
        const r = await fetch(`${base.replace(/\/$/, "")}/speiws/rest/ordenPago/consOrdenesFech?claveRastreo=${encodeURIComponent(clave)}`, {
          headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        });
        stp = await r.json().catch(() => null);
      } catch (e) {
        console.error("[STP-CONSULTAR] error API", e);
      }
    }

    return new Response(JSON.stringify({
      encontrado: !!dep,
      deposito: dep
        ? {
            clave_rastreo: dep.clave_rastreo,
            monto_mxn: dep.monto_mxn,
            concepto: dep.concepto,
            estado: dep.estado,
            motivo: dep.motivo,
            nombre_ordenante: dep.nombre_ordenante,
            banco_ordenante: dep.banco_ordenante,
            recibido_at: dep.webhook_received_at,
            procesado_at: dep.procesado_at,
          }
        : null,
      stp,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    console.error("[STP-CONSULTAR-OPERACION]", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : String(e) }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
