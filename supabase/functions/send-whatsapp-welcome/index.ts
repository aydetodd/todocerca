import { serve } from "https://deno.land/std@0.190.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface WhatsAppRequest {
  phoneNumber: string;
  userName: string;
  userType: 'cliente' | 'proveedor';
  apodo?: string;
}

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
    const { phoneNumber, userName, userType, apodo }: WhatsAppRequest = await req.json();
    
    console.log('Sending WhatsApp welcome message to:', phoneNumber);

    const twilioAccountSid = Deno.env.get('TWILIO_ACCOUNT_SID');
    const twilioAuthToken = Deno.env.get('TWILIO_AUTH_TOKEN');
    const twilioPhoneNumber = Deno.env.get('TWILIO_PHONE_NUMBER');

    if (!twilioAccountSid || !twilioAuthToken || !twilioPhoneNumber) {
      throw new Error('Twilio credentials not configured');
    }

    const formattedPhone = phoneNumber.startsWith('+') ? phoneNumber : `+${phoneNumber}`;
    const whatsappTo = `whatsapp:${formattedPhone}`;
    const whatsappFrom = `whatsapp:${twilioPhoneNumber}`;

    // Use apodo, fallback to userName
    const displayName = apodo || userName || 'Usuario';
    const message = buildWelcomeMessage(displayName);

    const twilioUrl = `https://api.twilio.com/2010-04-01/Accounts/${twilioAccountSid}/Messages.json`;
    const auth = btoa(`${twilioAccountSid}:${twilioAuthToken}`);
    
    const contentSid = 'HX5a99e3d4a349260abbcf0acf12dd8ef0';
    
    const body = new URLSearchParams({
      From: whatsappFrom,
      To: whatsappTo,
      ContentSid: contentSid,
      ContentVariables: JSON.stringify({ "1": displayName }),
    });

    const response = await fetch(twilioUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${auth}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: body.toString(),
    });

    const data = await response.json();

    if (!response.ok) {
      console.error('Twilio error:', data);
      throw new Error(data.message || 'Failed to send WhatsApp message');
    }

    console.log('WhatsApp message sent successfully:', data.sid);

    return new Response(
      JSON.stringify({ 
        success: true, 
        messageSid: data.sid,
        message: 'WhatsApp welcome message sent successfully'
      }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );

  } catch (error: any) {
    console.error('Error in send-whatsapp-welcome function:', error);
    return new Response(
      JSON.stringify({ 
        error: error.message,
        details: 'Failed to send WhatsApp welcome message'
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
