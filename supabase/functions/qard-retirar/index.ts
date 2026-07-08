// QaRd — Retiro simulado del saldo de cobros del comercio
// Métodos: oxxo (efectivo), spei (a cuenta bancaria registrada),
// qard (transferencia gratuita a otra QaRd por 16 dígitos o CLABE 18 dígitos).
// TODO: reemplazar simulación por integración STP cuando esté contratada.
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

    if (!["oxxo", "spei", "qard"].includes(metodo)) {
      return err("Método inválido");
    }
    if (!monto || monto <= 0) return err("Monto inválido");
    if (monto < 20) return err("Monto mínimo $20");

    // Asegurar wallet del comercio (para wallet_id NOT NULL)
    await admin.rpc("qard_ensure_wallet", { _user_id: user.id });
    const { data: wallet } = await admin
      .from("qard_wallets").select("id").eq("user_id", user.id).single();
    if (!wallet) throw new Error("Sin billetera");

    // Calcular saldo disponible de cobros (suma neto_comercio_mxn de sus cobros + retiros previos negativos)
    const { data: movs } = await admin
      .from("qard_movimientos")
      .select("neto_comercio_mxn, tipo")
      .eq("comercio_user_id", user.id)
      .in("tipo", ["cobro_comercio", "retiro_oxxo", "retiro_spei", "retiro_qard"]);
    const disponible = (movs ?? []).reduce((s: number, r: any) => s + Number(r.neto_comercio_mxn ?? 0), 0);

    if (monto > disponible + 0.001) {
      return err(`Saldo insuficiente. Disponible $${disponible.toFixed(2)}`);
    }

    // Validaciones por método
    let descripcion = "";
    let metadata: Record<string, unknown> = { simulado: true, metodo };
    let referencia = "";

    if (metodo === "oxxo") {
      // Genera referencia simulada de 14 dígitos
      referencia = Array.from({ length: 14 }, () => Math.floor(Math.random() * 10)).join("");
      descripcion = `Retiro efectivo OXXO · ref ${referencia}`;
      metadata.referencia = referencia;
      metadata.vigencia_horas = 72;
    } else if (metodo === "spei") {
      // Toma CLABE registrada del comercio (Stripe Connect info_bancaria) si no viene destino
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
      metadata.clabe_last4 = clabe.slice(-4);
      metadata.referencia = referencia;
    } else if (metodo === "qard") {
      const d = destino.replace(/\D/g, "");
      if (d.length !== 16 && d.length !== 18) {
        return err("Ingresa 16 dígitos de QaRd o 18 de CLABE");
      }
      referencia = `QARD${Date.now().toString().slice(-10)}`;
      descripcion = d.length === 16
        ? `Transferencia gratis a QaRd •••• ${d.slice(-4)} · ${referencia}`
        : `Transferencia gratis a CLABE •••${d.slice(-4)} · ${referencia}`;
      metadata.destino_last4 = d.slice(-4);
      metadata.destino_tipo = d.length === 16 ? "qard" : "clabe";
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
      neto_comercio_mxn: -monto, // negativo → descuenta del "Recibes"
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
      simulado: true,
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
