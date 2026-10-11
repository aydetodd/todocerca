import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { createClient } from "npm:@supabase/supabase-js@2";

// Consultar saldo / movimientos / bloquear CUALQUIER QaRd desde cualquier teléfono con sesión en TodoCerca.
// Siempre exige número de 16 dígitos + CVV de 3 dígitos (el de compras).
// Candado: 5 CVV equivocados en 1 hora sobre la misma tarjeta la congelan para consultas.

const URL_ = Deno.env.get("SUPABASE_URL")!;
const SRK = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SYSTEM = "00000000-0000-0000-0000-000000000001";
const MAX_FALLOS = 5;

const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const admin = createClient(URL_, SRK);
    const auth = req.headers.get("Authorization") ?? "";
    const { data: { user } } = await admin.auth.getUser(auth.replace("Bearer ", ""));
    if (!user) return json({ error: "Inicia sesión en TodoCerca para usar esta opción" }, 401);

    const body = await req.json().catch(() => ({}));
    const accion = String(body.action ?? "");
    const num = String(body.qard_number ?? "").replace(/\D/g, "");
    const cvv = String(body.cvv ?? "").replace(/\D/g, "");
    if (!["saldo", "movimientos", "bloquear"].includes(accion)) return json({ error: "Acción no válida" }, 400);
    if (num.length !== 16 || cvv.length !== 3) return json({ error: "Revisa los 16 dígitos y los 3 del CVV" }, 400);

    // Límite por teléfono (anti-abuso): 20 intentos por 10 min
    const { data: okUser } = await admin.rpc("qard_rate_limit_check", { _user_id: user.id, _accion: "qard_consulta_cvv", _max: 20, _ventana_seg: 600 });
    if (okUser === false) return json({ error: "Demasiados intentos. Espera 10 minutos." }, 429);

    const { data: sub } = await admin.from("qard_sub_qr")
      .select("id, wallet_id, titular_user_id, sub_index, estado, saldo_mxn, alias")
      .eq("qard_number", num).maybeSingle();
    if (!sub) return json({ error: "Número o CVV incorrecto" }, 400);

    const desde = new Date(Date.now() - 3600_000).toISOString();
    const { count } = await admin.from("rate_limit_hits").select("id", { count: "exact", head: true })
      .eq("user_id", sub.id).eq("accion", "cvv_fallo").gte("created_at", desde);
    if ((count ?? 0) >= MAX_FALLOS) return json({ error: "Esta QaRd tuvo muchos CVV equivocados. Intenta en 1 hora." }, 429);

    const { data: cvvOk } = await admin.rpc("qard_cvv_verificar", { _qard_number: num, _cvv: cvv, _tipo: "estatico" });
    if (!cvvOk) {
      await admin.from("rate_limit_hits").insert({ user_id: sub.id, accion: "cvv_fallo" });
      return json({ error: "Número o CVV incorrecto" }, 400);
    }

    const esMia = sub.titular_user_id === user.id;
    const terminacion = num.slice(-4);

    if (accion === "saldo") {
      let saldo = Number(sub.saldo_mxn ?? 0);
      if (sub.sub_index === 0) {
        const { data: w } = await admin.from("qard_wallets").select("saldo_mxn").eq("id", sub.wallet_id).maybeSingle();
        saldo = Number(w?.saldo_mxn ?? 0);
      }
      return json({ saldo, terminacion, estado: sub.estado, es_mia: esMia, sub_id: esMia ? sub.id : null });
    }

    if (accion === "movimientos") {
      const d = body.desde ? new Date(String(body.desde) + "T00:00:00-07:00") : new Date(Date.now() - 30 * 86400_000);
      const h = body.hasta ? new Date(String(body.hasta) + "T23:59:59-07:00") : new Date();
      let q = admin.from("qard_movimientos")
        .select("id, tipo, monto_mxn, direccion, ambito, comercio_nombre, created_at")
        .gte("created_at", d.toISOString()).lte("created_at", h.toISOString())
        .order("created_at", { ascending: false }).limit(300);
      q = sub.sub_index === 0
        ? q.eq("wallet_id", sub.wallet_id).eq("ambito", "eje")
        : q.eq("sub_qr_id", sub.id).eq("ambito", "sub_qr");
      const { data: movs } = await q;
      return json({ terminacion, movimientos: movs ?? [] });
    }

    // bloquear
    if (sub.estado === "cancelada") return json({ error: "Esta QaRd ya está cancelada" }, 400);
    if (sub.estado !== "apagada") {
      await admin.from("qard_sub_qr").update({ estado: "apagada", updated_at: new Date().toISOString() }).eq("id", sub.id);
    }
    try {
      await admin.from("messages").insert({
        sender_id: SYSTEM, receiver_id: sub.titular_user_id, is_panic: false, is_read: false,
        message: `🔒 Tu QaRd terminación ${terminacion} fue BLOQUEADA desde ${esMia ? "tu teléfono" : "otro teléfono"}. Ya no puede pagar. Para desbloquearla entra a QaRd → Consultar y bloquear, o enciéndela en tu QaRd.`,
      });
    } catch { /* aviso opcional */ }
    return json({ ok: true, terminacion, es_mia: esMia, sub_id: esMia ? sub.id : null });
  } catch (_e) {
    return json({ error: "No se pudo completar en este momento; intenta de nuevo" }, 500);
  }
});
