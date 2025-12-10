import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const flespiToken = Deno.env.get('FLESPI_TOKEN');

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Flespi sends data as JSON array of messages
    const messages = await req.json();
    console.log('[FLESPI WEBHOOK] Received messages:', JSON.stringify(messages).slice(0, 500));

    if (!Array.isArray(messages) || messages.length === 0) {
      console.log('[FLESPI WEBHOOK] No messages to process');
      return new Response(JSON.stringify({ processed: 0 }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    let processedCount = 0;

    for (const message of messages) {
      // Flespi message format includes ident (IMEI), position.latitude, position.longitude
      const imei = message.ident || message.device?.ident;
      const latitude = message['position.latitude'] || message.position?.latitude;
      const longitude = message['position.longitude'] || message.position?.longitude;
      const speed = message['position.speed'] || message.position?.speed;
      const altitude = message['position.altitude'] || message.position?.altitude;
      const course = message['position.direction'] || message.position?.direction;
      const batteryLevel = message['battery.level'] || message.battery?.level;

      if (!imei || latitude === undefined || longitude === undefined) {
        console.log('[FLESPI WEBHOOK] Skipping message - missing data:', { imei, latitude, longitude });
        continue;
      }

      console.log('[FLESPI WEBHOOK] Processing tracker:', imei, 'at', latitude, longitude);

      // Find the tracker by IMEI
      const { data: tracker, error: trackerError } = await supabase
        .from('gps_trackers')
        .select('id, group_id')
        .eq('imei', imei)
        .eq('is_active', true)
        .maybeSingle();

      if (trackerError) {
        console.error('[FLESPI WEBHOOK] Error finding tracker:', trackerError);
        continue;
      }

      if (!tracker) {
        console.log('[FLESPI WEBHOOK] Tracker not registered:', imei);
        continue;
      }

      // Update tracker last_seen and battery
      const updateData: Record<string, any> = {
        last_seen: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      
      if (batteryLevel !== undefined) {
        updateData.battery_level = Math.round(batteryLevel);
      }

      await supabase
        .from('gps_trackers')
        .update(updateData)
        .eq('id', tracker.id);

      // Upsert location (keep only latest)
      const locationData = {
        tracker_id: tracker.id,
        latitude,
        longitude,
        speed: speed || null,
        altitude: altitude || null,
        course: course || null,
        updated_at: new Date().toISOString(),
      };

      const { error: locationError } = await supabase
        .from('gps_tracker_locations')
        .upsert(locationData, { 
          onConflict: 'tracker_id',
          ignoreDuplicates: false 
        });

      if (locationError) {
        console.error('[FLESPI WEBHOOK] Error upserting location:', locationError);
        continue;
      }

      processedCount++;
      console.log('[FLESPI WEBHOOK] ✅ Updated tracker:', imei);
    }

    console.log('[FLESPI WEBHOOK] Processed', processedCount, 'of', messages.length, 'messages');

    return new Response(JSON.stringify({ processed: processedCount }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error: any) {
    console.error('[FLESPI WEBHOOK] Error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
