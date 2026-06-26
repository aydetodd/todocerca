// Cobro por tramo via QR. Lo llama Raspberry Pi o teléfono del chofer.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface Body {
  unidad_id: string;
  qr_token: string;
  lat: number;
  lng: number;
  fuente?: "telefono" | "raspberry";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const body = (await req.json()) as Body;
    if (!body?.unidad_id || !body?.qr_token || typeof body.lat !== "number" || typeof body.lng !== "number") {
      return new Response(JSON.stringify({ error: "unidad_id, qr_token, lat, lng requeridos" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supa = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data, error } = await supa.rpc("rpc_cobro_qr_scan", {
      _unidad_id: body.unidad_id,
      _qr_token: body.qr_token,
      _lat: body.lat,
      _lng: body.lng,
      _fuente: body.fuente || "telefono",
    });

    if (error) {
      return new Response(JSON.stringify({ error: error.message }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ ok: true, result: data }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
