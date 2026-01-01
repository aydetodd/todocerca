import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const logStep = (step: string, details?: any) => {
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : '';
  console.log(`[SEND-SMS] ${step}${detailsStr}`);
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    logStep("Function started");
    
    const { phone } = await req.json();
    logStep("Phone received", { phone: phone ? phone.substring(0, 6) + '***' : 'missing' });
    
    if (!phone) {
      throw new Error("Número de teléfono es requerido");
    }

    // Generar código de 6 dígitos
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    logStep("Code generated");
    
    // Guardar código en la base de datos
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);
    
    const { error: dbError } = await supabase
      .from("phone_verification_codes")
      .insert({
        phone,
        code,
        expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString() // 10 minutos
      });

    if (dbError) {
      logStep("Database error", { error: dbError.message });
      throw new Error("Error al procesar verificación");
    }
    logStep("Code saved to database");

    // Verificar que las credenciales de Twilio están configuradas
    const accountSid = Deno.env.get("TWILIO_ACCOUNT_SID");
    const authToken = Deno.env.get("TWILIO_AUTH_TOKEN");
    const twilioPhone = Deno.env.get("TWILIO_PHONE_NUMBER");

    if (!accountSid || !authToken || !twilioPhone) {
      logStep("Twilio credentials missing", { 
        hasAccountSid: !!accountSid, 
        hasAuthToken: !!authToken, 
        hasPhone: !!twilioPhone 
      });
      throw new Error("Configuración de SMS incompleta. Contacta a soporte.");
    }

    logStep("Twilio credentials verified");

    const message = `Tu código de verificación TodoCerca es: ${code}. Válido por 10 minutos.`;

    const twilioUrl = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`;
    const twilioAuth = btoa(`${accountSid}:${authToken}`);

    logStep("Sending SMS via Twilio");
    
    const twilioResponse = await fetch(twilioUrl, {
      method: "POST",
      headers: {
        "Authorization": `Basic ${twilioAuth}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        To: phone,
        From: twilioPhone!,
        Body: message,
      }),
    });

    if (!twilioResponse.ok) {
      const errorText = await twilioResponse.text();
      logStep("Twilio error", { status: twilioResponse.status, error: errorText });
      
      // Intentar parsear el error de Twilio para dar un mensaje más útil
      try {
        const errorJson = JSON.parse(errorText);
        if (errorJson.code === 21211) {
          throw new Error("Número de teléfono inválido. Verifica el formato.");
        } else if (errorJson.code === 21614) {
          throw new Error("Este número no puede recibir SMS.");
        } else {
          throw new Error(`Error al enviar SMS: ${errorJson.message || 'Error desconocido'}`);
        }
      } catch (parseError) {
        throw new Error("Error al enviar SMS. Intenta nuevamente.");
      }
    }

    const twilioResult = await twilioResponse.json();
    logStep("SMS sent successfully", { sid: twilioResult.sid });

    return new Response(
      JSON.stringify({ success: true, message: "Código enviado" }),
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
