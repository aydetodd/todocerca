import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { phone, code, newPassword } = await req.json();
    
    if (!phone || !code || !newPassword) {
      throw new Error("Teléfono, código y nueva contraseña son requeridos");
    }

    console.log("[VERIFY-RECOVERY-CODE] Verificando código para:", phone);

    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    // Buscar código válido
    const { data: recoveryData, error: queryError } = await supabaseClient
      .from("password_recovery_codes")
      .select("*")
      .eq("phone", phone)
      .eq("code", code)
      .eq("used", false)
      .gt("expires_at", new Date().toISOString())
      .order("created_at", { ascending: false })
      .limit(1)
      .single();

    if (queryError || !recoveryData) {
      console.error("[VERIFY-RECOVERY-CODE] Código no válido:", queryError);
      throw new Error("Código inválido o expirado");
    }

    // Marcar código como usado
    await supabaseClient
      .from("password_recovery_codes")
      .update({ used: true })
      .eq("id", recoveryData.id);

    // Buscar usuario por teléfono
    const { data: profileData, error: profileError } = await supabaseClient
      .from("profiles")
      .select("user_id")
      .eq("telefono", phone)
      .single();

    if (profileError || !profileData) {
      console.error("[VERIFY-RECOVERY-CODE] Usuario no encontrado:", profileError);
      throw new Error("Usuario no encontrado");
    }

    // Actualizar contraseña del usuario
    const { error: updateError } = await supabaseClient.auth.admin.updateUserById(
      profileData.user_id,
      { password: newPassword }
    );

    if (updateError) {
      console.error("[VERIFY-RECOVERY-CODE] Error al actualizar contraseña:", updateError);
      throw new Error("Error al actualizar contraseña");
    }

    console.log("[VERIFY-RECOVERY-CODE] Contraseña actualizada exitosamente");

    return new Response(
      JSON.stringify({ 
        success: true,
        message: "Contraseña actualizada exitosamente" 
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      }
    );
  } catch (error) {
    console.error("[VERIFY-RECOVERY-CODE] Error:", error);
    return new Response(
      JSON.stringify({ 
        error: error.message || "Error al procesar solicitud" 
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 500,
      }
    );
  }
});
