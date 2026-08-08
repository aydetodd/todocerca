// Retira el importe cobrado a los pasajeros de los viajes indicados.
// - Calcula bruto (importe cobrado a pasajeros) y neto (94%, 6% comisión)
// - Ejecuta el retiro por método: qard / oxxo / spei
// - Marca los viajes como retirados para no volverlos a cobrar
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import { checkRateLimit } from "../_shared/rateLimit.ts";
import { RETIROS_STP_ENABLED, METODOS_RETIRO_BLOQUEADOS, MENSAJE_RETIRO_BLOQUEADO } from "../_shared/featureFlags.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Comisión por método: QaRd sin comisión, SPEI 3%, OXXO aún por definir (0 por ahora).
const COMISION_POR_METODO: Record<string, number> = { qard: 0, oxxo: 0, spei: 0.03 };

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const anon = createClient(Deno.env.get("SUPABASE_URL") ?? "", Deno.env.get("SUPABASE_ANON_KEY") ?? "");
  const admin = createClient(Deno.env.get("SUPABASE_URL") ?? "", Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "");

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) throw new Error("No autenticado");
    const { data: userData } = await anon.auth.getUser(authHeader.replace("Bearer ", ""));
    const user = userData.user;
    if (!user) throw new Error("No autenticado");

    const body = await req.json();
    const viajeIds: string[] = Array.isArray(body.viaje_ids) ? body.viaje_ids : [];
    const metodo = String(body.metodo || "").toLowerCase();
    const destino = String(body.destino || "").trim();
    const cvv = String(body.cvv || "").replace(/\D/g, "");
    if (!viajeIds.length) return err("Selecciona al menos un viaje");
    if (!["qard", "oxxo", "spei"].includes(metodo)) return err("Método inválido");
    if (!RETIROS_STP_ENABLED && METODOS_RETIRO_BLOQUEADOS.includes(metodo)) {
      return err(MENSAJE_RETIRO_BLOQUEADO);
    }

    // Límite de peticiones: solo en retiros/transferencias de dinero
    const rl = await checkRateLimit(admin, user.id, "retirar_viajes", { maxIntentos: 5, ventanaSegundos: 60 });
    if (!rl.ok) return err(rl.error!);

    // El usuario autenticado es auth.users.id.
    // Pero choferes/productos/contratos pertenecen al registro public.proveedores.id.
    // Si comparamos directo contra user.id, los viajes foráneos reales salen como "no te pertenecen".
    const { data: proveedor } = await admin
      .from("proveedores")
      .select("id, user_id")
      .eq("user_id", user.id)
      .maybeSingle();
    const proveedorId = (proveedor as any)?.id || user.id;

    // 1) Validar que los viajes son del concesionario y no están retirados
    const [{ data: contratos }, { data: choferesProv }, { data: prods }] = await Promise.all([
      admin.from("contratos_transporte").select("id").eq("concesionario_id", proveedorId),
      admin.from("choferes_empresa").select("id").eq("proveedor_id", proveedorId),
      admin.from("productos").select("id").eq("proveedor_id", proveedorId),
    ]);
    const contratoIds = (contratos || []).map((c: any) => c.id);
    const choferIds = (choferesProv || []).map((c: any) => c.id);
    const productoIds = (prods || []).map((p: any) => p.id);

    const { data: viajes, error: vErr } = await admin
      .from("viajes_realizados")
      .select("id, contrato_id, chofer_id, producto_id, retirado_at")
      .in("id", viajeIds);
    if (vErr) throw vErr;

    const validos = (viajes || []).filter((v: any) =>
      (
        contratoIds.includes(v.contrato_id) ||
        choferIds.includes(v.chofer_id) ||
        productoIds.includes(v.producto_id)
      )
    );
    if (!validos.length) return err("Los viajes ya fueron cobrados o no te pertenecen");
    const validosIds = validos.map((v: any) => v.id);

    // 2) Calcular bruto SOLO con los cobros que aún no han sido retirados.
    //    (Un viaje en curso puede seguir sumando cobros después de un retiro previo.)
    const [{ data: qvp }, { data: cqt }] = await Promise.all([
      admin.from("qard_viajes_pasajero").select("id, viaje_id, monto_cobrado_mxn")
        .in("viaje_id", validosIds).is("retirado_at", null),
      admin.from("cobros_qr_tramo").select("id, viaje_id, precio_real")
        .in("viaje_id", validosIds).is("retirado_at", null),
    ]);
    const qvpIds = (qvp || []).map((r: any) => r.id);
    const cqtIds = (cqt || []).map((r: any) => r.id);
    let bruto = 0;
    (qvp || []).forEach((r: any) => { bruto += Number(r.monto_cobrado_mxn) || 0; });
    (cqt || []).forEach((r: any) => { bruto += Number(r.precio_real) || 0; });
    bruto = +bruto.toFixed(2);
    if (bruto <= 0) return err("Los viajes seleccionados no tienen importe pendiente de cobrar");
    const comision = +(bruto * (COMISION_POR_METODO[metodo] ?? 0)).toFixed(2);
    const neto = +(bruto - comision).toFixed(2);
    if (neto < 1) return err("Neto insuficiente para retirar");

    // 3) Asegurar wallet del comercio
    try { await admin.rpc("qard_ensure_wallet", { _user_id: user.id }); } catch (_) {}
    let { data: wallet } = await admin
      .from("qard_wallets").select("id, saldo_mxn").eq("titular_user_id", user.id).maybeSingle();
    if (!wallet) {
      const cvv4 = Array.from({ length: 4 }, () => Math.floor(Math.random() * 10)).join("");
      const ins = await admin.from("qard_wallets").insert({
        titular_user_id: user.id, cvv_dinamico: cvv4, saldo_mxn: 0, estado: "activa",
      }).select("id, saldo_mxn").single();
      if (ins.error) throw new Error(`No se pudo crear la billetera: ${ins.error.message}`);
      wallet = ins.data as any;
    }

    // 4) Ejecutar retiro según método
    const batchId = crypto.randomUUID();
    let referencia = "";
    let descripcion = "";
    const metadata: Record<string, unknown> = { metodo, batch_id: batchId, viajes: validosIds.length, bruto, comision };

    if (metodo === "qard") {
      const d = destino.replace(/\D/g, "");
      if (d.length !== 16) return err("Ingresa los 16 dígitos de la QaRd destino");

      const { data: subRow } = await admin
        .from("qard_sub_qr")
        .select("id, wallet_id, sub_index, cvv_dinamico, alias, qard_wallets!inner(id, titular_user_id, cvv_dinamico)")
        .eq("qard_number", d)
        .maybeSingle();
      if (!subRow) return err("La QaRd destino no existe");

      const toSubId = (subRow as any).id;
      const toWalletId = (subRow as any).wallet_id;
      const toSubIndex = (subRow as any).sub_index;
      const toTitular = (subRow as any).qard_wallets?.titular_user_id;
      const toCvvDinEnc = toSubIndex === 0
        ? ((subRow as any).qard_wallets?.cvv_dinamico || (subRow as any).cvv_dinamico)
        : (subRow as any).cvv_dinamico;
      // Los CVV viven cifrados: se descifran con la llave maestra (service_role)
      const { data: toCvvDin } = await admin.rpc("qard_dec" as any, { _v: toCvvDinEnc });

      const mismoTitular = toTitular === user.id;
      if (!mismoTitular) {
        if (cvv.length !== 4) return err("Escribe el CVV dinámico de 4 dígitos del destino");
        if (!toCvvDin || String(toCvvDin) !== cvv) return err("CVV dinámico incorrecto");
      }

      const nuevoCvv = Array.from({ length: 4 }, () => Math.floor(Math.random() * 10)).join("");
      const { data: nuevoCvvEnc } = await admin.rpc("qard_enc" as any, { _v: nuevoCvv });
      let saldoDestinoDespues = 0;

      if (toSubIndex === 0) {
        const { data: cur } = await admin.from("qard_wallets").select("saldo_mxn").eq("id", toWalletId).single();
        const nuevo = +(Number(cur?.saldo_mxn ?? 0) + neto).toFixed(2);
        await admin.from("qard_wallets").update({ saldo_mxn: nuevo, cvv_dinamico: nuevoCvvEnc }).eq("id", toWalletId);
        await admin.from("qard_sub_qr").update({ saldo_mxn: nuevo, cvv_dinamico: nuevoCvvEnc })
          .eq("id", toSubId).eq("sub_index", 0);
        saldoDestinoDespues = nuevo;
      } else {
        const { data: curSub } = await admin.from("qard_sub_qr").select("saldo_mxn").eq("id", toSubId).single();
        const nuevo = +(Number(curSub?.saldo_mxn ?? 0) + neto).toFixed(2);
        await admin.from("qard_sub_qr").update({ saldo_mxn: nuevo, cvv_dinamico: nuevoCvvEnc }).eq("id", toSubId);
        saldoDestinoDespues = nuevo;
      }

      await admin.from("qard_movimientos").insert({
        wallet_id: toWalletId,
        titular_user_id: toTitular,
        sub_qr_id: toSubIndex === 0 ? null : toSubId,
        tipo: "transferencia_p2p_in",
        monto_mxn: neto,
        saldo_despues: saldoDestinoDespues,
        descripcion: `Cobro de pasajes recibido •••• ${d.slice(-4)}`,
        comercio_nombre: "Cobro de viajes",
      });

      if (!mismoTitular) {
        await admin.from("messages").insert({
          sender_id: "00000000-0000-0000-0000-000000000001",
          receiver_id: toTitular,
          message: `💸 Recibiste $${neto.toFixed(2)} MXN por cobro de pasajes.\n\n🔐 Nuevo CVV dinámico: ${nuevoCvv}`,
          is_read: false,
        });
      }

      referencia = `QARD${Date.now().toString().slice(-10)}`;
      descripcion = `Cobro de ${validos.length} viaje(s) · Transferencia a QaRd •••• ${d.slice(-4)} · ${referencia}`;
      metadata.destino_last4 = d.slice(-4);
    } else if (metodo === "oxxo") {
      referencia = Array.from({ length: 14 }, () => Math.floor(Math.random() * 10)).join("");
      descripcion = `Cobro de ${validos.length} viaje(s) · Retiro efectivo OXXO · ref ${referencia}`;
      metadata.simulado = true;
      metadata.vigencia_horas = 72;
    } else {
      let clabe = destino.replace(/\D/g, "");
      if (!clabe) {
        const { data: cc } = await admin
          .from("cuentas_conectadas").select("info_bancaria").eq("concesionario_id", proveedorId).maybeSingle();
        const ib: any = cc?.info_bancaria ?? {};
        clabe = String(ib?.clabe || ib?.last4 || "").replace(/\D/g, "");
      }
      if (!clabe || (clabe.length !== 18 && clabe.length !== 4)) {
        return err("Registra tu CLABE de cobros o proporciona una CLABE de 18 dígitos");
      }
      referencia = `SPEI${Date.now().toString().slice(-10)}`;
      descripcion = `Cobro de ${validos.length} viaje(s) · SPEI a CLABE •••${clabe.slice(-4)} · ${referencia}`;
      metadata.simulado = true;
      metadata.clabe_last4 = clabe.slice(-4);
    }
    metadata.referencia = referencia;

    // 5) Registrar movimiento contable del comercio (para historial de "Mis cobros")
    await admin.from("qard_movimientos").insert({
      wallet_id: wallet.id,
      titular_user_id: user.id,
      tipo: `retiro_${metodo}`,
      monto_mxn: neto,
      saldo_despues: 0,
      comercio_user_id: user.id,
      comision_mxn: comision,
      neto_comercio_mxn: -neto,
      descripcion,
      metadata,
    });

    // 6) Marcar cada cobro como retirado (control fino) y el viaje como pagado
    const nowIso = new Date().toISOString();
    if (qvpIds.length) {
      await admin.from("qard_viajes_pasajero")
        .update({ retirado_at: nowIso, retiro_referencia: referencia })
        .in("id", qvpIds);
    }
    if (cqtIds.length) {
      await admin.from("cobros_qr_tramo")
        .update({ retirado_at: nowIso, retiro_referencia: referencia })
        .in("id", cqtIds);
    }
    await admin.from("viajes_realizados")
      .update({
        retirado_at: nowIso,
        retiro_metodo: metodo,
        retiro_bruto_mxn: bruto,
        retiro_neto_mxn: neto,
        retiro_referencia: referencia,
        retiro_batch_id: batchId,
      })
      .in("id", validosIds);

    return new Response(JSON.stringify({
      ok: true,
      mensaje: metodo === "oxxo"
        ? `Retiro en OXXO listo. Referencia ${referencia}`
        : metodo === "spei"
        ? `SPEI enviado. Referencia ${referencia}`
        : `Transferencia enviada. Referencia ${referencia}`,
      viajes_cobrados: validos.length,
      bruto, comision, neto, referencia,
      simulado: metodo !== "qard",
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    console.error("[RETIRAR-VIAJES]", e);
    return err(e instanceof Error ? e.message : String(e));
  }
});

function err(mensaje: string) {
  return new Response(JSON.stringify({ ok: false, error: mensaje }), {
    status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
