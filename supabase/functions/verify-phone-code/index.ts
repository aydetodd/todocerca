import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const logStep = (step: string, details?: any) => {
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : '';
  console.log(`[VERIFY-CODE] ${step}${detailsStr}`);
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    logStep("Function started");
    
    const { phone, code, userId } = await req.json();
    logStep("Request received", { 
      phone: phone ? phone.substring(0, 6) + '***' : 'missing',
      code: code ? '******' : 'missing',
      userId: userId ? userId.substring(0, 8) + '...' : 'missing'
    });
    
    if (!phone || !code) {
      throw new Error("Teléfono y código son requeridos");
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Buscar código válido
    logStep("Looking for valid code");
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

    if (codeError) {
      logStep("Database error", { error: codeError.message });
      throw new Error("Error al verificar código");
    }
    
    if (!verificationCode) {
      logStep("Code not found or expired");
      throw new Error("Código inválido o expirado");
    }
    
    logStep("Valid code found", { id: verificationCode.id });

    // Marcar código como usado
    const { error: updateError } = await supabase
      .from("phone_verification_codes")
      .update({ used: true })
      .eq("id", verificationCode.id);
      
    if (updateError) {
      logStep("Error marking code as used", { error: updateError.message });
    } else {
      logStep("Code marked as used");
    }

    // Actualizar perfil para marcar teléfono como verificado
    if (userId) {
      logStep("Updating profile phone_verified");
      const { error: profileError } = await supabase
        .from("profiles")
        .update({ phone_verified: true })
        .eq("user_id", userId);
        
      if (profileError) {
        logStep("Profile update error", { error: profileError.message });
      } else {
        logStep("Profile updated successfully");
      }
    }

    logStep("Verification complete");
    return new Response(
      JSON.stringify({ success: true, message: "Teléfono verificado" }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logStep("ERROR", { message: errorMessage });
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { 
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" } 
      }
    );
  }
});
