import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const TICKET_PRICE = 9.00; // $9.00 MXN
const PLATFORM_FEE_PERCENT = 0.02; // 2% comisión TodoCerca
const STRIPE_CONNECT_FEE_PERCENT = 0.005; // ~0.5% Stripe Connect
const STRIPE_PROCESSING_PERCENT = 0.044; // ~4.4%
const STRIPE_FIXED_FEE = 1.00; // $1 MXN fijo por transacción

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseAdmin = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
  );

  const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") || "", {
    apiVersion: "2025-08-27.basil",
  });

  try {
    // Get today's date (Hermosillo timezone UTC-7)
    const now = new Date();
    const hermosillo = new Date(now.getTime() - 7 * 60 * 60 * 1000);
    const fechaLiquidacion = hermosillo.toISOString().split("T")[0];

    console.log(`[SETTLEMENTS] Processing settlements for ${fechaLiquidacion}`);

    // Get all active connected accounts
    const { data: cuentas, error: cuentasError } = await supabaseAdmin
      .from("cuentas_conectadas")
      .select("id, concesionario_id, stripe_account_id, pagos_habilitados, transferencias_habilitadas")
      .eq("pagos_habilitados", true)
      .eq("transferencias_habilitadas", true);

    if (cuentasError) throw new Error(`Error fetching accounts: ${cuentasError.message}`);
    if (!cuentas || cuentas.length === 0) {
      console.log("[SETTLEMENTS] No active connected accounts");
      return new Response(JSON.stringify({ processed: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let processed = 0;
    const results: any[] = [];

    for (const cuenta of cuentas) {
      try {
        // Check if already processed today
        const { data: existing } = await supabaseAdmin
          .from("liquidaciones_diarias")
          .select("id")
          .eq("cuenta_conectada_id", cuenta.id)
          .eq("fecha_liquidacion", fechaLiquidacion)
          .single();

        if (existing) {
          console.log(`[SETTLEMENTS] Already processed for account ${cuenta.id}`);
          continue;
        }

        // Get all units for this concesionario
        const { data: unidades } = await supabaseAdmin
          .from("unidades_empresa")
          .select("id")
          .eq("proveedor_id", cuenta.concesionario_id);

        if (!unidades || unidades.length === 0) continue;

        const unidadIds = unidades.map((u: any) => u.id);

        // Count validated tickets today for these units
        const todayStart = `${fechaLiquidacion}T00:00:00-07:00`;
        const todayEnd = `${fechaLiquidacion}T23:59:59-07:00`;

        const { count: totalBoletos } = await supabaseAdmin
          .from("logs_validacion_qr")
          .select("*", { count: "exact", head: true })
          .in("unidad_id", unidadIds)
          .eq("resultado", "valido")
          .gte("created_at", todayStart)
          .lte("created_at", todayEnd);

        const boletos = totalBoletos ?? 0;

        if (boletos === 0) {
          console.log(`[SETTLEMENTS] No tickets for account ${cuenta.id}`);
          continue;
        }

        // Calculate amounts
        const valorFacial = boletos * TICKET_PRICE;
        const comisionTodocerca = valorFacial * PLATFORM_FEE_PERCENT;
        const feeStripeConnect = valorFacial * STRIPE_CONNECT_FEE_PERCENT;
        const feeStripeProcesamiento = (valorFacial * STRIPE_PROCESSING_PERCENT) + STRIPE_FIXED_FEE;
        const montoNeto = valorFacial - comisionTodocerca - feeStripeConnect - feeStripeProcesamiento;

        if (montoNeto <= 0) {
          console.log(`[SETTLEMENTS] Net amount too low for account ${cuenta.id}: ${montoNeto}`);
          continue;
        }

        // Create Stripe transfer to connected account
        let transferId: string | null = null;
        let estado = "pendiente";

        try {
          const transfer = await stripe.transfers.create({
            amount: Math.round(montoNeto * 100), // Convert to centavos
            currency: "mxn",
            destination: cuenta.stripe_account_id!,
            description: `Liquidación ${fechaLiquidacion} - ${boletos} boletos`,
          });
          transferId = transfer.id;
          estado = "completed";
          console.log(`[SETTLEMENTS] Transfer ${transferId} created for ${montoNeto.toFixed(2)} MXN`);
        } catch (stripeErr: any) {
          console.error(`[SETTLEMENTS] Stripe transfer failed:`, stripeErr.message);
          estado = "failed";
        }

        // Record settlement
        await supabaseAdmin.from("liquidaciones_diarias").insert({
          cuenta_conectada_id: cuenta.id,
          fecha_liquidacion: fechaLiquidacion,
          total_boletos: boletos,
          monto_valor_facial: valorFacial,
          monto_comision_todocerca: comisionTodocerca,
          monto_fee_stripe_connect: feeStripeConnect + feeStripeProcesamiento,
          monto_neto: montoNeto,
          estado,
          stripe_transfer_id: transferId,
          fecha_procesamiento: new Date().toISOString(),
        });

        processed++;
        results.push({
          cuenta_id: cuenta.id,
          boletos,
          neto: montoNeto.toFixed(2),
          estado,
        });
      } catch (err: any) {
        console.error(`[SETTLEMENTS] Error processing account ${cuenta.id}:`, err.message);
      }
    }

    console.log(`[SETTLEMENTS] Processed ${processed} settlements`);

    return new Response(JSON.stringify({ processed, results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (error) {
    console.error("[SETTLEMENTS] Error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
