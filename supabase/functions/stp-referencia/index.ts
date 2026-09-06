// STP · Datos para recargar por SPEI: CLABE maestra + concepto único del usuario.
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

    const { data: ident } = await admin
      .from("qard_identidad").select("estado").eq("user_id", user.id).maybeSingle();
    if (!ident || ident.estado === "inactive") {
      throw new Error("Primero activa tu QaRd para poder recargar.");
    }

    await admin.rpc("qard_ensure_wallet", { _user_id: user.id });

    const { data: prof } = await admin
      .from("profiles").select("qard_number").eq("user_id", user.id).maybeSingle();
    const qard = (prof?.qard_number ?? "").replace(/\D/g, "");
    if (qard.length !== 16) throw new Error("Tu número QaRd aún no está listo.");

    const { data: cfg } = await admin
      .from("stp_config").select("clabe_maestra, beneficiario").eq("id", true).maybeSingle();
    const clabe = cfg?.clabe_maestra || Deno.env.get("STP_CLABE_MAESTRA") || null;

    // Concepto único: QR + 16 dígitos + sufijo corto de tiempo (conciliación / anti duplicados)
    const sufijo = String(Math.floor(Date.now() / 1000)).slice(-3);
    const referencia = `QR${qard}${sufijo}`;

    // Tope mensual disponible
    const { data: tope } = await admin.rpc("stp_tope_mensual", { _user_id: user.id });
    const { data: usadoRaw } = await admin.rpc("qard_recargas_mes", { _user_id: user.id });
    const usado = Number(usadoRaw ?? 0);
    const topeNum = tope === null ? null : Number(tope);

    return new Response(JSON.stringify({
      clabe_maestra: clabe,
      beneficiario: cfg?.beneficiario ?? "TodoCerca",
      qard_number: qard,
      concepto: referencia,
      pendiente_configuracion: !clabe,
      limite: {
        tope: topeNum,
        usado,
        disponible: topeNum === null ? null : Math.max(topeNum - usado, 0),
      },
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    console.error("[STP-REFERENCIA]", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : String(e) }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
