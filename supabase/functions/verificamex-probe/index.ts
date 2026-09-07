// Sonda temporal: descubre la ruta correcta de OCR de INE en Verificamex
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const RUTAS = [
  "/v1/ocr/ine-obverse",
  "/v1/ocr/ine/obverse",
  "/v1/ocr/ine-front",
  "/v1/ocr/ine-anverso",
  "/v1/ocr/ine",
  "/v1/ocr/ine-obverse/",
  "/v1/ine/ocr-obverse",
  "/v1/ine/obverse",
  "/api/v1/ocr/ine-obverse",
  "/v1/scraping/renapo",
];

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const base = Deno.env.get("VERIFICAMEX_BASE_URL") ?? "https://api.verificamex.com";
  const token = Deno.env.get("VERIFICAMEX_BEARER_TOKEN");
  const out: unknown[] = [];
  for (const ruta of RUTAS) {
    try {
      const res = await fetch(`${base}${ruta}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ image: "" }),
      });
      const texto = (await res.text()).slice(0, 300);
      out.push({ ruta, status: res.status, texto });
    } catch (e) {
      out.push({ ruta, error: String((e as Error).message) });
    }
  }
  return new Response(JSON.stringify(out, null, 2), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
