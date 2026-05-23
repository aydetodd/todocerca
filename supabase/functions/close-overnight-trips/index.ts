import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Devuelve la fecha de "hoy" en Hermosillo (UTC-7) como YYYY-MM-DD
function hermosilloToday(): string {
  const now = new Date();
  const hmoMs = now.getTime() - 7 * 60 * 60 * 1000;
  return new Date(hmoMs).toISOString().slice(0, 10);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const today = hermosilloToday();

    // 1) Traer viajes en curso cuya fecha sea anterior a hoy (Hermosillo)
    const { data: openTrips, error: selErr } = await supabase
      .from("viajes_realizados")
      .select("id, fecha, inicio_at")
      .eq("estado", "en_curso")
      .lt("fecha", today);

    if (selErr) throw selErr;

    const trips = openTrips || [];
    let closed = 0;

    for (const t of trips) {
      // fin_at = 23:59:59 (en UTC-7) del día de inicio
      const finIso = new Date(`${t.fecha}T23:59:59-07:00`).toISOString();
      const { error: updErr } = await supabase
        .from("viajes_realizados")
        .update({
          estado: "completado",
          fin_at: finIso,
          fin_manual: true,
          closed_overnight: true,
        })
        .eq("id", t.id);
      if (!updErr) closed++;
    }

    return new Response(
      JSON.stringify({ ok: true, today, scanned: trips.length, closed }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 },
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return new Response(JSON.stringify({ ok: false, error: msg }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
