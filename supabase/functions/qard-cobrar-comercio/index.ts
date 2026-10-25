// Merchant collections are atomic; transport scanners use separate functions.
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { z } from "npm:zod@3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const Schema = z.object({
  qard_number: z.string().regex(/^\d{16}$/),
  monto_mxn: z.number().finite().positive().refine(v => Math.abs(v * 100 - Math.round(v * 100)) < 0.00001),
  cvv: z.string().regex(/^\d{4}$/, "Se requiere CVV dinámico de 4 dígitos"),
  request_key: z.string().uuid(),
  terminal: z.boolean().optional().default(false),
});
const reply = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { ...corsHeaders, "Content-Type": "application/json" },
});
serve(async req => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return reply({ ok: false, mensaje: "Método no permitido" }, 405);
  try {
    const auth = req.headers.get("Authorization");
    if (!auth?.startsWith("Bearer ")) return reply({ ok: false, mensaje: "Inicia sesión" }, 401);
    const client = createClient(Deno.env.get("SUPABASE_URL") ?? "", Deno.env.get("SUPABASE_ANON_KEY") ?? "", {
      global: { headers: { Authorization: auth } },
    });
    const { data: { user }, error: authError } = await client.auth.getUser(auth.slice(7));
    if (authError || !user) return reply({ ok: false, mensaje: "Inicia sesión" }, 401);
    const parsed = Schema.safeParse(await req.json());
    if (!parsed.success) return reply({ ok: false, mensaje: "Revisa monto, QaRd y CVV dinámico de 4 dígitos", estado: "invalido" }, 400);
    const b = parsed.data;
    const { data, error } = await client.rpc("qard_collect_atomic", {
      _number: b.qard_number, _amount: b.monto_mxn, _cvv: b.cvv, _key: b.request_key, _terminal: b.terminal,
    });
    if (error) return reply({ ok: false, estado: "rechazado", mensaje: error.message, color: "rojo" });
    return reply(data);
  } catch {
    return reply({ ok: false, estado: "error", mensaje: "No se pudo completar; intenta de nuevo" }, 400);
  }
});
