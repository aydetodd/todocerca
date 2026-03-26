import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const TICKET_PRICE = 9.00; // $9.00 MXN
const PLATFORM_FEE_PERCENT = 0.02; // 2% comisión TodoCerca

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
    const fechaHoy = hermosillo.toISOString().split("T")[0];

    const diaSemana = hermosillo.getDay();
    const diaMes = hermosillo.getDate();

    console.log(`[SETTLEMENTS] Processing for ${fechaHoy} (dow=${diaSemana}, dom=${diaMes})`);

    // Get all active connected accounts
    const { data: cuentas, error: cuentasError } = await supabaseAdmin
      .from("cuentas_conectadas")
      .select("id, concesionario_id, stripe_account_id, pagos_habilitados, transferencias_habilitadas, frecuencia_liquidacion")
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
        const freq = (cuenta as any).frecuencia_liquidacion || "daily";

        // Check frequency schedule
        if (freq === "weekly" && diaSemana !== 0) continue;
        if (freq === "monthly" && diaMes !== 1) continue;

        // Determine date range
        let dateStart: string;
        const dateEnd = fechaHoy;

        if (freq === "daily") {
          dateStart = fechaHoy;
        } else if (freq === "weekly") {
          const d = new Date(hermosillo);
          d.setDate(d.getDate() - 6);
          dateStart = d.toISOString().split("T")[0];
        } else {
          const d = new Date(hermosillo);
          d.setMonth(d.getMonth() - 1);
          d.setDate(1);
          dateStart = d.toISOString().split("T")[0];
        }

        const fechaLiquidacion = fechaHoy;

        // Check if already processed
        const { data: existing } = await supabaseAdmin
          .from("liquidaciones_diarias")
          .select("id")
          .eq("cuenta_conectada_id", cuenta.id)
          .eq("fecha_liquidacion", fechaLiquidacion)
          .single();

        if (existing) continue;

        // Get units for this concesionario
        const { data: unidades } = await supabaseAdmin
          .from("unidades_empresa")
          .select("id")
          .eq("proveedor_id", cuenta.concesionario_id);

        if (!unidades || unidades.length === 0) continue;

        const unidadIds = unidades.map((u: any) => u.id);

        // Count validated tickets in date range
        const rangeStart = `${dateStart}T00:00:00-07:00`;
        const rangeEnd = `${dateEnd}T23:59:59-07:00`;

        const { count: totalBoletos } = await supabaseAdmin
          .from("logs_validacion_qr")
          .select("*", { count: "exact", head: true })
          .in("unidad_id", unidadIds)
          .eq("resultado", "valido")
          .gte("created_at", rangeStart)
          .lte("created_at", rangeEnd);

        const boletos = totalBoletos ?? 0;
        if (boletos === 0) continue;

        // Get actual Stripe fees from purchase transactions in the period
        // Sum all stripe_fee from transacciones_boletos for purchases in the range
        const { data: transacciones } = await supabaseAdmin
          .from("transacciones_boletos")
          .select("stripe_fee, cantidad_boletos")
          .eq("tipo", "compra")
          .eq("estado", "completado")
          .gte("created_at", rangeStart)
          .lte("created_at", rangeEnd);

        // Calculate total Stripe fees and total tickets from transactions
        let totalStripeFees = 0;
        let totalTicketsComprados = 0;
        if (transacciones && transacciones.length > 0) {
          for (const tx of transacciones) {
            totalStripeFees += Number(tx.stripe_fee) || 0;
            totalTicketsComprados += tx.cantidad_boletos;
          }
        }

        // Calculate proportional Stripe fee for this concesionario's tickets
        // If this concesionario validated X tickets out of Y total purchased, their share of fees is X/Y
        let feeStripeProporcional = 0;
        if (totalTicketsComprados > 0) {
          feeStripeProporcional = (boletos / totalTicketsComprados) * totalStripeFees;
        } else {
          // Fallback: estimate fee as 3.6% + $3.00 per estimated transaction
          // Approximate 1 transaction per 10 tickets
          const estimatedTransactions = Math.max(1, Math.ceil(boletos / 10));
          feeStripeProporcional = (boletos * TICKET_PRICE * 0.036) + (estimatedTransactions * 3.00);
        }

        // Calculate amounts
        const valorFacial = boletos * TICKET_PRICE;
        const comisionTodocerca = valorFacial * PLATFORM_FEE_PERCENT;
        const totalFees = comisionTodocerca + feeStripeProporcional;
        const montoNeto = valorFacial - totalFees;

        if (montoNeto <= 0) {
          console.log(`[SETTLEMENTS] Net amount too low for account ${cuenta.id}: ${montoNeto}`);
          continue;
        }

        // Create Stripe transfer
        let transferId: string | null = null;
        let estado = "pendiente";

        try {
          const freqLabel = freq === "daily" ? "diaria" : freq === "weekly" ? "semanal" : "mensual";
          const transfer = await stripe.transfers.create({
            amount: Math.round(montoNeto * 100),
            currency: "mxn",
            destination: cuenta.stripe_account_id!,
            description: `Liquidación ${freqLabel} ${fechaLiquidacion} - ${boletos} boletos (${dateStart} a ${dateEnd})`,
          });
          transferId = transfer.id;
          estado = "completed";
          console.log(`[SETTLEMENTS] Transfer ${transferId}: $${montoNeto.toFixed(2)} MXN`);
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
          monto_fee_stripe_connect: feeStripeProporcional,
          monto_neto: montoNeto,
          estado,
          stripe_transfer_id: transferId,
          fecha_procesamiento: new Date().toISOString(),
        });

        processed++;
        results.push({
          cuenta_id: cuenta.id,
          boletos,
          valorFacial: valorFacial.toFixed(2),
          comisionTodocerca: comisionTodocerca.toFixed(2),
          feeStripe: feeStripeProporcional.toFixed(2),
          neto: montoNeto.toFixed(2),
          estado,
          frecuencia: freq,
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
