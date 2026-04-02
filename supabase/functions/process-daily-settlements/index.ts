import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const TICKET_PRICE = 9.00; // $9.00 MXN
const PLATFORM_FEE_PERCENT = 0.02; // 2% comisión TodoCerca
const STRIPE_VARIABLE_FEE_PERCENT = 0.036; // 3.6%
const STRIPE_FIXED_FEE = 3.00; // $3.00 MXN por transacción

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
    // Check if this is a manual trigger for a specific account
    let manualCuentaId: string | null = null;
    let manualFrecuenciaLiquidacion: string | null = null;
    if (req.method === "POST") {
      try {
        const body = await req.json();
        manualCuentaId = body?.cuenta_id || null;
        manualFrecuenciaLiquidacion = body?.frecuencia_liquidacion || null;
      } catch { /* no body */ }
    }

    // Get today's date (Hermosillo timezone UTC-7)
    const now = new Date();
    const hermosillo = new Date(now.getTime() - 7 * 60 * 60 * 1000);
    const fechaHoy = hermosillo.toISOString().split("T")[0];

    const diaSemana = hermosillo.getDay();
    const diaMes = hermosillo.getDate();

    console.log(`[SETTLEMENTS] Processing for ${fechaHoy} (dow=${diaSemana}, dom=${diaMes})${manualCuentaId ? ` [MANUAL: ${manualCuentaId}]` : ""}${manualFrecuenciaLiquidacion ? ` [FREQ: ${manualFrecuenciaLiquidacion}]` : ""}`);

    // Get active connected accounts
    let query = supabaseAdmin
      .from("cuentas_conectadas")
      .select("id, concesionario_id, stripe_account_id, pagos_habilitados, transferencias_habilitadas, frecuencia_liquidacion")
      .eq("pagos_habilitados", true)
      .eq("transferencias_habilitadas", true);

    if (manualCuentaId) {
      query = query.eq("id", manualCuentaId);
    }

    const { data: cuentas, error: cuentasError } = await query;

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
        const freq = manualCuentaId && manualFrecuenciaLiquidacion
          ? manualFrecuenciaLiquidacion
          : (cuenta as any).frecuencia_liquidacion || "daily";

        // Skip frequency check for manual triggers
        if (!manualCuentaId) {
          if (freq === "weekly" && diaSemana !== 0) continue;
          if (freq === "monthly" && diaMes !== 1) continue;
        }

        // Determine date range — settle the PREVIOUS closed period
        let dateStart: string;
        let dateEnd: string;

        if (freq === "daily") {
          // Settle yesterday
          const yesterday = new Date(hermosillo);
          yesterday.setDate(yesterday.getDate() - 1);
          dateStart = yesterday.toISOString().split("T")[0];
          dateEnd = dateStart;
        } else if (freq === "weekly") {
          // Settle previous week (Mon-Sun)
          const d = new Date(hermosillo);
          d.setDate(d.getDate() - 7); // Go to previous week
          const dow = d.getDay();
          const mondayOffset = dow === 0 ? 6 : dow - 1;
          const monday = new Date(d);
          monday.setDate(monday.getDate() - mondayOffset);
          const sunday = new Date(monday);
          sunday.setDate(sunday.getDate() + 6);
          dateStart = monday.toISOString().split("T")[0];
          dateEnd = sunday.toISOString().split("T")[0];
        } else {
          // Settle previous month
          const d = new Date(hermosillo);
          d.setMonth(d.getMonth() - 1);
          d.setDate(1);
          dateStart = d.toISOString().split("T")[0];
          const lastDay = new Date(d.getFullYear(), d.getMonth() + 1, 0);
          dateEnd = lastDay.toISOString().split("T")[0];
        }

        const fechaLiquidacion = dateEnd; // Use end of settled period as reference

        // Check if already processed
        const { data: existing } = await supabaseAdmin
          .from("liquidaciones_diarias")
          .select("id, estado")
          .eq("cuenta_conectada_id", cuenta.id)
          .eq("fecha_liquidacion", fechaLiquidacion)
          .maybeSingle();

        if (existing && existing.estado !== "failed") continue;

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
          .eq("resultado", "valid")
          .gte("created_at", rangeStart)
          .lte("created_at", rangeEnd);

        const boletos = totalBoletos ?? 0;
        if (boletos === 0) continue;

        // Get actual Stripe fees from purchase transactions in the period
        // Sum all stripe_fee from transacciones_boletos for purchases in the range
        const { data: transacciones } = await supabaseAdmin
          .from("transacciones_boletos")
          .select("stripe_fee, cantidad_boletos, monto_total")
          .eq("tipo", "compra")
          .eq("estado", "completado")
          .gte("created_at", rangeStart)
          .lte("created_at", rangeEnd);

        // Calculate total Stripe fees and total tickets from transactions
        let totalStripeFees = 0;
        let totalTicketsComprados = 0;
        if (transacciones && transacciones.length > 0) {
          for (const tx of transacciones) {
            const cantidadBoletosTx = Number(tx.cantidad_boletos) || 0;
            const montoTotalTx = Number((tx as any).monto_total) || (cantidadBoletosTx * TICKET_PRICE);
            const stripeFeeReal = Number(tx.stripe_fee) || 0;
            const stripeFeeEstimado = (montoTotalTx * STRIPE_VARIABLE_FEE_PERCENT) + STRIPE_FIXED_FEE;

            totalStripeFees += stripeFeeReal > 0 ? stripeFeeReal : stripeFeeEstimado;
            totalTicketsComprados += cantidadBoletosTx;
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
          feeStripeProporcional = (boletos * TICKET_PRICE * STRIPE_VARIABLE_FEE_PERCENT) + (estimatedTransactions * STRIPE_FIXED_FEE);
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

        const settlementPayload = {
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
        };

        if (existing?.estado === "failed") {
          await supabaseAdmin
            .from("liquidaciones_diarias")
            .update(settlementPayload)
            .eq("id", existing.id);
        } else {
          await supabaseAdmin
            .from("liquidaciones_diarias")
            .insert(settlementPayload);
        }

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
