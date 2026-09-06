// STP · Conciliación: compara el saldo real en STP contra la suma de las bóvedas digitales.
// Solo el administrador (o el cron con el secreto) puede ejecutarla.
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
};

const SYSTEM = "00000000-0000-0000-0000-000000000001";

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const anon = createClient(Deno.env.get("SUPABASE_URL") ?? "", Deno.env.get("SUPABASE_ANON_KEY") ?? "");
  const admin = createClient(Deno.env.get("SUPABASE_URL") ?? "", Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "");

  try {
    // Autorización: admin autenticado o llamada automática con el secreto del cron
    let autorizado = false;
    const cronSecret = req.headers.get("x-cron-secret");
    if (cronSecret) {
      const { data: cfg } = await admin.from("app_cron_secret").select("secret").maybeSingle();
      autorizado = !!cfg?.secret && cfg.secret === cronSecret;
    }
    if (!autorizado) {
      const authHeader = req.headers.get("Authorization");
      if (!authHeader?.startsWith("Bearer ")) throw new Error("No autenticado");
      const { data: userData } = await anon.auth.getUser(authHeader.replace("Bearer ", ""));
      const user = userData.user;
      if (!user) throw new Error("No autenticado");
      const { data: prof } = await admin
        .from("profiles").select("consecutive_number").eq("user_id", user.id).maybeSingle();
      autorizado = prof?.consecutive_number === 1;
    }
    if (!autorizado) throw new Error("Solo el administrador puede conciliar");

    // Suma de bóvedas digitales
    let sumaBovedas = 0;
    let desde = 0;
    while (true) {
      const { data: page } = await admin
        .from("qard_wallets").select("saldo_mxn").range(desde, desde + 999);
      if (!page || page.length === 0) break;
      sumaBovedas += page.reduce((a, r) => a + Number(r.saldo_mxn ?? 0), 0);
      if (page.length < 1000) break;
      desde += 1000;
    }

    // Saldo real en STP
    const base = Deno.env.get("STP_BASE_URL");
    const token = Deno.env.get("STP_API_TOKEN");
    const clabe = Deno.env.get("STP_CLABE_MAESTRA");
    let saldoStp: number | null = null;
    let detalleStp: unknown = null;

    if (base && token && clabe) {
      try {
        const r = await fetch(`${base.replace(/\/$/, "")}/speiws/rest/saldo/consulta?cuenta=${clabe}`, {
          headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        });
        detalleStp = await r.json().catch(() => null);
        const d = detalleStp as Record<string, unknown> | null;
        const val = d?.saldo ?? d?.balance ?? (d?.resultado as Record<string, unknown>)?.saldo;
        if (val !== undefined && val !== null) saldoStp = Number(val);
      } catch (e) {
        console.error("[STP-CONCILIAR] consulta saldo", e);
      }
    }

    const diferencia = saldoStp === null ? null : Number((saldoStp - sumaBovedas).toFixed(2));

    await admin.from("stp_config").update({
      stp_balance: saldoStp ?? 0,
      last_reconciliation: new Date().toISOString(),
    }).eq("id", true);

    if (diferencia !== null && Math.abs(diferencia) >= 1) {
      const { data: adminProf } = await admin
        .from("profiles").select("user_id").eq("consecutive_number", 1).maybeSingle();
      if (adminProf?.user_id) {
        await admin.from("messages").insert({
          sender_id: SYSTEM,
          receiver_id: adminProf.user_id,
          message: `⚠️ Conciliación QaRd: diferencia de $${diferencia.toFixed(2)}.\nSaldo en STP: $${saldoStp!.toFixed(2)}\nSuma de bóvedas: $${sumaBovedas.toFixed(2)}`,
          is_panic: false,
          is_read: false,
        });
      }
    }

    return new Response(JSON.stringify({
      ok: true,
      saldo_stp: saldoStp,
      suma_bovedas: Number(sumaBovedas.toFixed(2)),
      diferencia,
      pendiente_configuracion: !(base && token && clabe),
      detalle_stp: detalleStp,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    console.error("[STP-CONCILIAR]", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : String(e) }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
