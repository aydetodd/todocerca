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
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) throw new Error("Usuario no autenticado");

    const token = authHeader.replace("Bearer ", "");
    const { data } = await supabaseClient.auth.getUser(token);
    const user = data.user;
    if (!user?.email) throw new Error("Usuario no autenticado");

    const payload = await req.json().catch(() => ({}));
    const requestedProveedorId = payload?.proveedor_id ?? payload?.concesionario_id ?? null;

    // Always resolve proveedor from authenticated owner to avoid mismatched IDs from client
    const { data: ownedProviders, error: ownedProvidersError } = await supabaseAdmin
      .from("proveedores")
      .select("id, user_id, nombre")
      .eq("user_id", user.id)
      .limit(5);

    if (ownedProvidersError || !ownedProviders?.length) {
      throw new Error("No tienes acceso a este proveedor");
    }

    const proveedor = requestedProveedorId
      ? ownedProviders.find((p: any) => p.id === requestedProveedorId)
      : ownedProviders[0];

    if (!proveedor) {
      throw new Error("No tienes acceso a este proveedor");
    }

    const proveedor_id = proveedor.id;

    // Check if verification is approved
    const { data: verificacion } = await supabaseAdmin
      .from("verificaciones_concesionario")
      .select("estado")
      .eq("concesionario_id", proveedor_id)
      .eq("estado", "approved")
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
        settings: {
          dashboard: {
            display_name: proveedor.nombre,
          },
        },
        capabilities: {
          card_payments: { requested: true },
          transfers: { requested: true },
        },
        business_profile: {
          name: proveedor.nombre,
          mcc: "4111", // Local/suburban commuter passenger transportation
        },
      });

      accountId = account.id;

      // Save connected account
      const { error: upsertError } = await supabaseAdmin.from("cuentas_conectadas").upsert({
        concesionario_id: proveedor_id,
        stripe_account_id: accountId,
        estado_stripe: "pending",
      }, { onConflict: "concesionario_id" });

      if (upsertError) {
        console.error(`[CONNECT] Error saving account to DB:`, upsertError);
      }

      console.log(`[CONNECT] Created Stripe account ${accountId} for proveedor ${proveedor_id}`);
    }

    // Create onboarding link
    const accountLink = await stripe.accountLinks.create({
      account: accountId,
      refresh_url: `${req.headers.get("origin")}/panel-concesionario?stripe=refresh`,
      return_url: `${req.headers.get("origin")}/panel-concesionario?stripe=success`,
      type: "account_onboarding",
      collection_options: {
        fields: "eventually_due",
      },
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
