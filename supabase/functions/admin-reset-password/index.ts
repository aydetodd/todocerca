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
    const { user_id, newPassword } = await req.json();

    if (!user_id || !newPassword) {
      throw new Error("user_id y newPassword son requeridos");
    }

    console.log("[ADMIN-RESET-PASSWORD] Reseteando contraseña para user_id:", user_id);

    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

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
