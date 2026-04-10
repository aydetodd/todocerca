import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseAdmin = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
  );

  const supabaseClient = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_ANON_KEY") ?? ""
  );

  try {
    // Authenticate driver
    const authHeader = req.headers.get("Authorization")!;
    const token = authHeader.replace("Bearer ", "");
    const { data: authData } = await supabaseClient.auth.getUser(token);
    const driver = authData.user;
    if (!driver) throw new Error("Chofer no autenticado");

    const { qr_token, latitude, longitude, unidad_id, ruta_id } = await req.json();
    if (!qr_token) throw new Error("Token QR requerido");

    const cleanToken = qr_token.trim();

    // Resolve driver assignment
    let resolvedUnidadId = unidad_id || null;
    let resolvedRutaId = ruta_id || null;

    const hermosilloToday = new Date(Date.now() - 7 * 60 * 60 * 1000).toISOString().split("T")[0];

    const { data: choferRecord } = await supabaseAdmin
      .from("choferes_empresa")
      .select("id")
      .eq("user_id", driver.id)
      .eq("is_active", true)
      .maybeSingle();

    if (choferRecord?.id && (!resolvedUnidadId || !resolvedRutaId)) {
      const { data: asignacion } = await supabaseAdmin
        .from("asignaciones_chofer")
        .select("unidad_id, producto_id")
        .eq("chofer_id", choferRecord.id)
        .eq("fecha", hermosilloToday)
        .maybeSingle();

      if (asignacion) {
        resolvedUnidadId = resolvedUnidadId || asignacion.unidad_id || null;
        resolvedRutaId = resolvedRutaId || asignacion.producto_id || null;
      }
    }

    // 1. Find QR - support full UUID and short code
    let qrEmpleado = null;

    if (cleanToken.length <= 8) {
      const shortCode = cleanToken.toLowerCase();
      const { data: allActive } = await supabaseAdmin
        .from("qr_empleados")
        .select("*")
        .eq("status", "active")
        .order("created_at", { ascending: false })
        .limit(200);

      if (allActive) {
        qrEmpleado = allActive.find((q: any) =>
          String(q.token).slice(-6).toLowerCase() === shortCode
        );
      }
    } else {
      const { data } = await supabaseAdmin
        .from("qr_empleados")
        .select("*")
        .eq("token", cleanToken)
        .maybeSingle();
      qrEmpleado = data;
    }

    if (!qrEmpleado) {
      return new Response(JSON.stringify({
        valid: false,
        error_type: "invalid",
        message: "QR de empleado no encontrado",
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      });
    }

    // 2. Check status
    if (qrEmpleado.status !== "active") {
      return new Response(JSON.stringify({
        valid: false,
        error_type: "inactive",
        message: `QR no válido. Estado: ${qrEmpleado.status}`,
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      });
    }

    // 3. Check vigencia for rotativo
    if (qrEmpleado.qr_tipo === "rotativo" && qrEmpleado.fecha_vigencia_fin) {
      const vigenciaFin = new Date(qrEmpleado.fecha_vigencia_fin);
      if (vigenciaFin < new Date(hermosilloToday)) {
        await supabaseAdmin
          .from("qr_empleados")
          .update({ status: "expired" })
          .eq("id", qrEmpleado.id);

        return new Response(JSON.stringify({
          valid: false,
          error_type: "expired",
          message: "QR expirado. Solicite uno nuevo a su empresa.",
        }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 200,
        });
      }
    }

    // 4. Get employee info
    const { data: empleado } = await supabaseAdmin
      .from("empleados_empresa")
      .select("id, nombre, numero_nomina, departamento, turno, is_active, empresa_id")
      .eq("id", qrEmpleado.empleado_id)
      .single();

    if (!empleado || !empleado.is_active) {
      return new Response(JSON.stringify({
        valid: false,
        error_type: "employee_inactive",
        message: "Empleado no activo o no encontrado",
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      });
    }

    // 5. Check duplicate: same employee, same day, same shift direction
    const { data: existingToday } = await supabaseAdmin
      .from("validaciones_transporte_personal")
      .select("id, validated_at")
      .eq("empleado_id", empleado.id)
      .eq("fecha_local", hermosilloToday)
      .eq("ruta_id", resolvedRutaId)
      .limit(1);

    if (existingToday && existingToday.length > 0) {
      const prevTime = new Date(existingToday[0].validated_at);
      const now = new Date();
      const minutesDiff = Math.floor((now.getTime() - prevTime.getTime()) / 60000);

      // Allow if more than 4 hours apart (different shift/direction)
      if (minutesDiff < 240) {
        return new Response(JSON.stringify({
          valid: false,
          error_type: "duplicate",
          message: `${empleado.nombre} ya fue registrado en esta ruta hoy`,
          details: {
            employee_name: empleado.nombre,
            previous_scan: existingToday[0].validated_at,
            minutes_ago: minutesDiff,
          },
        }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 200,
        });
      }
    }

    // 6. Find active contract
    let contratoId: string | null = null;
    const { data: contratos } = await supabaseAdmin
      .from("contratos_transporte")
      .select("id, tarifa_por_persona, concesionario_id")
      .eq("empresa_id", empleado.empresa_id)
      .eq("is_active", true);

    if (contratos && contratos.length > 0) {
      // Try to match by concesionario through the driver's employer
      if (choferRecord?.id) {
        const { data: choferFull } = await supabaseAdmin
          .from("choferes_empresa")
          .select("proveedor_id")
          .eq("id", choferRecord.id)
          .single();

        if (choferFull) {
          const matched = contratos.find((c: any) => c.concesionario_id === choferFull.proveedor_id);
          if (matched) contratoId = matched.id;
        }
      }
      // Fallback to first active contract
      if (!contratoId) contratoId = contratos[0].id;
    }

    // 7. Register validation
    const now = new Date().toISOString();

    await supabaseAdmin.from("validaciones_transporte_personal").insert({
      qr_empleado_id: qrEmpleado.id,
      empleado_id: empleado.id,
      empresa_id: empleado.empresa_id,
      contrato_id: contratoId,
      chofer_id: driver.id,
      unidad_id: resolvedUnidadId,
      ruta_id: resolvedRutaId,
      latitud: latitude,
      longitud: longitude,
      fecha_local: hermosilloToday,
      turno: empleado.turno,
    });

    // For rotativo QR, mark as used after validation
    if (qrEmpleado.qr_tipo === "rotativo") {
      await supabaseAdmin
        .from("qr_empleados")
        .update({ status: "used" })
        .eq("id", qrEmpleado.id);
    }

    // 8. Get daily count for this contract/route
    let dailyQuery = supabaseAdmin
      .from("validaciones_transporte_personal")
      .select("*", { count: "exact", head: true })
      .eq("fecha_local", hermosilloToday);

    if (resolvedRutaId) {
      dailyQuery = dailyQuery.eq("ruta_id", resolvedRutaId);
    }
    if (resolvedUnidadId) {
      dailyQuery = dailyQuery.eq("unidad_id", resolvedUnidadId);
    }

    const { count: dailyCount } = await dailyQuery;

    // Get empresa name
    const { data: empresa } = await supabaseAdmin
      .from("empresas_transporte")
      .select("nombre")
      .eq("id", empleado.empresa_id)
      .single();

    console.log(`[VALIDAR-QR-EMPLEADO] Valid! Employee: ${empleado.nombre} Company: ${empresa?.nombre} Unit: ${resolvedUnidadId} Daily: ${dailyCount}`);

    return new Response(JSON.stringify({
      valid: true,
      message: "EMPLEADO REGISTRADO",
      details: {
        employee_name: empleado.nombre,
        employee_id: empleado.numero_nomina || "",
        department: empleado.departamento || "",
        shift: empleado.turno || "",
        company_name: empresa?.nombre || "",
        short_code: String(qrEmpleado.token).slice(-6).toUpperCase(),
        validated_at: now,
        daily_passenger_count: dailyCount ?? 0,
        qr_type: qrEmpleado.qr_tipo,
      },
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (error) {
    console.error("[VALIDAR-QR-EMPLEADO] Error:", error);
    return new Response(JSON.stringify({ valid: false, error: error.message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
