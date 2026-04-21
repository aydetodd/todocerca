import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// Precios en centavos MXN — provisionales, se ajustarán con concesionarios
const PRICE_MAP: Record<string, number> = {
  normal: 900,        // $9.00
  estudiante: 500,    // $5.00
  tercera_edad: 500,  // $5.00
  nino_menor_5: 0,    // Gratis
  nino_5_10: 500,     // $5.00
  discapacitado: 500, // $5.00
  embarazada: 500,    // $5.00
  ceguera_total: 0,   // Gratis
};

const LABEL_MAP: Record<string, string> = {
  normal: "",
  estudiante: " (Estudiante)",
  tercera_edad: " (Tercera Edad)",
  nino_menor_5: " (Niño <5 años — Gratis)",
  nino_5_10: " (Niño 5-10 años)",
  discapacitado: " (Discapacidad)",
  embarazada: " (Embarazada)",
  ceguera_total: " (Ceguera Total — Gratis)",
};

const DISCOUNT_TYPES = ["estudiante", "tercera_edad", "nino_menor_5", "nino_5_10", "discapacitado", "embarazada", "ceguera_total"];

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseClient = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_ANON_KEY") ?? ""
  );

  const supabaseAdmin = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
  );

  try {
    const authHeader = req.headers.get("Authorization")!;
    const token = authHeader.replace("Bearer ", "");
    const { data } = await supabaseClient.auth.getUser(token);
    const user = data.user;
    if (!user?.email) throw new Error("Usuario no autenticado");

    const { quantity, ticket_type = "normal", device_id, city_label } = await req.json();

    if (!quantity || quantity < 1 || quantity > 100) {
      throw new Error("Cantidad inválida. Mínimo 1, máximo 100 boletos.");
    }

    let unitPrice = PRICE_MAP["normal"];
    let validatedType = "normal";

    if (DISCOUNT_TYPES.includes(ticket_type)) {
      // Verify user has approved discount of this type
      const { data: verification } = await supabaseAdmin
        .from("verificaciones_descuento")
        .select("id, device_id")
        .eq("user_id", user.id)
        .eq("tipo", ticket_type)
        .eq("estado", "aprobado")
        .single();

      if (!verification) {
        throw new Error("No tienes un descuento aprobado para este tipo de boleto.");
      }

      if (device_id && verification.device_id && device_id !== verification.device_id) {
        throw new Error("Este descuento solo es válido desde el dispositivo donde fue solicitado.");
      }

      unitPrice = PRICE_MAP[ticket_type] ?? PRICE_MAP["normal"];
      validatedType = ticket_type;
    }

    const cityForLabel = (city_label && String(city_label).trim()) || "tu ciudad";

    // Handle FREE ticket types — generate directly without Stripe
    if (unitPrice === 0) {
      const qrInserts = [];
      for (let i = 0; i < quantity; i++) {
        qrInserts.push({
          user_id: user.id,
          token: crypto.randomUUID(),
          amount: 0,
          status: "active",
          is_transferred: false,
          stripe_fee_unitario: 0,
          stripe_cuota_fija_unitario: 0,
          ticket_type: validatedType,
          device_id: device_id || null,
        });
      }

      const { error: insertError } = await supabaseAdmin
        .from("qr_tickets")
        .insert(qrInserts);

      if (insertError) {
        console.error("[PURCHASE-TICKETS] Error inserting free tickets:", insertError);
        throw new Error("Error al generar boletos gratuitos");
      }

      // Update cuentas_boletos
      const { data: account } = await supabaseAdmin
        .from("cuentas_boletos")
        .select("total_comprado")
        .eq("user_id", user.id)
        .single();

      if (account) {
        await supabaseAdmin
          .from("cuentas_boletos")
          .update({ total_comprado: account.total_comprado + quantity })
          .eq("user_id", user.id);
      } else {
        await supabaseAdmin
          .from("cuentas_boletos")
          .insert({ user_id: user.id, total_comprado: quantity, ticket_count: 0 });
      }

      // Record transaction
      await supabaseAdmin.from("transacciones_boletos").insert({
        user_id: user.id,
        tipo: "compra",
        cantidad_boletos: quantity,
        monto_total: 0,
        stripe_payment_id: null,
        estado: "completado",
        descripcion: `${quantity} código${quantity > 1 ? "s" : ""} QR gratuito${quantity > 1 ? "s" : ""} (${validatedType})`,
        stripe_fee: 0,
      });

      console.log(`[PURCHASE-TICKETS] Generated ${quantity} FREE ${validatedType} tickets for user ${user.email}`);

      // Return redirect URL directly (no Stripe checkout)
      const origin = req.headers.get("origin") || "";
      return new Response(JSON.stringify({
        url: `${origin}/wallet/qr-boletos?purchase=success&qty=${quantity}`,
        free: true,
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      });
    }

    // PAID ticket flow — Stripe checkout
    const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") || "", {
      apiVersion: "2025-08-27.basil",
    });

    const customers = await stripe.customers.list({ email: user.email, limit: 1 });
    let customerId: string | undefined;
    if (customers.data.length > 0) {
      customerId = customers.data[0].id;
    }

    const typeLabel = LABEL_MAP[validatedType] || "";

    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      customer_email: customerId ? undefined : user.email,
      line_items: [
        {
          price_data: {
            currency: "mxn",
            product_data: {
              name: `QR Boleto Digital × ${quantity}${typeLabel}`,
              description: `VÁLIDO SOLO en transporte público de ${cityForLabel}. ${quantity} boleto${quantity > 1 ? "s" : ""}.`,
            },
            unit_amount: unitPrice,
          },
          quantity: quantity,
        },
      ],
      mode: "payment",
      success_url: `${req.headers.get("origin")}/wallet/qr-boletos?purchase=success&qty=${quantity}`,
      cancel_url: `${req.headers.get("origin")}/wallet/qr-boletos?purchase=cancelled`,
      metadata: {
        user_id: user.id,
        ticket_quantity: String(quantity),
        ticket_type: validatedType,
        device_id: device_id || "",
        city_label: cityForLabel,
        type: "qr_boleto_purchase",
      },
    });

    console.log(`[PURCHASE-TICKETS] Session created for ${quantity} ${validatedType} tickets @ $${(unitPrice / 100).toFixed(2)}, user: ${user.email}`);

    return new Response(JSON.stringify({ url: session.url }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (error) {
    console.error("[PURCHASE-TICKETS] Error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
