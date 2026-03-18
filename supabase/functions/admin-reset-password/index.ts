import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    // 1. Verify caller is authenticated
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "No autorizado" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 401 }
      );
    }

    const token = authHeader.replace("Bearer ", "");
    const { data: { user: caller }, error: authError } = await supabaseClient.auth.getUser(token);

    if (authError || !caller) {
      return new Response(
        JSON.stringify({ error: "No autorizado" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 401 }
      );
    }

    // 2. Verify caller is admin (consecutive_number = 1)
    const { data: profile } = await supabaseClient
      .from("profiles")
      .select("consecutive_number")
      .eq("user_id", caller.id)
      .single();

    if (profile?.consecutive_number !== 1) {
      return new Response(
        JSON.stringify({ error: "Solo administradores pueden resetear contraseñas" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 403 }
      );
    }

    // 3. Process request
    const { user_id, newPassword } = await req.json();

    if (!user_id || !newPassword) {
      throw new Error("user_id y newPassword son requeridos");
    }

    console.log("[ADMIN-RESET-PASSWORD] Admin", caller.id, "reseteando contraseña para user_id:", user_id);

    const { error: updateError } = await supabaseClient.auth.admin.updateUserById(
      user_id,
      { password: newPassword }
    );

    if (updateError) {
      console.error("[ADMIN-RESET-PASSWORD] Error:", updateError);
      throw new Error("Error al actualizar contraseña: " + updateError.message);
    }

    console.log("[ADMIN-RESET-PASSWORD] Contraseña actualizada exitosamente");

    return new Response(
      JSON.stringify({ success: true, message: "Contraseña actualizada" }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
    );
  } catch (error) {
    console.error("[ADMIN-RESET-PASSWORD] Error:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
    );
  }
});
