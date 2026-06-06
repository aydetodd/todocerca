// Edge function que recibe eventos del ESP32 con sensores infrarrojos.
// Autenticación: MAC del dispositivo + secreto compartido guardado en unidades_empresa.
// Body esperado:
// { "mac": "AA:BB:CC:DD:EE:FF", "secret": "xxxxx", "evento": "sube"|"baja", "puerta": "frente"|"atras" }

import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const body = await req.json().catch(() => null);
    if (!body) return json({ error: "invalid_body" }, 400);

    const mac = String(body.mac ?? "").trim().toLowerCase();
    const secret = String(body.secret ?? "");
    const evento = String(body.evento ?? "");
    const puerta = String(body.puerta ?? "");
    const lat = typeof body.lat === "number" ? body.lat : null;
    const lng = typeof body.lng === "number" ? body.lng : null;
    const ocurridoEnRaw = body.ocurrido_en ? new Date(body.ocurrido_en) : null;
    const ocurridoEn = ocurridoEnRaw && !isNaN(ocurridoEnRaw.getTime())
      ? ocurridoEnRaw.toISOString()
      : new Date().toISOString();

    if (!mac || !secret) return json({ error: "missing_credentials" }, 400);
    if (!["sube", "baja"].includes(evento)) return json({ error: "invalid_evento" }, 400);
    if (!["frente", "atras"].includes(puerta)) return json({ error: "invalid_puerta" }, 400);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // 1) Localizar unidad por MAC y validar secreto
    const { data: unidad, error: uErr } = await supabase
      .from("unidades_empresa")
      .select("id, proveedor_id, esp32_secret, is_active")
      .ilike("esp32_mac", mac)
      .maybeSingle();

    if (uErr) return json({ error: "db_error", detail: uErr.message }, 500);
    if (!unidad) return json({ error: "unit_not_found" }, 404);
    if (!unidad.is_active) return json({ error: "unit_inactive" }, 403);
    if (!unidad.esp32_secret || unidad.esp32_secret !== secret) {
      return json({ error: "bad_secret" }, 401);
    }

    // 2) Buscar viaje en curso de esa unidad (el más reciente)
    const { data: viaje } = await supabase
      .from("viajes_realizados")
      .select("id, pasajeros_subidos, pasajeros_bajados, pasajeros_a_bordo, chofer_user_id")
      .eq("unidad_id", unidad.id)
      .eq("estado", "en_curso")
      .order("inicio_at", { ascending: false, nullsFirst: false })
      .limit(1)
      .maybeSingle();

    // 2.5) Si el ESP32 no mandó coordenadas, intentamos sacar las del teléfono del chofer.
    //      Así el mapa de calor sale gratis aunque el ESP32 no tenga GPS.
    let finalLat = lat;
    let finalLng = lng;
    if ((finalLat === null || finalLng === null) && viaje?.chofer_user_id) {
      const { data: loc } = await supabase
        .from("proveedor_locations")
        .select("latitude, longitude, updated_at")
        .eq("user_id", viaje.chofer_user_id)
        .maybeSingle();
      // Solo usamos si la ubicación es fresca (< 2 min)
      if (loc?.latitude && loc?.longitude && loc.updated_at) {
        const ageMs = Date.now() - new Date(loc.updated_at).getTime();
        if (ageMs < 2 * 60 * 1000) {
          finalLat = loc.latitude;
          finalLng = loc.longitude;
        }
      }
    }

    // 3) Insertar evento en la bitácora (aunque no haya viaje activo)
    await supabase.from("conteo_pasajeros_eventos").insert({
      viaje_id: viaje?.id ?? null,
      unidad_id: unidad.id,
      esp32_mac: mac,
      puerta,
      evento,
      lat: finalLat,
      lng: finalLng,
      ocurrido_en: ocurridoEn,
    });


    // 4) Actualizar contadores del viaje activo
    if (viaje) {
      const subidos = (viaje.pasajeros_subidos ?? 0) + (evento === "sube" ? 1 : 0);
      const bajados = (viaje.pasajeros_bajados ?? 0) + (evento === "baja" ? 1 : 0);
      const aBordo = Math.max(0, subidos - bajados);

      await supabase
        .from("viajes_realizados")
        .update({
          pasajeros_subidos: subidos,
          pasajeros_bajados: bajados,
          pasajeros_a_bordo: aBordo,
        })
        .eq("id", viaje.id);

      return json({ ok: true, viaje_id: viaje.id, subidos, bajados, a_bordo: aBordo });
    }

    return json({ ok: true, viaje_id: null, note: "evento_registrado_sin_viaje_activo" });
  } catch (e) {
    return json({ error: "unexpected", detail: String(e) }, 500);
  }
});

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
