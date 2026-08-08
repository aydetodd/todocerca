// STP · Recibir notificaciones (webhook) de depósitos y confirmaciones.
// PLACEHOLDER: la integración real con el nuevo proveedor está pendiente.
// Registra el aviso recibido para poder auditarlo cuando se active la integración.
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const admin = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  );

  let payload: unknown = null;
  try { payload = await req.json(); } catch (_) { payload = null; }

  console.log("[STP-WEBHOOK] aviso recibido (pendiente de integración)", JSON.stringify(payload));

  const { data: cfg } = await admin.from("pagos_config").select("proveedor_activo").maybeSingle();

  return new Response(JSON.stringify({
    ok: true,
    pendiente_integracion: true,
    proveedor_activo: cfg?.proveedor_activo ?? "stripe",
    mensaje: "Webhook del nuevo proveedor recibido, pendiente de integración.",
  }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
});
