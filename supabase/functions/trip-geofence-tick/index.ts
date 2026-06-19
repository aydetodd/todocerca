// Trip geofence tick: recibe {unidad_id, lat, lng} del chofer y abre/cierra viajes
// automáticamente cuando entra al radio del punto A o B configurado por el concesionario.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

interface Body {
  unidad_id: string;
  lat: number;
  lng: number;
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

    // Auth check (usa anon key del caller para validar JWT)
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

    // 1. Lee unidad + verifica que sea chofer activo de esa unidad
    const { data: unidad } = await supabase
      .from("unidades_empresa")
      .select("id, proveedor_id, punto_a_lat, punto_a_lng, punto_b_lat, punto_b_lng, geofence_radius_m")
      .eq("id", body.unidad_id)
      .maybeSingle();

    if (!unidad || unidad.punto_a_lat == null || unidad.punto_b_lat == null) {
      return new Response(JSON.stringify({ skipped: true, reason: "no_points" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const today = getHermosilloToday();
    const radio = Number(unidad.geofence_radius_m || 150);

    // 2. Chofer + asignación de hoy
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

    // 3. Calcular distancias
    const distA = haversineMeters(body.lat, body.lng, Number(unidad.punto_a_lat), Number(unidad.punto_a_lng));
    const distB = haversineMeters(body.lat, body.lng, Number(unidad.punto_b_lat), Number(unidad.punto_b_lng));
    const insideA = distA <= radio;
    const insideB = distB <= radio;

    // 4. Viaje abierto actual de esta unidad hoy
    const { data: viajeAbierto } = await supabase
      .from("viajes_realizados")
      .select("id, numero_viaje, origen, destino, direccion, inicio_at, pasajeros_subidos")
      .eq("unidad_id", body.unidad_id)
      .eq("chofer_id", chofer.id)
      .eq("fecha", today)
      .eq("estado", "en_curso")
      .order("inicio_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    // Si está dentro de A o B y hay viaje abierto cuyo destino coincide → CIERRA
    const destinoActual = viajeAbierto?.destino || (viajeAbierto?.direccion === "AB" ? "B" : viajeAbierto?.direccion === "BA" ? "A" : null);
    if (viajeAbierto && ((insideA && destinoActual === "A") || (insideB && destinoActual === "B"))) {
      const finPunto = destinoActual as "A" | "B";
      const finLat = insideA ? Number(unidad.punto_a_lat) : Number(unidad.punto_b_lat);
      const finLng = insideA ? Number(unidad.punto_a_lng) : Number(unidad.punto_b_lng);

      // Snapshot de pasajeros: el contador de ESP32 ya viene acumulado
      // en `pasajeros_subidos` (el edge function esp32-conteo-pasajeros lo
      // incrementa por evento). Lo respetamos tal cual.
      const pasajerosCount = viajeAbierto.pasajeros_subidos ?? 0;

      await supabase
        .from("viajes_realizados")
        .update({
          estado: "completado",
          fin_at: new Date().toISOString(),
          fin_lat: finLat,
          fin_lng: finLng,
          fin_manual: false,
          direccion: finPunto === "A" ? "BA" : "AB",
        })
        .eq("id", viajeAbierto.id);

      // Abrir el siguiente viaje (alternando origen/destino)
      const nuevoOrigen = finPunto; // arrancamos donde acabamos
      const nuevoDestino = finPunto === "A" ? "B" : "A";
      const nuevaDireccion = nuevoOrigen === "A" ? "AB" : "BA";
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
          inicio_lat: finLat,
          inicio_lng: finLng,
          inicio_manual: false,
          estado: "en_curso",
          origen: nuevoOrigen,
          destino: nuevoDestino,
          direccion: nuevaDireccion,
        })
        .select("id")
        .single();

      return new Response(
        JSON.stringify({
          action: "closed_and_opened",
          closed_id: viajeAbierto.id,
          pasajeros: pasajerosCount || 0,
          new_trip_id: nuevo?.id,
          new_destino: nuevoDestino,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Si NO hay viaje abierto y está dentro de A o B → ABRIR uno nuevo
    if (!viajeAbierto && (insideA || insideB)) {
      const origen = insideA ? "A" : "B";
      const destino = origen === "A" ? "B" : "A";
      const direccion = origen === "A" ? "AB" : "BA";
      const inicioLat = insideA ? Number(unidad.punto_a_lat) : Number(unidad.punto_b_lat);
      const inicioLng = insideA ? Number(unidad.punto_a_lng) : Number(unidad.punto_b_lng);

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
          inicio_lat: inicioLat,
          inicio_lng: inicioLng,
          inicio_manual: false,
          estado: "en_curso",
          origen,
          destino,
          direccion,
        })
        .select("id")
        .single();

      return new Response(
        JSON.stringify({ action: "opened", trip_id: nuevo?.id, origen, destino }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    return new Response(
      JSON.stringify({ action: "noop", distA: Math.round(distA), distB: Math.round(distB), radio }),
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
