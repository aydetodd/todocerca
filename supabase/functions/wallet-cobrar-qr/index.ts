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

    // Si no es sub-QR, intentar como QR EJE (wallets_qr)
    let isEje = false;
    let ejeWallet: any = null;
    if (!sub) {
      let qe = admin.from("wallets_qr").select("*");
      if (tokenOrFolio.toUpperCase().startsWith("EJ-")) {
        qe = qe.eq("folio_corto", tokenOrFolio.toUpperCase());
      } else {
        qe = qe.eq("token", tokenOrFolio);
      }
      const { data: w } = await qe.maybeSingle();
      if (!w) throw new Error("QR no reconocido");
      ejeWallet = w;
      isEje = true;
    } else if (sub.estado !== "activo") {
      throw new Error(`QR ${sub.estado}`);
    }

    if (onlyConsult) {
      if (isEje) {
        return new Response(JSON.stringify({
          tipo: "eje", alias: "Cuenta Eje",
          folio_corto: ejeWallet.folio_corto,
          saldo_mxn: Number(ejeWallet.saldo_mxn), estado: "activo",
        }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      return new Response(JSON.stringify({
        tipo: "sub", alias: sub.alias, folio_corto: sub.folio_corto,
        saldo_mxn: Number(sub.saldo_mxn), estado: sub.estado,
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (!monto || monto <= 0) throw new Error("Monto inválido");

    const ultimo = isEje ? ejeWallet.ultimo_uso_at : sub.ultimo_uso_at;
    if (ultimo) {
      const elapsed = (Date.now() - new Date(ultimo).getTime()) / 1000;
      if (elapsed < COOLDOWN_SECS) {
        const wait = Math.ceil(COOLDOWN_SECS - elapsed);
        throw new Error(`QR usado hace ${Math.floor(elapsed)}s. Espera ${wait}s (anti-fraude)`);
      }
    }

    const saldoActual = isEje ? Number(ejeWallet.saldo_mxn) : Number(sub.saldo_mxn);
    if (saldoActual < monto) {
      throw new Error(`Saldo insuficiente. Disponible $${saldoActual.toFixed(2)}, requerido $${monto.toFixed(2)}`);
    }

    const nuevoSaldo = saldoActual - monto;
    const nowIso = new Date().toISOString();
    const titularId = isEje ? ejeWallet.user_id : sub.titular_user_id;
    const walletId = isEje ? ejeWallet.id : sub.wallet_id;
    const aliasLog = isEje ? `Cuenta Eje (${ejeWallet.folio_corto})` : `${sub.alias} (${sub.folio_corto})`;

    if (isEje) {
      await admin.from("wallets_qr").update({
        saldo_mxn: nuevoSaldo,
        total_gastado: Number(ejeWallet.total_gastado) + monto,
        ultimo_uso_at: nowIso,
      }).eq("id", ejeWallet.id);
    } else {
      await admin.from("sub_qr_saldo").update({
        saldo_mxn: nuevoSaldo,
        total_gastado: Number(sub.total_gastado) + monto,
        ultimo_uso_at: nowIso,
        ultima_ruta_producto_id: productoId,
      }).eq("id", sub.id);
      const { data: w } = await admin.from("wallets_qr").select("total_gastado").eq("id", sub.wallet_id).single();
      if (w) {
        await admin.from("wallets_qr").update({
          total_gastado: Number(w.total_gastado) + monto,
        }).eq("id", sub.wallet_id);
      }
    }

    await admin.from("movimientos_wallet").insert({
      wallet_id: walletId,
      titular_user_id: titularId,
      sub_qr_id: isEje ? null : sub.id,
      tipo: "cobro_viaje",
      monto_mxn: monto,
      saldo_sub_qr_despues: isEje ? null : nuevoSaldo,
      saldo_wallet_despues: isEje ? nuevoSaldo : null,
      producto_id: productoId,
      unidad_id: unidadId,
      descripcion: `Cobro ${aliasLog}: $${monto.toFixed(2)} (saldo $${nuevoSaldo.toFixed(2)})`,
      metadata: { fuente, qr_tipo: isEje ? "eje" : "sub" },
    });

    try {
      let rutaNombre = "";
      if (productoId) {
        const { data: p } = await admin.from("productos").select("nombre").eq("id", productoId).maybeSingle();
        rutaNombre = p?.nombre ? ` en ${p.nombre}` : "";
      }
      await admin.from("messages").insert({
        sender_id: SYSTEM_USER,
        receiver_id: titularId,
        message: `💳 ${aliasLog} pagó $${monto.toFixed(2)}${rutaNombre}. Saldo restante: $${nuevoSaldo.toFixed(2)}`,
        is_panic: false,
        is_read: false,
      });
    } catch (e) {
      console.warn("[WALLET-COBRO] No se envió notificación:", e);
    }

    return new Response(JSON.stringify({
      ok: true,
      tipo: isEje ? "eje" : "sub",
      alias: isEje ? "Cuenta Eje" : sub.alias,
      folio_corto: isEje ? ejeWallet.folio_corto : sub.folio_corto,
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
