import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { phone, code, userId } = await req.json();
    
    if (!phone || !code) {
      throw new Error("Teléfono y código son requeridos");
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Buscar código válido
    const { data: verificationCode, error: codeError } = await supabase
      .from("phone_verification_codes")
      .select("*")
      .eq("phone", phone)
      .eq("code", code)
      .eq("used", false)
      .gt("expires_at", new Date().toISOString())
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (codeError || !verificationCode) {
      throw new Error("Código inválido o expirado");
    }

    // Marcar código como usado
    await supabase
      .from("phone_verification_codes")
      .update({ used: true })
      .eq("id", verificationCode.id);

    // Actualizar perfil para marcar teléfono como verificado
    if (userId) {
      await supabase
        .from("profiles")
        .update({ phone_verified: true })
        .eq("user_id", userId);
    }

    return new Response(
      JSON.stringify({ success: true, message: "Teléfono verificado" }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { 
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" } 
      }
    );
  }
});
