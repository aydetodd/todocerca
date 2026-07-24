// QaRd — Retiro del saldo de cobros del comercio
// - oxxo / spei: simulados (pendiente STP)
// - qard: transferencia REAL a otra QaRd (16 díg), requiere CVV dinámico de 4 díg del destino
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

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

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) throw new Error("No autenticado");
    const token = authHeader.replace("Bearer ", "");
    const { data: userData } = await anon.auth.getUser(token);
    const user = userData.user;
    if (!user) throw new Error("No autenticado");

    const body = await req.json();
    const metodo = String(body.metodo || "").toLowerCase();
    const monto = Number(body.monto_mxn);
    const destino = String(body.destino || "").trim();
    const cvv = String(body.cvv || "").replace(/\D/g, "");

    if (!["oxxo", "spei", "qard"].includes(metodo)) return err("Método inválido");
    if (!monto || monto <= 0) return err("Monto inválido");
    if (monto < 20) return err("Monto mínimo $20");

    // Asegurar wallet del comercio (usa RPC, y si no existe la crea directo)
    try { await admin.rpc("qard_ensure_wallet", { _user_id: user.id }); } catch (_) {}
    let { data: wallet } = await admin
      .from("qard_wallets").select("id").eq("titular_user_id", user.id).maybeSingle();
    if (!wallet) {
      // Fallback: crear wallet mínima si el RPC falló
      const cvv4 = Array.from({ length: 4 }, () => Math.floor(Math.random() * 10)).join("");
      const ins = await admin.from("qard_wallets").insert({
        titular_user_id: user.id,
        cvv_dinamico: cvv4, saldo_mxn: 0, estado: "activa",
      }).select("id").single();
      if (ins.error) throw new Error(`No se pudo crear la billetera: ${ins.error.message}`);
      wallet = ins.data as any;
      if (!wallet) throw new Error("No se pudo crear la billetera");
    }

    // Disponible del comercio (cobros − retiros previos)
    const { data: movs } = await admin
      .from("qard_movimientos")
      .select("neto_comercio_mxn")
      .eq("comercio_user_id", user.id)
      .in("tipo", ["cobro_comercio", "retiro_oxxo", "retiro_spei", "retiro_qard"]);
    const disponible = (movs ?? []).reduce((s: number, r: any) => s + Number(r.neto_comercio_mxn ?? 0), 0);
    if (monto > disponible + 0.001) return err(`Saldo insuficiente. Disponible $${disponible.toFixed(2)}`);

    let descripcion = "";
    const metadata: Record<string, unknown> = { metodo };
    let referencia = "";

    if (metodo === "oxxo") {
      referencia = Array.from({ length: 14 }, () => Math.floor(Math.random() * 10)).join("");
      descripcion = `Retiro efectivo OXXO · ref ${referencia}`;
      metadata.simulado = true;
      metadata.referencia = referencia;
      metadata.vigencia_horas = 72;
    } else if (metodo === "spei") {
      let clabe = destino.replace(/\D/g, "");
      if (!clabe) {
        const { data: cc } = await admin
          .from("cuentas_conectadas").select("info_bancaria").eq("concesionario_id", user.id).maybeSingle();
        const ib: any = cc?.info_bancaria ?? {};
        clabe = String(ib?.clabe || ib?.last4 || "").replace(/\D/g, "");
      }
      if (!clabe || (clabe.length !== 18 && clabe.length !== 4)) {
        return err("Registra tu CLABE de cobros o proporciona una CLABE de 18 dígitos");
      }
      referencia = `SPEI${Date.now().toString().slice(-10)}`;
      descripcion = `Retiro SPEI a CLABE •••${clabe.slice(-4)} · ${referencia}`;
      metadata.simulado = true;
      metadata.clabe_last4 = clabe.slice(-4);
      metadata.referencia = referencia;
    } else if (metodo === "qard") {
      // Transferencia REAL a otra QaRd
      const d = destino.replace(/\D/g, "");
      if (d.length !== 16) return err("Ingresa los 16 dígitos de la QaRd destino");
      if (cvv.length !== 4) return err("Escribe el CVV dinámico de 4 dígitos del destino");

      // Buscar destino en sub_qr (índice 0 = principal, >0 = sub) — todos viven ahí por convención
      let toSubId: string | null = null;
      let toWalletId: string | null = null;
      let toSubIndex = 0;
      let toTitular: string | null = null;
      let toCvvDin: string | null = null;

      const { data: subRow } = await admin
        .from("qard_sub_qr")
        .select("id, wallet_id, sub_index, cvv_dinamico, qard_wallets!inner(id, titular_user_id)")
        .eq("qard_number", d)
        .maybeSingle();

      if (subRow) {
        toSubId = (subRow as any).id;
        toWalletId = (subRow as any).wallet_id;
        toSubIndex = (subRow as any).sub_index;
        toCvvDin = (subRow as any).cvv_dinamico;
        toTitular = (subRow as any).qard_wallets?.titular_user_id;
      } else {
        // fallback: buscar en wallets directamente (por si algún principal no tuviera fila sub_qr 00)
        const { data: wRow } = await admin
          .from("qard_wallets")
          .select("id, titular_user_id, cvv_dinamico")
          .eq("qard_number", d)
          .maybeSingle();
        if (!wRow) return err("La QaRd destino no existe");
        toWalletId = (wRow as any).id;
        toTitular = (wRow as any).titular_user_id;
        toCvvDin = (wRow as any).cvv_dinamico;
      }

      if (!toCvvDin || toCvvDin !== cvv) return err("CVV dinámico incorrecto");

      // Nuevo CVV de 4 dígitos
      const nuevoCvv = Array.from({ length: 4 }, () => Math.floor(Math.random() * 10)).join("");

      // Acreditar destino
      if (toSubIndex === 0 || !toSubId) {
        await admin.rpc("qard_wallet_credit" as any, { _wallet_id: toWalletId, _monto: monto }).catch(async () => {
          // fallback manual
          const { data: cur } = await admin.from("qard_wallets").select("saldo_mxn").eq("id", toWalletId).single();
          await admin.from("qard_wallets").update({ saldo_mxn: Number(cur?.saldo_mxn ?? 0) + monto, cvv_dinamico: nuevoCvv }).eq("id", toWalletId);
        });
        await admin.from("qard_wallets").update({ cvv_dinamico: nuevoCvv }).eq("id", toWalletId);
        if (toSubId) {
          await admin.from("qard_sub_qr").update({ cvv_dinamico: nuevoCvv }).eq("id", toSubId);
        }
      } else {
        const { data: curSub } = await admin.from("qard_sub_qr").select("saldo_mxn").eq("id", toSubId).single();
        await admin.from("qard_sub_qr")
          .update({ saldo_mxn: Number(curSub?.saldo_mxn ?? 0) + monto, cvv_dinamico: nuevoCvv })
          .eq("id", toSubId);
        const { data: curW } = await admin.from("qard_wallets").select("saldo_mxn").eq("id", toWalletId).single();
        await admin.from("qard_wallets").update({ saldo_mxn: Number(curW?.saldo_mxn ?? 0) + monto }).eq("id", toWalletId);
      }

      // Movimiento acreditación al receptor
      const { data: curW2 } = await admin.from("qard_wallets").select("saldo_mxn").eq("id", toWalletId).single();
      await admin.from("qard_movimientos").insert({
        wallet_id: toWalletId,
        titular_user_id: toTitular,
        sub_qr_id: toSubIndex === 0 ? null : toSubId,
        tipo: "transferencia_p2p_in",
        monto_mxn: monto,
        saldo_despues: Number(curW2?.saldo_mxn ?? 0),
        descripcion: `Transferencia recibida de cobros •••• ${d.slice(-4)}`,
        comercio_nombre: "Transferencia P2P",
      });

      // Aviso al receptor con el nuevo CVV
      await admin.from("messages").insert({
        sender_id: "00000000-0000-0000-0000-000000000001",
        receiver_id: toTitular,
        message: `💸 Recibiste una transferencia\n\nMonto: $${monto.toFixed(2)} MXN\nCuenta •••• ${d.slice(-4)}\n\n🔐 Nuevo CVV dinámico (4 díg): ${nuevoCvv}\n(Rota tras cada transferencia recibida. El CVV de 3 díg de compras NO cambia)`,
        is_read: false,
      });

      referencia = `QARD${Date.now().toString().slice(-10)}`;
      descripcion = `Transferencia a QaRd •••• ${d.slice(-4)} · ${referencia}`;
      metadata.destino_last4 = d.slice(-4);
      metadata.referencia = referencia;
    }

    const saldoDespues = +(disponible - monto).toFixed(2);

    const { error: insErr } = await admin.from("qard_movimientos").insert({
      wallet_id: wallet.id,
      titular_user_id: user.id,
      tipo: `retiro_${metodo}`,
      monto_mxn: monto,
      saldo_despues: saldoDespues,
      comercio_user_id: user.id,
      comision_mxn: 0,
      neto_comercio_mxn: -monto,
      descripcion,
      metadata,
    });
    if (insErr) throw insErr;

    return new Response(JSON.stringify({
      ok: true,
      mensaje: metodo === "oxxo"
        ? `Retiro en OXXO listo. Referencia ${referencia}`
        : metodo === "spei"
        ? `SPEI enviado. Referencia ${referencia}`
        : `Transferencia enviada. Referencia ${referencia}`,
      referencia,
      saldo_despues: saldoDespues,
      simulado: metodo !== "qard",
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    console.error("[QARD-RETIRAR]", e);
    return err(e instanceof Error ? e.message : String(e));
  }
});

function err(mensaje: string) {
  return new Response(JSON.stringify({ ok: false, error: mensaje }), {
    status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
