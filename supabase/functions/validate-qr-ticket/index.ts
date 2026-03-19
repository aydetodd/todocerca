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

    // 1. Find the QR ticket - support both full UUID token and 6-char short code
    let ticket = null;
    let ticketError = null;

    if (cleanToken.length <= 8) {
      // Short code search: use RPC or raw text cast to match last 6 chars
      const shortCode = cleanToken.toLowerCase();
      
      // Use textual comparison by casting token to text
      const { data: tickets, error } = await supabaseAdmin
        .rpc('find_qr_ticket_by_short_code', { p_short_code: shortCode });

      if (error || !tickets || tickets.length === 0) {
        // Fallback: try direct query with text cast filter
        const { data: allActive, error: fallbackError } = await supabaseAdmin
          .from("qr_tickets")
          .select("*")
          .eq("status", "active")
          .order("created_at", { ascending: false })
          .limit(200);
        
        if (!fallbackError && allActive) {
          const match = allActive.find((t: any) => 
            String(t.token).slice(-6).toLowerCase() === shortCode
          );
          if (match) {
            ticket = match;
          } else {
            // Also check used tickets for fraud detection
            const { data: allUsed } = await supabaseAdmin
              .from("qr_tickets")
              .select("*")
              .eq("status", "used")
              .order("used_at", { ascending: false })
              .limit(200);
            
            if (allUsed) {
              const usedMatch = allUsed.find((t: any) => 
                String(t.token).slice(-6).toLowerCase() === shortCode
              );
              if (usedMatch) ticket = usedMatch;
            }
          }
        }
        
        if (!ticket) {
          ticketError = error || fallbackError || { message: "No encontrado" };
        }
      } else if (tickets.length >= 1) {
        ticket = tickets[0];
      }
    } else {
      // Full token search (UUID)
      const { data, error } = await supabaseAdmin
        .from("qr_tickets")
        .select("*")
        .eq("token", cleanToken)
        .single();
      ticket = data;
      ticketError = error;
    }

    if (ticketError || !ticket) {
      // Log invalid attempt
      await supabaseAdmin.from("logs_validacion_qr").insert({
        resultado: "invalid",
        mensaje_error: "QR inválido o no existe",
        latitud: latitude,
        longitud: longitude,
        unidad_id,
        chofer_id: driver.id,
        producto_id: ruta_id || null,
      });

      return new Response(JSON.stringify({
        valid: false,
        error_type: "invalid",
        message: "QR inválido o no existe",
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      });
    }

    // 2. Check if already used → FRAUD ALERT
    if (ticket.status === "used") {
      // Get original usage details
      const { data: originalUnit } = await supabaseAdmin
        .from("unidades_empresa")
        .select("numero_economico, placas")
        .eq("id", ticket.unidad_uso_id)
        .single();

      // Count fraud attempts for this QR
      const { count: qrAttempts } = await supabaseAdmin
        .from("intentos_fraude")
        .select("*", { count: "exact", head: true })
        .eq("qr_ticket_id", ticket.id);

      // Count fraud attempts for this user
      const { count: userAttempts } = await supabaseAdmin
        .from("intentos_fraude")
        .select("*", { count: "exact", head: true })
        .eq("usuario_id", ticket.user_id);

      // Determine severity
      const totalAttempts = (userAttempts ?? 0) + 1;
      let severity = "low";
      if (totalAttempts >= 6) severity = "critical";
      else if (totalAttempts >= 4) severity = "high";
      else if (totalAttempts >= 2) severity = "medium";

      // Calculate distance if we have coordinates
      let distanceKm: number | null = null;
      if (latitude && longitude && ticket.latitud_validacion && ticket.longitud_validacion) {
        const R = 6371;
        const dLat = (latitude - ticket.latitud_validacion) * Math.PI / 180;
        const dLon = (longitude - ticket.longitud_validacion) * Math.PI / 180;
        const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
          Math.cos(ticket.latitud_validacion * Math.PI / 180) * Math.cos(latitude * Math.PI / 180) *
          Math.sin(dLon/2) * Math.sin(dLon/2);
        distanceKm = R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
      }

      // Calculate time elapsed
      const usedAt = new Date(ticket.used_at);
      const now = new Date();
      const minutesElapsed = Math.floor((now.getTime() - usedAt.getTime()) / 60000);

      // Register fraud attempt
      await supabaseAdmin.from("intentos_fraude").insert({
        qr_ticket_id: ticket.id,
        usuario_id: ticket.user_id,
        fecha_uso_original: ticket.used_at,
        unidad_uso_original_id: ticket.unidad_uso_id,
        ruta_uso_original: ticket.ruta_uso_id,
        lat_original: ticket.latitud_validacion,
        lng_original: ticket.longitud_validacion,
        unidad_detecto_id: unidad_id,
        ruta_detecto: ruta_id,
        lat_detecto: latitude,
        lng_detecto: longitude,
        tipo_fraude: ticket.unidad_uso_id === unidad_id ? "misma_unidad" : "otra_unidad",
        severidad: severity,
        total_intentos_usuario: totalAttempts,
        total_intentos_qr: (qrAttempts ?? 0) + 1,
        distancia_km: distanceKm,
        tiempo_transcurrido_minutos: minutesElapsed,
      });

      // Log validation attempt
      await supabaseAdmin.from("logs_validacion_qr").insert({
        qr_ticket_id: ticket.id,
        resultado: "fraud",
        mensaje_error: "QR ya utilizado - intento de fraude",
        latitud: latitude,
        longitud: longitude,
        unidad_id,
        chofer_id: driver.id,
        producto_id: ruta_id || null,
      });

      const isSameUnit = ticket.unidad_uso_id === unidad_id;

      return new Response(JSON.stringify({
        valid: false,
        error_type: "fraud",
        severity,
        message: "ALERTA DE FRAUDE - BOLETO YA UTILIZADO",
        fraud_details: {
          used_at: ticket.used_at,
          used_on_unit: originalUnit?.numero_economico || "Desconocida",
          used_on_plates: originalUnit?.placas || "",
          used_on_route: ticket.ruta_uso_id,
          minutes_elapsed: minutesElapsed,
          distance_km: distanceKm ? Math.round(distanceKm * 10) / 10 : null,
          is_same_unit: isSameUnit,
          short_code: ticket.token.slice(-6).toUpperCase(),
          total_user_attempts: totalAttempts,
        },
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      });
    }

    // 3. Check if transferred QR is expired
    if (ticket.is_transferred && ticket.transfer_expires_at) {
      const expiresAt = new Date(ticket.transfer_expires_at);
      if (expiresAt < new Date()) {
        // Expire the ticket and return it to user
        await supabaseAdmin
          .from("qr_tickets")
          .update({ status: "expired", is_transferred: false, transfer_expires_at: null })
          .eq("id", ticket.id);

        await supabaseAdmin.from("logs_validacion_qr").insert({
          qr_ticket_id: ticket.id,
          resultado: "expired",
          mensaje_error: "QR transferido expirado (24hrs)",
          latitud: latitude,
          longitud: longitude,
          unidad_id,
          chofer_id: driver.id,
          producto_id: ruta_id || null,
        });

        return new Response(JSON.stringify({
          valid: false,
          error_type: "expired_transfer",
          message: "QR transferido expirado. El boleto fue devuelto al usuario original.",
        }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 200,
        });
      }
    }

    // 4. Check if status is active
    if (ticket.status !== "active") {
      return new Response(JSON.stringify({
        valid: false,
        error_type: "inactive",
        message: `QR no válido. Estado: ${ticket.status}`,
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      });
    }

    // 5. VALID - Process the ticket
    const now = new Date().toISOString();

    // Mark ticket as used (correct column names)
    const { error: updateError } = await supabaseAdmin
      .from("qr_tickets")
      .update({
        status: "used",
        used_at: now,
        unidad_uso_id: unidad_id,
        ruta_uso_id: ruta_id,
        latitud_validacion: latitude,
        longitud_validacion: longitude,
        chofer_id: driver.id,
      })
      .eq("id", ticket.id);

    if (updateError) {
      console.error("[VALIDATE-QR] Error updating ticket:", updateError);
    }

    // Update total_usado counter (no longer decrement ticket_count since QR are generated directly)
    const { data: currentAccount } = await supabaseAdmin
      .from("cuentas_boletos")
      .select("total_usado")
      .eq("user_id", ticket.user_id)
      .single();

    if (currentAccount) {
      await supabaseAdmin
        .from("cuentas_boletos")
        .update({
          total_usado: currentAccount.total_usado + 1,
        })
        .eq("user_id", ticket.user_id);
    }

    // Log successful validation
    await supabaseAdmin.from("logs_validacion_qr").insert({
      qr_ticket_id: ticket.id,
      resultado: "valid",
      latitud: latitude,
      longitud: longitude,
      unidad_id,
      chofer_id: driver.id,
      producto_id: ruta_id || null,
    });

    // Get daily count using Hermosillo time (UTC-7, no DST)
    const nowMs = Date.now() - 7 * 60 * 60 * 1000;
    const hermosilloDate = new Date(nowMs).toISOString().split("T")[0];
    const todayStartStr = `${hermosilloDate}T00:00:00-07:00`;
    
    let dailyQuery = supabaseAdmin
      .from("logs_validacion_qr")
      .select("*", { count: "exact", head: true })
      .eq("resultado", "valid")
      .gte("created_at", todayStartStr);
    
    if (unidad_id) {
      dailyQuery = dailyQuery.eq("unidad_id", unidad_id);
    } else {
      dailyQuery = dailyQuery.eq("chofer_id", driver.id);
    }
    
    const { count: dailyCount } = await dailyQuery;

    console.log(`[VALIDATE-QR] Valid! Token: ${ticket.token.slice(-6)} Unit: ${unidad_id} Chofer: ${driver.id} Daily: ${dailyCount}`);

    return new Response(JSON.stringify({
      valid: true,
      message: "QR BOLETO VÁLIDO",
      details: {
        amount: 9.00,
        short_code: ticket.token.slice(-6).toUpperCase(),
        validated_at: now,
        daily_passenger_count: dailyCount ?? 0,
        daily_total_mxn: (dailyCount ?? 0) * 9.00,
      },
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (error) {
    console.error("[VALIDATE-QR] Error:", error);
    return new Response(JSON.stringify({ valid: false, error: error.message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
