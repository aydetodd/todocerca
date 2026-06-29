// Cobrar viaje con un Sub-QR de saldo (escaneado por chofer o Raspberry)
// Cooldown 3 min + notifica al titular vía inbox
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const COOLDOWN_SECS = 180; // 3 minutos
const SYSTEM_USER = "00000000-0000-0000-0000-000000000001";

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const admin = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
  );

  try {
    const body = await req.json();
    const tokenOrFolio = String(body.qr_token || body.folio_corto || "").trim();
    const productoId = body.producto_id ? String(body.producto_id) : null;
    const unidadId = body.unidad_id ? String(body.unidad_id) : null;
    const monto = body.monto_mxn != null ? Number(body.monto_mxn) : null;
    const fuente = String(body.fuente || "chofer");
    const onlyConsult = !!body.solo_consulta;

    if (!tokenOrFolio) throw new Error("Falta QR");

    // Resolver sub-QR por token o por folio_corto
    let q = admin.from("sub_qr_saldo").select("*");
    if (tokenOrFolio.includes("-")) {
      q = q.eq("folio_corto", tokenOrFolio.toUpperCase());
    } else {
      q = q.eq("token", tokenOrFolio);
    }
    const { data: sub } = await q.maybeSingle();
    if (!sub) throw new Error("QR no reconocido");
    if (sub.estado !== "activo") throw new Error(`QR ${sub.estado}`);

    // Consulta de saldo nada más
    if (onlyConsult) {
      return new Response(JSON.stringify({
        alias: sub.alias,
        folio_corto: sub.folio_corto,
        saldo_mxn: Number(sub.saldo_mxn),
        estado: sub.estado,
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (!monto || monto <= 0) throw new Error("Monto inválido");

    // Cooldown anti-fraude
    if (sub.ultimo_uso_at) {
      const elapsed = (Date.now() - new Date(sub.ultimo_uso_at).getTime()) / 1000;
      if (elapsed < COOLDOWN_SECS) {
        const wait = Math.ceil(COOLDOWN_SECS - elapsed);
        throw new Error(`QR usado hace ${Math.floor(elapsed)}s. Espera ${wait}s (anti-fraude)`);
      }
    }

    // Saldo
    if (Number(sub.saldo_mxn) < monto) {
      throw new Error(`Saldo insuficiente. Disponible $${Number(sub.saldo_mxn).toFixed(2)}, requerido $${monto.toFixed(2)}`);
    }

    const nuevoSaldo = Number(sub.saldo_mxn) - monto;
    const nowIso = new Date().toISOString();

    await admin.from("sub_qr_saldo").update({
      saldo_mxn: nuevoSaldo,
      total_gastado: Number(sub.total_gastado) + monto,
      ultimo_uso_at: nowIso,
      ultima_ruta_producto_id: productoId,
    }).eq("id", sub.id);

    // Movimiento
    await admin.from("movimientos_wallet").insert({
      wallet_id: sub.wallet_id,
      titular_user_id: sub.titular_user_id,
      sub_qr_id: sub.id,
      tipo: "cobro_viaje",
      monto_mxn: monto,
      saldo_sub_qr_despues: nuevoSaldo,
      producto_id: productoId,
      unidad_id: unidadId,
      descripcion: `Cobro ${sub.alias}: $${monto.toFixed(2)} (saldo restante $${nuevoSaldo.toFixed(2)})`,
      metadata: { fuente },
    });

    // Actualiza wallet.total_gastado
    const { data: w } = await admin.from("wallets_qr").select("total_gastado").eq("id", sub.wallet_id).single();
    if (w) {
      await admin.from("wallets_qr").update({
        total_gastado: Number(w.total_gastado) + monto,
      }).eq("id", sub.wallet_id);
    }

    // Notificar al titular (inbox)
    try {
      let rutaNombre = "";
      if (productoId) {
        const { data: p } = await admin.from("productos").select("nombre").eq("id", productoId).maybeSingle();
        rutaNombre = p?.nombre ? ` en ${p.nombre}` : "";
      }
      await admin.from("messages").insert({
        sender_id: SYSTEM_USER,
        receiver_id: sub.titular_user_id,
        message: `💳 QR "${sub.alias}" (${sub.folio_corto}) pagó $${monto.toFixed(2)}${rutaNombre}. Saldo restante: $${nuevoSaldo.toFixed(2)}`,
        is_panic: false,
        is_read: false,
      });
    } catch (e) {
      console.warn("[WALLET-COBRO] No se envió notificación:", e);
    }

    return new Response(JSON.stringify({
      ok: true,
      alias: sub.alias,
      folio_corto: sub.folio_corto,
      cobrado: monto,
      saldo_restante: nuevoSaldo,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

  } catch (e) {
    console.error("[WALLET-COBRO-QR] Error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : String(e) }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
