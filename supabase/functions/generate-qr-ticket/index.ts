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

    // Check ticket balance
    const { data: account, error: accError } = await supabaseAdmin
      .from("cuentas_boletos")
      .select("ticket_count, total_usado")
      .eq("user_id", user.id)
      .single();

    if (accError || !account) {
      throw new Error("No se encontró cuenta de boletos");
    }

    if (account.ticket_count <= 0) {
      throw new Error("No tienes boletos disponibles. Compra más boletos.");
    }

    // Rate limit: max 20 QR per day
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    
    const { count } = await supabaseAdmin
      .from("qr_tickets")
      .select("*", { count: "exact", head: true })
      .eq("user_id", user.id)
      .gte("generated_at", todayStart.toISOString());

    if ((count ?? 0) >= 20) {
      throw new Error("Has alcanzado el límite de 20 QR por día.");
    }

    // Generate unique token
    const token_qr = crypto.randomUUID();

    // Create QR ticket AND decrement ticket_count atomically
    const { data: ticket, error: insertError } = await supabaseAdmin
      .from("qr_tickets")
      .insert({
        user_id: user.id,
        token: token_qr,
        amount: 9.00,
        status: "active",
        is_transferred: false,
      })
      .select()
      .single();

    if (insertError) {
      console.error("[GENERATE-QR] Insert error:", insertError);
      throw new Error("Error al generar QR boleto");
    }

    // Decrement ticket_count by 1
    const { error: updateError } = await supabaseAdmin
      .from("cuentas_boletos")
      .update({ 
        ticket_count: account.ticket_count - 1,
        total_usado: (account as any).total_usado + 1,
      })
      .eq("user_id", user.id);

    if (updateError) {
      console.error("[GENERATE-QR] Update balance error:", updateError);
    }

    console.log(`[GENERATE-QR] QR generated: ${token_qr.slice(-6)} for user ${user.id}`);

    return new Response(JSON.stringify({ 
      ticket,
      short_code: token_qr.slice(-6).toUpperCase(),
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (error) {
    console.error("[GENERATE-QR] Error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
