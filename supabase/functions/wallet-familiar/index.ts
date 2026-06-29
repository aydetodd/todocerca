// Wallet Familiar QR — operaciones del titular
// Acciones: ensure_wallet, recargar (Stripe checkout), crear_sub_qr, asignar_saldo, cancelar_sub_qr
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const MIN_RECARGA = 200;

function genFolio(): string {
  // TC-XXXX-XX  (8 chars alfanuméricos sin confusos)
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let s = "";
  for (let i = 0; i < 8; i++) s += alphabet[Math.floor(Math.random() * alphabet.length)];
  return `TC-${s.slice(0, 4)}-${s.slice(4, 8)}`;
}

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
    const user = userData.user;
    if (!user) throw new Error("No autenticado");

    const body = await req.json();
    const action = body.action as string;

    // ---------- Ensure wallet ----------
    async function ensureWallet() {
      const { data: existing } = await admin
        .from("wallets_qr").select("*").eq("user_id", user!.id).maybeSingle();
      if (existing) return existing;
      const { data: nw } = await admin
        .from("wallets_qr").insert({ user_id: user!.id }).select("*").single();
      return nw;
    }

    if (action === "ensure_wallet") {
      const w = await ensureWallet();
      const { data: subs } = await admin
        .from("sub_qr_saldo").select("*")
        .eq("titular_user_id", user.id)
        .order("created_at", { ascending: false });
      return new Response(JSON.stringify({ wallet: w, sub_qrs: subs ?? [] }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ---------- Recargar (Stripe Checkout) ----------
    if (action === "recargar") {
      const monto = Number(body.monto_mxn);
      if (!monto || monto < MIN_RECARGA) {
        throw new Error(`Recarga mínima $${MIN_RECARGA} MXN`);
      }
      await ensureWallet();
      const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") || "", {
        apiVersion: "2025-08-27.basil",
      });

      const customers = await stripe.customers.list({ email: user.email, limit: 1 });
      const customerId = customers.data[0]?.id;

      const session = await stripe.checkout.sessions.create({
        customer: customerId,
        customer_email: customerId ? undefined : user.email!,
        line_items: [{
          price_data: {
            currency: "mxn",
            product_data: {
              name: `Recarga Wallet Familiar QR`,
              description: `Saldo recargable para crear QR de pasaje para tu familia.`,
            },
            unit_amount: Math.round(monto * 100),
          },
          quantity: 1,
        }],
        mode: "payment",
        success_url: `${req.headers.get("origin")}/wallet/familiar?recarga=success&monto=${monto}`,
        cancel_url: `${req.headers.get("origin")}/wallet/familiar?recarga=cancelled`,
        metadata: {
          type: "wallet_recarga",
          user_id: user.id,
          monto_mxn: String(monto),
        },
      });

      return new Response(JSON.stringify({ url: session.url }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ---------- Crear sub-QR ----------
    if (action === "crear_sub_qr") {
      const alias = String(body.alias || "").trim();
      const saldoInicial = Number(body.saldo_inicial || 0);
      const categoria = String(body.categoria || "normal");
      if (!alias) throw new Error("Falta el alias (ej. Mamá, Papá, Hijo)");
      if (saldoInicial < 0) throw new Error("Saldo inválido");

      const wallet = await ensureWallet();
      if (saldoInicial > Number(wallet.saldo_mxn)) {
        throw new Error(`Saldo insuficiente en wallet. Disponible: $${Number(wallet.saldo_mxn).toFixed(2)}`);
      }

      // Generar folio único
      let folio = genFolio();
      for (let i = 0; i < 5; i++) {
        const { data: dup } = await admin
          .from("sub_qr_saldo").select("id").eq("folio_corto", folio).maybeSingle();
        if (!dup) break;
        folio = genFolio();
      }

      const tokenQR = crypto.randomUUID();

      const { data: sub, error: subErr } = await admin
        .from("sub_qr_saldo")
        .insert({
          titular_user_id: user.id,
          wallet_id: wallet.id,
          token: tokenQR,
          folio_corto: folio,
          alias,
          saldo_mxn: saldoInicial,
          categoria,
        })
        .select("*").single();
      if (subErr) throw subErr;

      // Descontar del wallet si asignó saldo
      let nuevoSaldoWallet = Number(wallet.saldo_mxn);
      if (saldoInicial > 0) {
        nuevoSaldoWallet -= saldoInicial;
        await admin.from("wallets_qr")
          .update({ saldo_mxn: nuevoSaldoWallet })
          .eq("id", wallet.id);

        await admin.from("movimientos_wallet").insert({
          wallet_id: wallet.id,
          titular_user_id: user.id,
          sub_qr_id: sub.id,
          tipo: "asignacion",
          monto_mxn: saldoInicial,
          saldo_wallet_despues: nuevoSaldoWallet,
          saldo_sub_qr_despues: saldoInicial,
          descripcion: `Asignación inicial a ${alias}`,
        });
      }

      return new Response(JSON.stringify({ sub_qr: sub, saldo_wallet: nuevoSaldoWallet }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ---------- Asignar saldo extra ----------
    if (action === "asignar_saldo") {
      const subId = String(body.sub_qr_id);
      const monto = Number(body.monto_mxn);
      if (!subId || !monto || monto <= 0) throw new Error("Datos inválidos");

      const { data: sub } = await admin
        .from("sub_qr_saldo").select("*").eq("id", subId)
        .eq("titular_user_id", user.id).single();
      if (!sub) throw new Error("Sub-QR no encontrado");
      if (sub.estado !== "activo") throw new Error("Sub-QR no está activo");

      const wallet = await ensureWallet();
      if (monto > Number(wallet.saldo_mxn)) {
        throw new Error(`Saldo insuficiente. Disponible: $${Number(wallet.saldo_mxn).toFixed(2)}`);
      }

      const nuevoSaldoSub = Number(sub.saldo_mxn) + monto;
      const nuevoSaldoWallet = Number(wallet.saldo_mxn) - monto;

      await admin.from("sub_qr_saldo").update({ saldo_mxn: nuevoSaldoSub }).eq("id", subId);
      await admin.from("wallets_qr").update({ saldo_mxn: nuevoSaldoWallet }).eq("id", wallet.id);
      await admin.from("movimientos_wallet").insert({
        wallet_id: wallet.id,
        titular_user_id: user.id,
        sub_qr_id: subId,
        tipo: "asignacion",
        monto_mxn: monto,
        saldo_wallet_despues: nuevoSaldoWallet,
        saldo_sub_qr_despues: nuevoSaldoSub,
        descripcion: `Recarga manual a ${sub.alias}`,
      });

      return new Response(JSON.stringify({ ok: true, saldo_sub: nuevoSaldoSub, saldo_wallet: nuevoSaldoWallet }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ---------- Cancelar sub-QR (devuelve saldo SIEMPRE al titular) ----------
    if (action === "cancelar_sub_qr") {
      const subId = String(body.sub_qr_id);
      const motivo = String(body.motivo || "cancelado_por_titular");

      const { data: sub } = await admin
        .from("sub_qr_saldo").select("*").eq("id", subId)
        .eq("titular_user_id", user.id).single();
      if (!sub) throw new Error("Sub-QR no encontrado");
      if (sub.estado !== "activo") throw new Error("Ya está cancelado");

      const saldoRestante = Number(sub.saldo_mxn);

      await admin.from("sub_qr_saldo").update({
        estado: "cancelado",
        saldo_mxn: 0,
        cancelado_at: new Date().toISOString(),
        motivo_cancelacion: motivo,
      }).eq("id", subId);

      let nuevoSaldoWallet = 0;
      if (saldoRestante > 0) {
        const { data: w } = await admin
          .from("wallets_qr").select("*").eq("id", sub.wallet_id).single();
        nuevoSaldoWallet = Number(w!.saldo_mxn) + saldoRestante;
        await admin.from("wallets_qr").update({ saldo_mxn: nuevoSaldoWallet }).eq("id", sub.wallet_id);

        await admin.from("movimientos_wallet").insert({
          wallet_id: sub.wallet_id,
          titular_user_id: user.id,
          sub_qr_id: subId,
          tipo: "devolucion",
          monto_mxn: saldoRestante,
          saldo_wallet_despues: nuevoSaldoWallet,
          saldo_sub_qr_despues: 0,
          descripcion: `Cancelación de ${sub.alias}: saldo regresa al titular`,
        });
      }

      return new Response(JSON.stringify({ ok: true, saldo_devuelto: saldoRestante, saldo_wallet: nuevoSaldoWallet }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    throw new Error(`Acción desconocida: ${action}`);
  } catch (e) {
    console.error("[WALLET-FAMILIAR] Error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : String(e) }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
