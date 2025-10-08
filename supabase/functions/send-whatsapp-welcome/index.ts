import { serve } from "https://deno.land/std@0.190.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface WhatsAppRequest {
  phoneNumber: string;
  userName: string;
  userType: 'cliente' | 'proveedor';
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { phoneNumber, userName, userType }: WhatsAppRequest = await req.json();
    
    console.log('Sending WhatsApp welcome message to:', phoneNumber);

    const twilioAccountSid = Deno.env.get('TWILIO_ACCOUNT_SID');
    const twilioAuthToken = Deno.env.get('TWILIO_AUTH_TOKEN');
    const twilioPhoneNumber = Deno.env.get('TWILIO_PHONE_NUMBER');

    if (!twilioAccountSid || !twilioAuthToken || !twilioPhoneNumber) {
      throw new Error('Twilio credentials not configured');
    }

    // Format phone number for WhatsApp (must include country code)
    // Phone number should already include country code from PhoneInput component
    const formattedPhone = phoneNumber.startsWith('+') ? phoneNumber : `+${phoneNumber}`;
    const whatsappTo = `whatsapp:${formattedPhone}`;
    const whatsappFrom = `whatsapp:${twilioPhoneNumber}`;

    // Personalized message based on user type
    const message = userType === 'proveedor' 
      ? `¡Hola ${userName}! 🎉\n\n¡Bienvenido a TodoCerca!\n\nGracias por unirte como proveedor. Estamos emocionados de tenerte en nuestra comunidad.\n\nAhora podrás:\n✅ Ofrecer tus productos y servicios\n✅ Conectar con clientes cercanos\n✅ Hacer crecer tu negocio\n\n¡Éxito en tu nueva aventura con TodoCerca! 🚀`
      : `¡Hola ${userName}! 👋\n\n¡Bienvenido a TodoCerca!\n\nGracias por registrarte. Ahora puedes:\n✅ Descubrir productos y servicios cerca de ti\n✅ Conectar con proveedores locales\n✅ Disfrutar de la mejor experiencia\n\n¡Estamos para ayudarte! 🌟`;

    // Send WhatsApp message via Twilio
    const twilioUrl = `https://api.twilio.com/2010-04-01/Accounts/${twilioAccountSid}/Messages.json`;
    
    const auth = btoa(`${twilioAccountSid}:${twilioAuthToken}`);
    
    const body = new URLSearchParams({
      From: whatsappFrom,
      To: whatsappTo,
      Body: message,
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
