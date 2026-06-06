// Edge function que recibe eventos del ESP32 con sensores infrarrojos.
// Autenticación: MAC del dispositivo + (token MD5 con timestamp) o secreto plano (legacy).
// Body nuevo (recomendado):
//   { "mac": "AA:BB:CC:DD:EE:FF", "timestamp": 123456, "token": "md5(secret+timestamp)", "evento": "sube"|"baja", "puerta": "frente"|"atras" }
// Body legacy:
//   { "mac": "...", "secret": "...", "evento": "...", "puerta": "..." }

import { createClient } from "npm:@supabase/supabase-js@2";
import { createHash } from "node:crypto";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// Ventana de validez del timestamp del ESP32 (5 min). El ESP32 manda millis() desde boot,
// así que no comparamos contra "ahora" — solo evitamos reusar tokens repetidos (cache simple).
const TOKEN_CACHE = new Map<string, number>();
const TOKEN_TTL_MS = 5 * 60 * 1000;

function md5(s: string) {
  return createHash("md5").update(s).digest("hex");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const body = await req.json().catch(() => null);
    if (!body) return json({ error: "invalid_body" }, 400);

    const mac = String(body.mac ?? "").trim().toLowerCase();
    const evento = String(body.evento ?? "");
    const puerta = String(body.puerta ?? "");
    const lat = typeof body.lat === "number" ? body.lat : null;
    const lng = typeof body.lng === "number" ? body.lng : null;

    const ocurridoEnRaw = body.ocurrido_en ? new Date(body.ocurrido_en) : null;
    const ocurridoEn = ocurridoEnRaw && !isNaN(ocurridoEnRaw.getTime())
      ? ocurridoEnRaw.toISOString()
      : new Date().toISOString();

    if (!mac) return json({ error: "missing_mac" }, 400);
    if (!["sube", "baja", "falla_sensor"].includes(evento)) return json({ error: "invalid_evento" }, 400);
    if (!["frente", "atras"].includes(puerta)) return json({ error: "invalid_puerta" }, 400);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // 1) Localizar unidad por MAC
    const { data: unidad, error: uErr } = await supabase
      .from("unidades_empresa")
      .select("id, proveedor_id, esp32_secret, is_active")
      .ilike("esp32_mac", mac)
      .maybeSingle();

    if (uErr) return json({ error: "db_error", detail: uErr.message }, 500);
    if (!unidad) return json({ error: "unit_not_found" }, 404);
    if (!unidad.is_active) return json({ error: "unit_inactive" }, 403);
    if (!unidad.esp32_secret) return json({ error: "no_secret_configured" }, 401);

    // 2) Autenticación: token MD5 nuevo o secret plano legacy
    const incomingToken = typeof body.token === "string" ? body.token.toLowerCase() : null;
    const incomingTs = typeof body.timestamp === "number" ? body.timestamp : null;
    const incomingSecret = typeof body.secret === "string" ? body.secret : null;

    let authed = false;
    if (incomingToken && incomingTs !== null) {
      // Modo seguro: token = md5(secret + timestamp)
      const expected = md5(`${unidad.esp32_secret}${incomingTs}`).toLowerCase();
      if (expected === incomingToken) {
        // Anti-replay: rechazar el mismo (mac+token) si ya lo vimos
        const cacheKey = `${mac}:${incomingToken}`;
        const seenAt = TOKEN_CACHE.get(cacheKey);
        if (seenAt && Date.now() - seenAt < TOKEN_TTL_MS) {
          return json({ error: "replay" }, 401);
        }
        TOKEN_CACHE.set(cacheKey, Date.now());
        // Limpieza ocasional
        if (TOKEN_CACHE.size > 500) {
          const cutoff = Date.now() - TOKEN_TTL_MS;
          for (const [k, t] of TOKEN_CACHE) if (t < cutoff) TOKEN_CACHE.delete(k);
        }
        authed = true;
      }
    } else if (incomingSecret && incomingSecret === unidad.esp32_secret) {
      // Modo legacy
      authed = true;
    }

    if (!authed) return json({ error: "bad_credentials" }, 401);

    // 3) Buscar viaje en curso de esa unidad
    const { data: viaje } = await supabase
      .from("viajes_realizados")
      .select("id, pasajeros_subidos, pasajeros_bajados, pasajeros_a_bordo, chofer_id")
      .eq("unidad_id", unidad.id)
      .eq("estado", "en_curso")
      .order("inicio_at", { ascending: false, nullsFirst: false })
      .limit(1)
      .maybeSingle();

    // 4) Si el ESP32 no mandó coordenadas, sacarlas del teléfono del chofer
    let finalLat = lat;
    let finalLng = lng;
    if ((finalLat === null || finalLng === null) && viaje?.chofer_id) {
      const { data: chofer } = await supabase
        .from("choferes_empresa")
        .select("user_id")
        .eq("id", viaje.chofer_id)
        .maybeSingle();
      if (chofer?.user_id) {
        const { data: loc } = await supabase
          .from("proveedor_locations")
          .select("latitude, longitude, updated_at")
          .eq("user_id", chofer.user_id)
          .maybeSingle();
        if (loc?.latitude && loc?.longitude && loc.updated_at) {
          const ageMs = Date.now() - new Date(loc.updated_at).getTime();
          if (ageMs < 2 * 60 * 1000) {
            finalLat = loc.latitude;
            finalLng = loc.longitude;
          }
        }
      }
    }

    // 5) Bitácora
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

    // 5.b) Falla de sensor reportada directamente por el ESP32.
    // El firmware sabe cuándo el sensor 1 (de presencia) dispara y el sensor 2
    // (de conteo) NO responde en esa misma puerta dentro de su ventana.
    // Cuando eso pasa repetidamente, el ESP32 manda evento "falla_sensor"
    // con la puerta afectada. Aquí solo guardamos la alerta y avisamos al dueño.
    if (evento === "falla_sensor") {
      try {
        // Cooldown: una alerta por puerta por hora para no saturar.
        const haceUnaHora = new Date(Date.now() - 60 * 60 * 1000).toISOString();
        const { data: ultimaAlerta } = await supabase
          .from("conteo_pasajeros_alertas")
          .select("id")
          .eq("unidad_id", unidad.id)
          .eq("puerta_muda", puerta)
          .gte("created_at", haceUnaHora)
          .limit(1)
          .maybeSingle();

        if (!ultimaAlerta) {
          const { data: prov } = await supabase
            .from("proveedores")
            .select("user_id")
            .eq("id", unidad.proveedor_id)
            .maybeSingle();

          const { data: uInfo } = await supabase
            .from("unidades_empresa")
            .select("nombre, placas")
            .eq("id", unidad.id)
            .maybeSingle();

          const nombreUnidad = (uInfo as any)?.nombre || (uInfo as any)?.placas || "tu unidad";
          const puertaTxt = puerta === "frente" ? "frente" : "atrás";

          const mensaje =
            `⚠️ Falla de sensor en ${nombreUnidad}.\n\n` +
            `En la puerta de ${puertaTxt}, el primer sensor detecta personas pero el segundo (el que cuenta) no responde. ` +
            `Probablemente está tapado, sucio o dañado.\n\n` +
            `Pídele al chofer que limpie o revise el sensor infrarrojo de conteo de esa puerta.`;

          const systemUserId = "00000000-0000-0000-0000-000000000001";
          if (prov?.user_id) {
            await supabase.from("messages").insert({
              sender_id: systemUserId,
              receiver_id: prov.user_id,
              message: mensaje,
              is_panic: false,
              is_read: false,
            });
          }

          await supabase.from("conteo_pasajeros_alertas").insert({
            unidad_id: unidad.id,
            proveedor_id: unidad.proveedor_id,
            puerta_muda: puerta,
            eventos_ventana: 0,
          });
        }
      } catch (e) {
        console.warn("falla_sensor_handling_failed", String(e));
      }

      return json({ ok: true, alerta: "falla_sensor_registrada", puerta });
    }


    // 6) Actualizar contadores del viaje activo
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
