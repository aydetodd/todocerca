import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseAdmin = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
  );

  const supabaseClient = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_ANON_KEY") ?? ""
  );

  try {
    // Authenticate user
    const authHeader = req.headers.get("Authorization")!;
    const token = authHeader.replace("Bearer ", "");
    const { data } = await supabaseClient.auth.getUser(token);
    const user = data.user;
    if (!user?.email) throw new Error("Usuario no autenticado");

    const { proveedor_id } = await req.json();
    if (!proveedor_id) throw new Error("ID de proveedor requerido");

    // Verify user owns this proveedor
    const { data: proveedor, error: provError } = await supabaseAdmin
      .from("proveedores")
      .select("id, user_id, nombre_negocio")
      .eq("id", proveedor_id)
      .eq("user_id", user.id)
      .single();

    if (provError || !proveedor) {
      throw new Error("No tienes acceso a este proveedor");
    }

    // Check if verification is approved
    const { data: verificacion } = await supabaseAdmin
      .from("verificaciones_concesionario")
      .select("estado")
      .eq("concesionario_id", proveedor_id)
      .eq("estado", "aprobado")
      .single();

    if (!verificacion) {
      throw new Error("Tu verificación debe ser aprobada antes de activar Stripe Connect");
    }

    const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") || "", {
      apiVersion: "2025-08-27.basil",
    });

    // Check if already has a connected account
    const { data: existing } = await supabaseAdmin
      .from("cuentas_conectadas")
      .select("stripe_account_id")
      .eq("concesionario_id", proveedor_id)
      .single();

    let accountId: string;

    if (existing?.stripe_account_id) {
      accountId = existing.stripe_account_id;
    } else {
      // Create Stripe Express account
      const account = await stripe.accounts.create({
        type: "express",
        country: "MX",
        email: user.email,
        capabilities: {
          card_payments: { requested: true },
          transfers: { requested: true },
        },
        business_profile: {
          name: proveedor.nombre_negocio,
          mcc: "4111", // Local/suburban commuter passenger transportation
        },
      });

      accountId = account.id;

      // Save connected account
      await supabaseAdmin.from("cuentas_conectadas").upsert({
        concesionario_id: proveedor_id,
        stripe_account_id: accountId,
        estado_stripe: "pendiente",
      }, { onConflict: "concesionario_id" });

      console.log(`[CONNECT] Created Stripe account ${accountId} for proveedor ${proveedor_id}`);
    }

    // Create onboarding link
    const accountLink = await stripe.accountLinks.create({
      account: accountId,
      refresh_url: `${req.headers.get("origin")}/dashboard/transporte-publico/verificacion?stripe=refresh`,
      return_url: `${req.headers.get("origin")}/dashboard/transporte-publico/qr-boletos?stripe=success`,
      type: "account_onboarding",
    });

    return new Response(JSON.stringify({ url: accountLink.url }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (error) {
    console.error("[CONNECT] Error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
