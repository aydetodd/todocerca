import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type AppointmentStatus = "confirmada" | "cancelada" | "completada" | "pendiente";

interface AppointmentUpdateRequest {
  appointmentId: string;
  status: AppointmentStatus;
}

const normalizePhone = (phone: string) => {
  const digits = String(phone ?? "").replace(/[^0-9]/g, "");
  if (!digits) return "";
  return digits.startsWith("+") ? digits : `+${digits}`;
};

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY");

    if (!supabaseUrl || !supabaseAnonKey) {
      throw new Error("Supabase env not configured");
    }

    const authorization = req.headers.get("Authorization") ?? "";
    const token = authorization.replace("Bearer ", "").trim();

    if (!token) {
      return new Response(JSON.stringify({ error: "Missing Authorization header" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authorization } },
    });

    // Validate token + get user id
    let userId: string | null = null;
    const claimsRes = await (supabase as any).auth.getClaims?.(token);
    if (claimsRes?.data?.claims?.sub) {
      userId = String(claimsRes.data.claims.sub);
    } else {
      // Fallback
      const { data: userData, error: userErr } = await supabase.auth.getUser(token);
      if (userErr || !userData?.user) {
        console.error("Auth error:", userErr);
        return new Response(JSON.stringify({ error: "Invalid token" }), {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      userId = userData.user.id;
    }

    const { appointmentId, status }: AppointmentUpdateRequest = await req.json();

    if (!appointmentId || !status) {
      return new Response(JSON.stringify({ error: "Missing appointmentId/status" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log("send-whatsapp-appointment-update", { appointmentId, status, userId });

    // Verify provider ownership
    const { data: proveedor, error: provErr } = await supabase
      .from("proveedores")
      .select("id, user_id, nombre")
      .eq("user_id", userId)
      .single();

    if (provErr || !proveedor) {
      console.error("Proveedor not found:", provErr);
      return new Response(JSON.stringify({ error: "Not a provider" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: cita, error: citaErr } = await supabase
      .from("citas")
      .select(
        "id, proveedor_id, cliente_nombre, cliente_telefono, fecha, hora_inicio, hora_fin, servicio, estado"
      )
      .eq("id", appointmentId)
      .single();

    if (citaErr || !cita) {
      console.error("Cita not found:", citaErr);
      return new Response(JSON.stringify({ error: "Appointment not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (String(cita.proveedor_id) !== String(proveedor.id)) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const twilioAccountSid = Deno.env.get("TWILIO_ACCOUNT_SID");
    const twilioAuthToken = Deno.env.get("TWILIO_AUTH_TOKEN");
    const twilioPhoneNumber = Deno.env.get("TWILIO_PHONE_NUMBER");

    if (!twilioAccountSid || !twilioAuthToken || !twilioPhoneNumber) {
      throw new Error("Twilio credentials not configured");
    }

    const formattedPhone = normalizePhone(cita.cliente_telefono);
    if (!formattedPhone) {
      return new Response(JSON.stringify({ error: "Client phone missing" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const whatsappTo = `whatsapp:${formattedPhone}`;
    const whatsappFrom = `whatsapp:${twilioPhoneNumber}`;

    const statusLabel: Record<AppointmentStatus, string> = {
      pendiente: "Pendiente",
      confirmada: "Confirmada",
      completada: "Completada",
      cancelada: "Cancelada",
    };

    const message =
      `🗓️ *Actualización de tu cita*\n\n` +
      `🏪 Proveedor: ${proveedor.nombre}\n` +
      `📅 Fecha: ${cita.fecha}\n` +
      `🕐 Hora: ${String(cita.hora_inicio).slice(0, 5)} - ${String(cita.hora_fin).slice(0, 5)}\n` +
      `📌 Estado: *${statusLabel[status]}*\n` +
      (cita.servicio ? `💼 Servicio: ${cita.servicio}\n` : "") +
      `\nSi tienes dudas, responde este mensaje.`;

    const twilioUrl = `https://api.twilio.com/2010-04-01/Accounts/${twilioAccountSid}/Messages.json`;
    const auth = btoa(`${twilioAccountSid}:${twilioAuthToken}`);

    const body = new URLSearchParams({
      From: whatsappFrom,
      To: whatsappTo,
      Body: message,
    });

    const response = await fetch(twilioUrl, {
      method: "POST",
      headers: {
        Authorization: `Basic ${auth}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: body.toString(),
    });

    const data = await response.json();

    if (!response.ok) {
      console.error("Twilio error:", data);
      throw new Error(data.message || "Failed to send WhatsApp message");
    }

    console.log("WhatsApp sent:", data.sid);

    return new Response(
      JSON.stringify({ success: true, messageSid: data.sid }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error: any) {
    console.error("Error in send-whatsapp-appointment-update:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
