// STP · Generar cuenta bancaria virtual (CLABE) para un usuario.
// PLACEHOLDER: la integración real con el nuevo proveedor está pendiente.
// No toca nada del proveedor actual (Stripe), que sigue operando normal.
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

  const { data: cfg } = await admin.from("pagos_config").select("proveedor_activo").maybeSingle();

  return new Response(JSON.stringify({
    ok: false,
    pendiente_integracion: true,
    proveedor_activo: cfg?.proveedor_activo ?? "stripe",
    mensaje: "Generación de cuentas virtuales (CLABE) pendiente de integración con el nuevo proveedor de pagos.",
  }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
});
