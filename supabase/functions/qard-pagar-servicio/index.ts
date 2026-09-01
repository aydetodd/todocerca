// QaRd — Pago de servicios (CFE, agua, gas, internet...) con saldo QaRd.
// Paso 1: descuenta el saldo de forma atómica e idempotente (RPC qard_pagar_servicio).
// Paso 2: dispersa por SPEI vía Fintoc. Si no hay llave de Fintoc, el pago queda
//         en "pendiente_envio" y se puede dispersar después sin volver a cobrar.
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SYSTEM_USER = "00000000-0000-0000-0000-000000000001";
const FINTOC_API = "https://api.fintoc.com/v1";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const anon = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_ANON_KEY") ?? ""
  );
  const admin = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
  );

  let pagoId: string | null = null;

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) throw new Error("No autenticado");
    const { data: userData } = await anon.auth.getUser(authHeader.replace("Bearer ", ""));
    const user = userData.user;
    if (!user) throw new Error("No autenticado");

    const { data: bloq } = await admin.rpc("cuenta_esta_bloqueada", { _user_id: user.id });
    if (bloq === true) throw new Error("Tu cuenta está bloqueada por seguridad. Desbloquéala desde tu teléfono.");

    const body = await req.json();
    const servicioId = String(body.servicio_id || "").trim();
    const referencia = String(body.referencia || "").trim();
    const monto = Number(body.monto_mxn);
    const idem = String(body.idempotency_key || "").trim();

    if (!servicioId) throw new Error("Selecciona un servicio");
    if (!referencia) throw new Error("Falta el número de referencia");
    if (!Number.isFinite(monto) || monto <= 0) throw new Error("Monto inválido");
    if (!idem || idem.length < 8) throw new Error("Falta la llave de operación");

    // 1) Cobro atómico e idempotente
    const { data: cobro, error: cobroErr } = await admin.rpc("qard_pagar_servicio", {
      _user_id: user.id,
      _servicio_id: servicioId,
      _referencia: referencia,
      _monto: monto,
      _idem: idem,
    });
    if (cobroErr) throw new Error(cobroErr.message);

    const res = cobro as Record<string, unknown>;
    pagoId = String(res.pago_id);

    if (res.duplicado === true) {
      return json({ ok: true, duplicado: true, ...res });
    }

    // 2) Dispersión SPEI vía Fintoc
    const fintocKey = Deno.env.get("FINTOC_SECRET_KEY");
    const { data: srv } = await admin
      .from("qard_servicios_catalogo")
      .select("nombre, clabe_destino, banco_nombre")
      .eq("id", servicioId)
      .maybeSingle();

    let estadoFinal = "pendiente_envio";
    let transferId: string | null = null;

    if (fintocKey && srv?.clabe_destino) {
      const resp = await fetch(`${FINTOC_API}/transfers`, {
        method: "POST",
        headers: {
          Authorization: fintocKey,
          "Content-Type": "application/json",
          "Idempotency-Key": idem,
        },
        body: JSON.stringify({
          amount: Math.round(monto * 100),
          currency: "MXN",
          counterparty: { account_number: srv.clabe_destino, institution_id: null },
          comment: `${srv.nombre} ${referencia}`.slice(0, 40),
          metadata: { pago_servicio_id: pagoId, user_id: user.id, referencia },
        }),
      });

      const raw = await resp.text();
      if (!resp.ok) {
        console.error(`[QARD-SERVICIO] Fintoc ${resp.status}: ${raw}`);
        await admin.rpc("qard_revertir_pago_servicio", {
          _pago_id: pagoId,
          _motivo: `Fintoc ${resp.status}: ${raw.slice(0, 300)}`,
        });
        return json(
          { error: "No se pudo enviar el pago al proveedor. Te devolvimos tu saldo.", details: raw },
          resp.status
        );
      }
      try {
        transferId = (JSON.parse(raw)?.id as string) ?? null;
      } catch { /* respuesta sin JSON */ }
      estadoFinal = "enviado";
    }

    await admin
      .from("qard_pagos_servicio")
      .update({
        estado: estadoFinal,
        proveedor_transfer_id: transferId,
        metadata: {
          clabe_destino: srv?.clabe_destino ?? null,
          banco: srv?.banco_nombre ?? null,
          fintoc_configurado: !!fintocKey,
        },
      })
      .eq("id", pagoId);

    // Aviso al usuario en su bandeja
    try {
      await admin.from("messages").insert({
        sender_id: SYSTEM_USER,
        receiver_id: user.id,
        message:
          `🧾 Pago de ${srv?.nombre ?? "servicio"} por $${Number(res.total_mxn).toFixed(2)} ` +
          `(ref ${referencia}). Saldo restante: $${Number(res.saldo_despues).toFixed(2)}.` +
          (estadoFinal === "enviado" ? " Enviado al proveedor." : " En proceso de envío al proveedor."),
        is_panic: false,
        is_read: false,
      });
    } catch (e) {
      console.warn("[QARD-SERVICIO] Sin notificación:", e);
    }

    return json({ ok: true, ...res, estado: estadoFinal, proveedor_transfer_id: transferId });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[QARD-PAGAR-SERVICIO]", msg);
    return json({ error: msg }, 400);
  }
});
