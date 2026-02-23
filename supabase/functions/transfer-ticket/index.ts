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
    // Authenticate user
    const authHeader = req.headers.get("Authorization")!;
    const token = authHeader.replace("Bearer ", "");
    const { data } = await supabaseClient.auth.getUser(token);
    const user = data.user;
    if (!user) throw new Error("Usuario no autenticado");

    const { ticket_id, transferred_to } = await req.json();

    if (!ticket_id) throw new Error("ID de boleto requerido");

    // Verify ticket belongs to user and is active
    const { data: ticket, error } = await supabaseAdmin
      .from("qr_tickets")
      .select("*")
      .eq("id", ticket_id)
      .eq("user_id", user.id)
      .eq("status", "active")
      .eq("is_transferred", false)
      .single();

    if (error || !ticket) {
      throw new Error("Boleto no encontrado o no disponible para transferir");
    }

    // Set 24-hour expiration
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + 24);

    // Update ticket as transferred
    const { data: updated, error: updateError } = await supabaseAdmin
      .from("qr_tickets")
      .update({
        is_transferred: true,
        transferred_to: transferred_to || null,
        transfer_expires_at: expiresAt.toISOString(),
      })
      .eq("id", ticket_id)
      .select()
      .single();

    if (updateError) {
      throw new Error("Error al transferir boleto");
    }

    console.log(`[TRANSFER-TICKET] Ticket ${ticket.token.slice(-6)} transferred, expires: ${expiresAt.toISOString()}`);

    return new Response(JSON.stringify({
      ticket: updated,
      short_code: ticket.token.slice(-6).toUpperCase(),
      expires_at: expiresAt.toISOString(),
      message: "QR transferido. Válido por 24 horas.",
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (error) {
    console.error("[TRANSFER-TICKET] Error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
