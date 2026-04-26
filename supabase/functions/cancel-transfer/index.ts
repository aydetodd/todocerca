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
    const authHeader = req.headers.get("Authorization")!;
    const token = authHeader.replace("Bearer ", "");
    const { data } = await supabaseClient.auth.getUser(token);
    const user = data.user;
    if (!user) throw new Error("Usuario no autenticado");

    const { ticket_id } = await req.json();
    if (!ticket_id) throw new Error("ID de boleto requerido");

    // Only allow cancelling transfers on user's own tickets
    const { data: updated, error } = await supabaseAdmin
      .from("qr_tickets")
      .update({
        is_transferred: false,
        transferred_to: null,
        transfer_expires_at: null,
      })
      .eq("id", ticket_id)
      .eq("user_id", user.id)
      .eq("status", "active")
      .eq("is_transferred", true)
      .select()
      .single();

    if (error) {
      throw new Error("No se pudo cancelar la transferencia");
    }

    // Log movement
    await supabaseAdmin.from("movimientos_boleto").insert({
      qr_ticket_id: ticket_id,
      user_id: user.id,
      tipo: "transfer_cancelled",
      detalles: {},
    });

    console.log(`[CANCEL-TRANSFER] Ticket ${updated.token.slice(-6)} transfer cancelled by user ${user.id}`);

    return new Response(JSON.stringify({ success: true, ticket: updated }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (error) {
    console.error("[CANCEL-TRANSFER] Error:", error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : String(error) }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
