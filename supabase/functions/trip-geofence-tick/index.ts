// Trip geofence tick: recibe {unidad_id, lat, lng} del chofer y abre/cierra viajes
// automáticamente al cruzar los waypoints ordenados configurados por el concesionario.
// Soporta secuencias ilimitadas: A → B → C → D → …
// Cierra el viaje al tocar el último waypoint y abre el siguiente ciclo empezando en el waypoint 1.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

interface Body {
  unidad_id: string;
  lat: number;
  lng: number;
}

interface Waypoint {
  orden: number;
  label: string;
  lat: number;
  lng: number;
  radio_m: number;
}

function haversineMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000;
  const toRad = (x: number) => (x * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

// Hermosillo (UTC-7) → YYYY-MM-DD
function getHermosilloToday(): string {
  const now = new Date();
  const hmsl = new Date(now.getTime() - 7 * 60 * 60 * 1000);
  return hmsl.toISOString().slice(0, 10);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization") || "";
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const callerClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: { user } } = await callerClient.auth.getUser();
    if (!user) {
      return new Response(JSON.stringify({ error: "unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = (await req.json()) as Body;
    if (!body?.unidad_id || typeof body.lat !== "number" || typeof body.lng !== "number") {
      return new Response(JSON.stringify({ error: "bad_request" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 1. Unidad
    const { data: unidad } = await supabase
      .from("unidades_empresa")
      .select("id, proveedor_id, viaje_tipo")
      .eq("id", body.unidad_id)
      .maybeSingle();

    if (!unidad) {
      return new Response(JSON.stringify({ skipped: true, reason: "no_unit" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 2. Waypoints ordenados
    const { data: waypointsRaw } = await supabase
      .from("unidad_viaje_waypoints")
      .select("orden, label, lat, lng, radio_m")
      .eq("unidad_id", body.unidad_id)
      .order("orden", { ascending: true });

    const waypoints: Waypoint[] = (waypointsRaw || []).map((w: any) => ({
      orden: w.orden,
      label: w.label,
      lat: Number(w.lat),
      lng: Number(w.lng),
      radio_m: Number(w.radio_m || 150),
    }));

    if (waypoints.length < 2) {
      return new Response(JSON.stringify({ skipped: true, reason: "no_waypoints" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const today = getHermosilloToday();

    // 3. Chofer + asignación
    const { data: chofer } = await supabase
      .from("choferes_empresa")
      .select("id, proveedor_id")
      .eq("user_id", user.id)
      .eq("is_active", true)
      .eq("proveedor_id", unidad.proveedor_id)
      .maybeSingle();

    if (!chofer) {
      return new Response(JSON.stringify({ skipped: true, reason: "no_driver" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: asignacion } = await supabase
      .from("asignaciones_chofer")
      .select("producto_id")
      .eq("chofer_id", chofer.id)
      .eq("unidad_id", body.unidad_id)
      .eq("fecha", today)
      .maybeSingle();
    const productoId = asignacion?.producto_id || null;

    // 4. Viaje abierto actual
    const { data: viajeAbierto } = await supabase
      .from("viajes_realizados")
      .select("id, numero_viaje, waypoint_orden_actual, direccion, pasajeros_subidos")
      .eq("unidad_id", body.unidad_id)
      .eq("chofer_id", chofer.id)
      .eq("fecha", today)
      .eq("estado", "en_curso")
      .order("inicio_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const insideOf = (w: Waypoint) =>
      haversineMeters(body.lat, body.lng, w.lat, w.lng) <= w.radio_m;

    // Sin viaje abierto → si está dentro del waypoint 1, abrir viaje.
    if (!viajeAbierto) {
      const wp1 = waypoints[0];
      if (!insideOf(wp1)) {
        return new Response(
          JSON.stringify({ action: "noop", reason: "esperando_wp1", label: wp1.label }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      const { data: ultimoNum } = await supabase
        .from("viajes_realizados")
        .select("numero_viaje")
        .eq("chofer_id", chofer.id)
        .eq("fecha", today)
        .order("numero_viaje", { ascending: false })
        .limit(1)
        .maybeSingle();
      const proximoNum = (ultimoNum?.numero_viaje || 0) + 1;

      const { data: nuevo } = await supabase
        .from("viajes_realizados")
        .insert({
          chofer_id: chofer.id,
          unidad_id: body.unidad_id,
          producto_id: productoId,
          fecha: today,
          numero_viaje: proximoNum,
          inicio_at: new Date().toISOString(),
          inicio_lat: wp1.lat,
          inicio_lng: wp1.lng,
          inicio_manual: false,
          estado: "en_curso",
          origen: wp1.label,
          destino: waypoints[waypoints.length - 1].label,
          direccion: "AB",
          waypoint_orden_actual: 2,
        })
        .select("id")
        .single();

      return new Response(
        JSON.stringify({
          action: "opened",
          trip_id: nuevo?.id,
          proximo_orden: 2,
          proximo_label: waypoints[1].label,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Con viaje abierto → revisar si entró al waypoint que estaba esperando
    const proxOrden = viajeAbierto.waypoint_orden_actual || 2;
    const proximoWp = waypoints.find((w) => w.orden === proxOrden);

    if (!proximoWp) {
      // Waypoint fuera de rango (config cambió) → cerrar viaje sin avance
      return new Response(
        JSON.stringify({ action: "noop", reason: "wp_no_existe", orden: proxOrden }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    if (!insideOf(proximoWp)) {
      const distancia = Math.round(
        haversineMeters(body.lat, body.lng, proximoWp.lat, proximoWp.lng),
      );
      return new Response(
        JSON.stringify({
          action: "noop",
          proximo_orden: proxOrden,
          proximo_label: proximoWp.label,
          distancia_m: distancia,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Cruzó el waypoint esperado
    const esUltimo = proxOrden >= waypoints.length;

    if (!esUltimo) {
      // Parada intermedia → solo avanzar contador
      await supabase
        .from("viajes_realizados")
        .update({ waypoint_orden_actual: proxOrden + 1 })
        .eq("id", viajeAbierto.id);

      return new Response(
        JSON.stringify({
          action: "advanced",
          trip_id: viajeAbierto.id,
          cruzo_label: proximoWp.label,
          proximo_orden: proxOrden + 1,
          proximo_label: waypoints[proxOrden]?.label || "",
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Último waypoint → cerrar viaje y abrir siguiente ciclo desde wp1
    await supabase
      .from("viajes_realizados")
      .update({
        estado: "completado",
        fin_at: new Date().toISOString(),
        fin_lat: proximoWp.lat,
        fin_lng: proximoWp.lng,
        fin_manual: false,
      })
      .eq("id", viajeAbierto.id);

    // Abrir siguiente ciclo (empieza en wp1 y espera wp2)
    const wp1 = waypoints[0];
    const { data: ultimoNum } = await supabase
      .from("viajes_realizados")
      .select("numero_viaje")
      .eq("chofer_id", chofer.id)
      .eq("fecha", today)
      .order("numero_viaje", { ascending: false })
      .limit(1)
      .maybeSingle();
    const proximoNum = (ultimoNum?.numero_viaje || 0) + 1;

    const { data: nuevo } = await supabase
      .from("viajes_realizados")
      .insert({
        chofer_id: chofer.id,
        unidad_id: body.unidad_id,
        producto_id: productoId,
        fecha: today,
        numero_viaje: proximoNum,
        inicio_at: new Date().toISOString(),
        inicio_lat: wp1.lat,
        inicio_lng: wp1.lng,
        inicio_manual: false,
        estado: "en_curso",
        origen: wp1.label,
        destino: waypoints[waypoints.length - 1].label,
        direccion: "AB",
        waypoint_orden_actual: 2,
      })
      .select("id")
      .single();

    return new Response(
      JSON.stringify({
        action: "closed_and_opened",
        closed_id: viajeAbierto.id,
        pasajeros: viajeAbierto.pasajeros_subidos || 0,
        new_trip_id: nuevo?.id,
        proximo_orden: 2,
        proximo_label: waypoints[1].label,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("trip-geofence-tick error:", msg);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
