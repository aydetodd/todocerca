import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { createClient } from "npm:@supabase/supabase-js@2";

// Consulta pública de saldo SOLO con el código secreto del QR impreso.
// action "token" (con sesión): genera el código de las tarjetas del propio usuario.
// action "consultar" (sin sesión): devuelve únicamente el saldo. Nunca nombre ni CVV.

const URL_ = Deno.env.get("SUPABASE_URL")!;
const SRK = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const enc = new TextEncoder();

const b64u = (b: Uint8Array) => btoa(String.fromCharCode(...b)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const fromB64u = (s: string) => atob(s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4));

async function firma(num: string) {
  const key = await crypto.subtle.importKey("raw", enc.encode("qard-saldo:" + SRK), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", key, enc.encode(num)));
  return b64u(sig.slice(0, 16));
}
const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const body = await req.json().catch(() => ({}));
    const admin = createClient(URL_, SRK);

    if (body.action === "token") {
      const auth = req.headers.get("Authorization") ?? "";
      const { data: { user } } = await admin.auth.getUser(auth.replace("Bearer ", ""));
      if (!user) return json({ error: "Inicia sesión" }, 401);
      const nums: string[] = Array.isArray(body.numeros) ? body.numeros.map((n: unknown) => String(n).replace(/\D/g, "")).filter((n: string) => n.length === 16).slice(0, 100) : [];
      const [{ data: prof }, { data: subs }] = await Promise.all([
        admin.from("profiles").select("qard_number").eq("user_id", user.id).maybeSingle(),
        admin.from("qard_sub_qr").select("qard_number").eq("titular_user_id", user.id),
      ]);
      const mios = new Set([prof?.qard_number, ...(subs ?? []).map((s) => s.qard_number)].filter(Boolean));
      const tokens: Record<string, string> = {};
      for (const n of nums) if (mios.has(n)) tokens[n] = `${b64u(enc.encode(n))}.${await firma(n)}`;
      return json({ tokens });
    }

    if (body.action === "consultar") {
      const t = String(body.token ?? "");
      if (t.length > 80 || !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(t)) return json({ error: "Código no válido" }, 400);
      const [a, s] = t.split(".");
      let num = "";
      try { num = fromB64u(a); } catch { return json({ error: "Código no válido" }, 400); }
      if (!/^\d{16}$/.test(num) || (await firma(num)) !== s) return json({ error: "Código no válido" }, 400);

      const { data: sub } = await admin.from("qard_sub_qr").select("saldo_mxn, sub_index, wallet_id").eq("qard_number", num).maybeSingle();
      let saldo: number | null = null;
      if (sub && sub.sub_index !== 0) saldo = Number(sub.saldo_mxn ?? 0);
      else {
        const { data: prof } = await admin.from("profiles").select("user_id").eq("qard_number", num).maybeSingle();
        const uid = prof?.user_id;
        if (uid) {
          const { data: w } = await admin.from("qard_wallets").select("saldo_mxn").eq("titular_user_id", uid).maybeSingle();
          saldo = Number(w?.saldo_mxn ?? 0);
        } else if (sub?.wallet_id) {
          const { data: w } = await admin.from("qard_wallets").select("saldo_mxn").eq("id", sub.wallet_id).maybeSingle();
          saldo = Number(w?.saldo_mxn ?? 0);
        }
      }
      if (saldo === null) return json({ error: "Tarjeta no encontrada" }, 404);
      return json({ saldo, terminacion: num.slice(-4) });
    }
    return json({ error: "Acción no válida" }, 400);
  } catch (_e) {
    return json({ error: "No se pudo completar en este momento; intenta de nuevo" }, 500);
  }
});
