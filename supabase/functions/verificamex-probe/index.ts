// Sonda temporal
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
const corsHeaders = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type" };
const CASOS: [string, Record<string, unknown>][] = [
  ["/v1/scraping/ine", {}],
  ["/v1/scraping/ine", { claveElector: "VLNCMR68030126H700" }],
  ["/v1/scraping/ine", { cic: "123456789", identificadorCiudadano: "123456789" }],
  ["/v1/scraping/ine", { image: "abc" }],
  ["/v1/scraping/renapo", {}],
];
serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const base = Deno.env.get("VERIFICAMEX_BASE_URL") ?? "https://api.verificamex.com";
  const token = Deno.env.get("VERIFICAMEX_BEARER_TOKEN");
  const out: unknown[] = [];
  for (const [ruta, body] of CASOS) {
    const res = await fetch(`${base}${ruta}`, { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify(body) });
    out.push({ ruta, body, status: res.status, texto: (await res.text()).slice(0, 400) });
  }
  return new Response(JSON.stringify(out, null, 2), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
});
