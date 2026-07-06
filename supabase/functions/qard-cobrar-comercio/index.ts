// QaRd — Cobro del comercio a un QR
// Descuenta el 100% del monto al titular del sub-QR y registra 6% comisión / 94% neto para el comercio.
// El 94% se acumula en liquidaciones_diarias (Stripe Connect existente).
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const COMISION_PCT = 0.06;
const SALDO_MIN = -50;

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabaseAnon = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_ANON_KEY") ?? ""
  );
  const admin = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
  );

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) throw new Error("No autenticado");
    const token = authHeader.replace("Bearer ", "");
    const { data: userData } = await supabaseAnon.auth.getUser(token);
    const comercio = userData.user;
    if (!comercio) throw new Error("No autenticado");

    const body = await req.json();
    const qardNumberRaw = String(body.qard_number || "").replace(/\D/g, "");
    const monto = Number(body.monto_mxn);
    const cvvInput = body.cvv != null ? String(body.cvv).replace(/\D/g, "") : null;
    const manual = !!body.manual;

    if (qardNumberRaw.length !== 16) {
      return jsonErr("QR inválido (deben ser 16 dígitos)", "invalido");
    }
    if (!monto || monto <= 0) {
      return jsonErr("Monto inválido", "invalido");
    }
    if (manual && (!cvvInput || cvvInput.length < 3)) {
      return jsonErr("CVV requerido para cobro manual", "cvv_requerido", { color: "rojo" });
    }

    // 1) Buscar sub-QR
    const { data: sub } = await admin
      .from("qard_sub_qr")
      .select("id, wallet_id, titular_user_id, alias, sub_index, estado, saldo_mxn, limite_por_transaccion, horario_inicio, horario_fin")
      .eq("qard_number", qardNumberRaw)
      .maybeSingle();

    if (!sub) return jsonErr("Tarjeta no encontrada", "no_existe");
    if (sub.estado === "cancelada") {
      return jsonErr("TARJETA CANCELADA", "cancelada", { color: "rojo" });
    }
    if (sub.estado === "apagada") {
      return jsonErr("TARJETA APAGADA por el titular", "apagada", { color: "rojo" });
    }

    // 2) Reglas del sub-QR
    if (sub.limite_por_transaccion && monto > Number(sub.limite_por_transaccion)) {
      return jsonErr(
        `Excede límite. Máx por transacción: $${Number(sub.limite_por_transaccion).toFixed(2)}`,
        "excede_limite",
        { color: "naranja", limite: Number(sub.limite_por_transaccion), intento: monto }
      );
    }
    if (sub.horario_inicio && sub.horario_fin) {
      const now = new Date();
      const hhmm = now.toTimeString().slice(0, 5);
      if (hhmm < String(sub.horario_inicio).slice(0, 5) || hhmm > String(sub.horario_fin).slice(0, 5)) {
        return jsonErr(
          `Fuera de horario permitido (${sub.horario_inicio}–${sub.horario_fin}). Ahora: ${hhmm}`,
          "fuera_horario",
          { color: "naranja" }
        );
      }
    }

    // 3) Wallet del titular (siempre necesario para movimientos y bloqueo)
    const { data: wallet } = await admin
      .from("qard_wallets")
      .select("id, saldo_mxn, estado")
      .eq("id", sub.wallet_id)
      .single();

    if (!wallet) return jsonErr("Billetera no encontrada", "no_existe");
    if (wallet.estado !== "activa") return jsonErr("BILLETERA BLOQUEADA", "bloqueada", { color: "rojo" });

    // 3.1) Determinar fuente del saldo: titular (sub_index=0) usa wallet; sub-QRs usan su saldo propio
    const esTitular = sub.sub_index === 0;
    const saldoActual = esTitular ? Number(wallet.saldo_mxn) : Number(sub.saldo_mxn ?? 0);
    const minAceptado = esTitular ? SALDO_MIN : 0; // sub-QRs no pueden ir a negativo
    const saldoDespues = +(saldoActual - monto).toFixed(2);

    if (saldoDespues < minAceptado) {
      if (saldoActual <= minAceptado) {
        return jsonErr(
          `LÍMITE ALCANZADO. Saldo: $${saldoActual.toFixed(2)}`,
          "limite_alcanzado",
          { color: "rojo", saldo: saldoActual }
        );
      }
      return jsonErr(
        `SALDO INSUFICIENTE. Saldo: $${saldoActual.toFixed(2)} · Requerido: $${monto.toFixed(2)}`,
        "insuficiente",
        { color: "amarillo", saldo: saldoActual, requerido: monto }
      );
    }

    // 4) Descontar del origen correcto (optimistic lock por saldo previo)
    if (esTitular) {
      const { error: updErr, data: updRow } = await admin
        .from("qard_wallets")
        .update({ saldo_mxn: saldoDespues })
        .eq("id", wallet.id)
        .eq("saldo_mxn", saldoActual)
        .select("id")
        .maybeSingle();
      if (updErr || !updRow) return jsonErr("Reintenta, hubo un cambio de saldo concurrente", "reintento");
    } else {
      const { error: updErr, data: updRow } = await admin
        .from("qard_sub_qr")
        .update({ saldo_mxn: saldoDespues })
        .eq("id", sub.id)
        .eq("saldo_mxn", saldoActual)
        .select("id")
        .maybeSingle();
      if (updErr || !updRow) return jsonErr("Reintenta, hubo un cambio de saldo concurrente", "reintento");
    }

    // 5) Split 6% / 94%
    const comision = +(monto * COMISION_PCT).toFixed(2);
    const neto = +(monto - comision).toFixed(2);

    // Nombre del comercio
    const { data: comProfile } = await admin
      .from("profiles").select("apodo, nombre").eq("user_id", comercio.id).maybeSingle();
    const comercioNombre = comProfile?.apodo || comProfile?.nombre || "Comercio";

    // 6) Registrar movimiento
    await admin.from("qard_movimientos").insert({
      wallet_id: wallet.id,
      titular_user_id: sub.titular_user_id,
      sub_qr_id: sub.id,
      tipo: "cobro_comercio",
      monto_mxn: monto,
      saldo_despues: saldoDespues,
      comercio_user_id: comercio.id,
      comercio_nombre: comercioNombre,
      comision_mxn: comision,
      neto_comercio_mxn: neto,
      descripcion: `Cobro en ${comercioNombre}`,
      metadata: { sub_index: sub.sub_index, alias: sub.alias },
    });

    // 7) La liquidación al CLABE del comercio se calcula por lote diario a partir
    //    de qard_movimientos.neto_comercio_mxn (job separado — Fase 1 solo acumula).



    // 8) Notificar al titular vía bandeja de sistema
    try {
      const SYSTEM = "00000000-0000-0000-0000-000000000001";
      await admin.from("messages").insert({
        sender_id: SYSTEM,
        receiver_id: sub.titular_user_id,
        message: `💳 QaRd: se cobraron $${monto.toFixed(2)} en ${comercioNombre} con tu QR ${String(sub.sub_index).padStart(2, "0")} (${sub.alias}).\nSaldo actual: $${saldoDespues.toFixed(2)}`,
        is_panic: false,
        is_read: false,
      });
    } catch {}

    return new Response(JSON.stringify({
      ok: true,
      estado: "cobrado",
      color: "verde",
      mensaje: `COBRADO $${monto.toFixed(2)}`,
      saldo_despues: saldoDespues,
      comision,
      neto,
      alias: sub.alias,
      sub_index: sub.sub_index,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    console.error("[QARD-COBRAR]", e);
    return jsonErr(e instanceof Error ? e.message : String(e), "error");
  }
});

function jsonErr(mensaje: string, codigo: string, extra: Record<string, unknown> = {}) {
  return new Response(JSON.stringify({ ok: false, estado: codigo, mensaje, ...extra }), {
    status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
