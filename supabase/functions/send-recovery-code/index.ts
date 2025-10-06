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
    const { phone } = await req.json();
    
    if (!phone) {
      throw new Error("Número de teléfono requerido");
    }

    // Generar código de 6 dígitos
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    
    console.log("[SEND-RECOVERY-CODE] Generando código para:", phone);

    // Guardar código en la base de datos
    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    const { error: dbError } = await supabaseClient
      .from("password_recovery_codes")
      .insert({
        phone,
        code,
      });

    if (dbError) {
      console.error("[SEND-RECOVERY-CODE] Error al guardar código:", dbError);
      throw new Error("Error al generar código de recuperación");
    }

    // Enviar SMS con Twilio
    const accountSid = Deno.env.get("TWILIO_ACCOUNT_SID");
    const authToken = Deno.env.get("TWILIO_AUTH_TOKEN");
    const twilioPhone = Deno.env.get("TWILIO_PHONE_NUMBER") || "+15017122661"; // Número por defecto de prueba

    const twilioUrl = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`;
    
    const formData = new URLSearchParams();
    formData.append("To", phone);
    formData.append("From", twilioPhone);
    formData.append("Body", `Tu código de recuperación de ToDoCerca es: ${code}. Válido por 10 minutos.`);

    const twilioResponse = await fetch(twilioUrl, {
      method: "POST",
      headers: {
        "Authorization": `Basic ${btoa(`${accountSid}:${authToken}`)}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: formData.toString(),
    });

    if (!twilioResponse.ok) {
      const errorText = await twilioResponse.text();
      console.error("[SEND-RECOVERY-CODE] Error de Twilio:", errorText);
      throw new Error("Error al enviar SMS");
    }

    console.log("[SEND-RECOVERY-CODE] SMS enviado exitosamente");

    return new Response(
      JSON.stringify({ 
        success: true,
        message: "Código enviado exitosamente" 
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      }
    );
  } catch (error) {
    console.error("[SEND-RECOVERY-CODE] Error:", error);
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
