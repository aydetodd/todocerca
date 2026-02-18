import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const buildWelcomeMessage = (apodo: string): string => {
  return `Estimado ${apodo},

¡Bienvenido a Todocerca! 🙌

Agradecemos profundamente que hayas confiado en nosotros para conectar con negocios y servicios cerca de ti. Cada vez que usas la app, ayudas a fortalecer el comercio local y a construir una comunidad más unida.

Pero queremos invitarte a dar un paso más: *¿ya pensaste en ofrecer tus productos o servicios a través de Todocerca?*

📍 *Como proveedor en Todocerca, tú:*
✔️ Llegas a clientes en tu colonia que ya buscan lo que ofreces
✔️ Recibes pedidos directos sin intermediarios
✔️ *Pagas 0% de comisión en pagos en efectivo*
✔️ *Actualizas tu catálogo al instante desde tu celular*: fotos, precios, descripción y stock se ven en tiempo real por tus clientes
✔️ *Obtienes tu propio link y QR personalizados* para compartir por WhatsApp, redes o imprimir en tu establecimiento
✔️ Apareces en búsquedas locales dentro de la app

💡 _¿Vendes alimentos, ofreces servicios a domicilio, tienes un pequeño negocio o compartes habilidades?_ ¡Tu vecindario te está buscando!

👉 *Activa tu catálogo digital en 2 minutos:*
https://todocerca.mx/panel

*No necesitas app aparte*: usa la misma cuenta de Todocerca que ya tienes. Solo completa tu perfil de negocio en el *panel* y obtén al instante tu *link + QR*. ¡Tu negocio visible, organizado y actualizable desde tu celular! 📲💚

— El equipo de Todocerca
_Digitalización Integral para tu comunidad_`;
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Verify admin caller
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) throw new Error('No authorization header');

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Verify caller is admin (consecutive_number = 1)
    const anonClient = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY')!);
    const { data: { user }, error: authError } = await anonClient.auth.getUser(authHeader.replace('Bearer ', ''));
    if (authError || !user) throw new Error('Not authenticated');

    const { data: callerProfile } = await supabase
      .from('profiles')
      .select('consecutive_number')
      .eq('user_id', user.id)
      .single();

    if (!callerProfile || callerProfile.consecutive_number !== 1) {
      throw new Error('Only admin can send bulk messages');
    }

    const twilioAccountSid = Deno.env.get('TWILIO_ACCOUNT_SID');
    const twilioAuthToken = Deno.env.get('TWILIO_AUTH_TOKEN');
    const twilioPhoneNumber = Deno.env.get('TWILIO_PHONE_NUMBER');

    if (!twilioAccountSid || !twilioAuthToken || !twilioPhoneNumber) {
      throw new Error('Twilio credentials not configured');
    }

    // Fetch all profiles with phone numbers
    const { data: profiles, error: profilesError } = await supabase
      .from('profiles')
      .select('id, telefono, apodo, nombre')
      .not('telefono', 'is', null);

    if (profilesError) throw profilesError;

    const auth = btoa(`${twilioAccountSid}:${twilioAuthToken}`);
    const twilioUrl = `https://api.twilio.com/2010-04-01/Accounts/${twilioAccountSid}/Messages.json`;

    let sent = 0;
    let failed = 0;
    const errors: string[] = [];

    for (const profile of (profiles || [])) {
      if (!profile.telefono) continue;

      const displayName = profile.apodo || profile.nombre || 'Usuario';
      const message = buildWelcomeMessage(displayName);

      const formattedPhone = profile.telefono.startsWith('+') ? profile.telefono : `+${profile.telefono}`;

      const contentSid = 'HX5a99e3d4a349260abbcf0acf12dd8ef0';
      
      const body = new URLSearchParams({
        From: `whatsapp:${twilioPhoneNumber}`,
        To: `whatsapp:${formattedPhone}`,
        ContentSid: contentSid,
        ContentVariables: JSON.stringify({ "1": displayName }),
      });

      try {
        const response = await fetch(twilioUrl, {
          method: 'POST',
          headers: {
            'Authorization': `Basic ${auth}`,
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: body.toString(),
        });

        if (response.ok) {
          sent++;
          console.log(`✅ Sent to ${formattedPhone}`);
        } else {
          const errData = await response.json();
          failed++;
          errors.push(`${formattedPhone}: ${errData.message}`);
          console.error(`❌ Failed for ${formattedPhone}:`, errData.message);
        }
      } catch (err: any) {
        failed++;
        errors.push(`${formattedPhone}: ${err.message}`);
      }

      // Small delay to avoid rate limiting
      await new Promise(r => setTimeout(r, 500));
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        total: (profiles || []).length,
        sent,
        failed,
        errors: errors.slice(0, 10),
      }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );

  } catch (error: any) {
    console.error('Error in send-whatsapp-bulk:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
