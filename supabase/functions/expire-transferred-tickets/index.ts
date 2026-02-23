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

  try {
    const now = new Date().toISOString();

    // Find all transferred tickets that have expired
    const { data: expiredTickets, error } = await supabaseAdmin
      .from("qr_tickets")
      .select("id, user_id, token")
      .eq("status", "active")
      .eq("is_transferred", true)
      .lt("transfer_expires_at", now);

    if (error) {
      throw new Error(`Error querying expired tickets: ${error.message}`);
    }

    if (!expiredTickets || expiredTickets.length === 0) {
      console.log("[EXPIRE-TICKETS] No expired transferred tickets found");
      return new Response(JSON.stringify({ expired: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      });
    }

    console.log(`[EXPIRE-TICKETS] Found ${expiredTickets.length} expired transferred tickets`);

    let expiredCount = 0;

    for (const ticket of expiredTickets) {
      // Cancel the QR ticket (boleto returns to user automatically since ticket_count was never reduced)
      await supabaseAdmin
        .from("qr_tickets")
        .update({
          status: "expired",
          is_transferred: false,
          transfer_expires_at: null,
        })
        .eq("id", ticket.id);

      expiredCount++;
      console.log(`[EXPIRE-TICKETS] Expired ticket ${ticket.token.slice(-6)} for user ${ticket.user_id}`);
    }

    return new Response(JSON.stringify({ 
      expired: expiredCount,
      message: `${expiredCount} QR transferidos expirados y boletos devueltos`,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (error) {
    console.error("[EXPIRE-TICKETS] Error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
