import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { requestId } = await req.json();

    if (!requestId) {
      return new Response(
        JSON.stringify({ error: 'requestId es requerido' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Procesando solicitud de taxi:', requestId);

    // Obtener datos de la solicitud
    const { data: request, error: requestError } = await supabase
      .from('taxi_requests')
      .select('*')
      .eq('id', requestId)
      .single();

    if (requestError || !request) {
      console.error('Error obteniendo solicitud:', requestError);
      return new Response(
        JSON.stringify({ error: 'Solicitud no encontrada' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Obtener datos del conductor (driver)
    const { data: driverProfile, error: driverError } = await supabase
      .from('profiles')
      .select('nombre, telefono')
      .eq('user_id', request.driver_id)
      .single();

    if (driverError || !driverProfile?.telefono) {
      console.error('Error obteniendo perfil del conductor:', driverError);
      return new Response(
        JSON.stringify({ error: 'Conductor no tiene teléfono registrado' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Obtener datos del pasajero
    const { data: passengerProfile } = await supabase
      .from('profiles')
      .select('nombre, telefono')
      .eq('user_id', request.passenger_id)
      .single();

    const passengerName = passengerProfile?.nombre || 'Usuario';
    const passengerPhone = passengerProfile?.telefono || 'No registrado';

    // Formatear teléfono del conductor
    const normalizePhone = (phone: string): string => {
      let cleaned = phone.replace(/[^0-9]/g, '');
      if (cleaned.length === 10) {
        cleaned = '52' + cleaned;
      }
      return cleaned;
    };

    const driverPhone = normalizePhone(driverProfile.telefono);

    // Credenciales de Twilio
    const accountSid = Deno.env.get('TWILIO_ACCOUNT_SID');
    const authToken = Deno.env.get('TWILIO_AUTH_TOKEN');
    const twilioPhone = Deno.env.get('TWILIO_PHONE_NUMBER');

    if (!accountSid || !authToken || !twilioPhone) {
      console.error('Faltan credenciales de Twilio');
      return new Response(
        JSON.stringify({ error: 'Configuración de Twilio incompleta' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Construir mensaje para el conductor
    const pickupAddress = request.pickup_address || `${request.pickup_lat}, ${request.pickup_lng}`;
    const destAddress = request.destination_address || `${request.destination_lat}, ${request.destination_lng}`;

    const message = `🚖 *NUEVA SOLICITUD DE TAXI*

👤 Pasajero: ${passengerName}
📱 Teléfono: ${passengerPhone}

📍 *Recoger en:*
${pickupAddress}

🏁 *Destino:*
${destAddress}

📏 Distancia: ${request.distance_km.toFixed(2)} km
💰 Tarifa: $${request.tarifa_km.toFixed(2)}/km
💵 *Total: $${request.total_fare.toFixed(2)} MXN*

Abre la app para aceptar o rechazar.`;

    // Enviar WhatsApp via Twilio
    const twilioUrl = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`;
    const auth = btoa(`${accountSid}:${authToken}`);

    const formData = new URLSearchParams();
    formData.append('To', `whatsapp:+${driverPhone}`);
    formData.append('From', `whatsapp:${twilioPhone}`);
    formData.append('Body', message);

    console.log('Enviando WhatsApp a conductor:', driverPhone);

    const twilioResponse = await fetch(twilioUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${auth}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: formData.toString(),
    });

    const twilioResult = await twilioResponse.json();

    if (!twilioResponse.ok) {
      console.error('Error de Twilio:', twilioResult);
      return new Response(
        JSON.stringify({ error: 'Error enviando WhatsApp', details: twilioResult }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('WhatsApp enviado exitosamente:', twilioResult.sid);

    return new Response(
      JSON.stringify({ success: true, messageSid: twilioResult.sid }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: any) {
    console.error('Error en send-taxi-request-whatsapp:', error);
    return new Response(
      JSON.stringify({ error: error.message || 'Error interno' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
