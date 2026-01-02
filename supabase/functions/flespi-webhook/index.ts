import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

interface TrackerData {
  id: string;
  group_id: string;
  imei: string;
  battery_level: number | null;
  ignition: boolean | null;
  engine_blocked: boolean | null;
}

interface TrackerSettings {
  speed_limit_kmh: number;
  speed_alert_enabled: boolean;
  low_battery_threshold: number;
  battery_alert_enabled: boolean;
  power_cut_alert_enabled: boolean;
  ignition_alert_enabled: boolean;
}

interface GeofenceData {
  id: string;
  name: string;
  fence_type: string;
  center_lat: number | null;
  center_lng: number | null;
  radius_meters: number | null;
  polygon_points: any;
  alert_on_enter: boolean;
  alert_on_exit: boolean;
  tracker_geofence_id: string;
  is_inside: boolean | null;
}

// Haversine distance in meters
function haversineDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000; // Earth radius in meters
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = 
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

// Check if point is inside circle geofence
function isInsideCircle(lat: number, lng: number, centerLat: number, centerLng: number, radiusMeters: number): boolean {
  const distance = haversineDistance(lat, lng, centerLat, centerLng);
  return distance <= radiusMeters;
}

// Check if point is inside polygon (ray casting algorithm)
function isInsidePolygon(lat: number, lng: number, polygon: Array<{lat: number, lng: number}>): boolean {
  if (!polygon || polygon.length < 3) return false;
  
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].lng, yi = polygon[i].lat;
    const xj = polygon[j].lng, yj = polygon[j].lat;
    
    if (((yi > lat) !== (yj > lat)) && (lng < (xj - xi) * (lat - yi) / (yj - yi) + xi)) {
      inside = !inside;
    }
  }
  return inside;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const payload = await req.json();

    const messages = Array.isArray(payload)
      ? payload
      : (payload?.messages ?? payload?.data ?? payload?.items ?? (payload ? [payload] : []));

    console.log('[FLESPI WEBHOOK] Received', messages.length, 'messages');

    if (!Array.isArray(messages) || messages.length === 0) {
      return new Response(JSON.stringify({ processed: 0 }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    let processedCount = 0;

    for (const message of messages) {
      try {
        // Extract IMEI
        const imeiRaw =
          message?.ident ??
          message?.device?.ident ??
          message?.device?.imei ??
          message?.['device.ident'] ??
          message?.['device.imei'];
        const imei = imeiRaw != null ? String(imeiRaw).trim() : null;

        if (!imei) {
          console.log('[FLESPI] Skip - no IMEI');
          continue;
        }

        // Helper to convert to number or null
        const toNum = (v: unknown): number | null => {
          const n = Number(v);
          return Number.isFinite(n) ? n : null;
        };

        // Helper to convert to boolean or null
        const toBool = (v: unknown): boolean | null => {
          if (v === true || v === 1 || v === '1') return true;
          if (v === false || v === 0 || v === '0') return false;
          return null;
        };

        // Extract all available data from Flespi message
        const latitude = toNum(message?.['position.latitude'] ?? message?.position?.latitude);
        const longitude = toNum(message?.['position.longitude'] ?? message?.position?.longitude);
        const speed = toNum(message?.['position.speed'] ?? message?.position?.speed);
        const altitude = toNum(message?.['position.altitude'] ?? message?.position?.altitude);
        const course = toNum(message?.['position.direction'] ?? message?.position?.direction ?? message?.['position.course']);
        
        // Battery and power
        const batteryLevel = toNum(message?.['battery.level'] ?? message?.battery?.level ?? message?.['device.battery.level']);
        const externalVoltage = toNum(message?.['external.powersource.voltage'] ?? message?.['power.voltage'] ?? message?.['device.power.voltage']);
        
        // Engine and ignition
        const ignition = toBool(message?.['engine.ignition.status'] ?? message?.['din.1'] ?? message?.ignition);
        
        // Odometer (some trackers send in meters, some in km)
        let odometer = toNum(message?.['vehicle.mileage'] ?? message?.['position.mileage'] ?? message?.mileage);
        if (odometer && odometer > 1000000) {
          odometer = odometer / 1000; // Convert meters to km if very large
        }
        
        // GSM signal and satellites
        const gsmSignal = toNum(message?.['gsm.signal.level'] ?? message?.['gsm.signal.dbm']);
        const satellites = toNum(message?.['position.satellites'] ?? message?.satellites);
        const hdop = toNum(message?.['position.hdop']);
        
        // Fuel level (percentage or liters depending on tracker)
        const fuelLevel = toNum(message?.['fuel.level'] ?? message?.['can.fuel.level']);

        // Timestamp from message or current time
        const messageTimestamp = message?.timestamp ?? message?.['server.timestamp'];
        const timestamp = messageTimestamp 
          ? new Date(messageTimestamp * 1000).toISOString() 
          : new Date().toISOString();

        // Find the tracker
        const { data: tracker, error: trackerError } = await supabase
          .from('gps_trackers')
          .select('id, group_id, imei, battery_level, ignition, engine_blocked')
          .eq('imei', imei)
          .eq('is_active', true)
          .maybeSingle();

        if (trackerError || !tracker) {
          console.log('[FLESPI] Tracker not found:', imei);
          continue;
        }

        const typedTracker = tracker as TrackerData;
        const previousIgnition = typedTracker.ignition;
        const previousBattery = typedTracker.battery_level;

        // Update tracker with all available data
        const trackerUpdate: Record<string, any> = {
          last_seen: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };

        if (batteryLevel !== null) trackerUpdate.battery_level = Math.round(batteryLevel);
        if (ignition !== null) trackerUpdate.ignition = ignition;
        if (odometer !== null) trackerUpdate.odometer = odometer;
        if (externalVoltage !== null) trackerUpdate.external_voltage = externalVoltage;
        if (gsmSignal !== null) trackerUpdate.gsm_signal = gsmSignal;
        if (satellites !== null) trackerUpdate.satellites = satellites;

        await supabase
          .from('gps_trackers')
          .update(trackerUpdate)
          .eq('id', typedTracker.id);

        // Update current location (upsert)
        if (latitude !== null && longitude !== null) {
          const locationData: Record<string, any> = {
            tracker_id: typedTracker.id,
            latitude,
            longitude,
            speed: speed ?? null,
            altitude: altitude ?? null,
            course: course ?? null,
            updated_at: new Date().toISOString(),
          };

          if (ignition !== null) locationData.ignition = ignition;
          if (odometer !== null) locationData.odometer = odometer;
          if (externalVoltage !== null) locationData.external_voltage = externalVoltage;
          if (gsmSignal !== null) locationData.gsm_signal = gsmSignal;
          if (satellites !== null) locationData.satellites = satellites;

          await supabase
            .from('gps_tracker_locations')
            .upsert(locationData, { onConflict: 'tracker_id' });

          // Save to history
          const historyData: Record<string, any> = {
            tracker_id: typedTracker.id,
            latitude,
            longitude,
            speed,
            altitude,
            course,
            ignition,
            odometer,
            fuel_level: fuelLevel,
            external_voltage: externalVoltage,
            gsm_signal: gsmSignal,
            satellites,
            hdop,
            timestamp,
          };

          await supabase.from('gps_tracker_history').insert(historyData);
        }

        // Get tracker settings for alerts
        const { data: settings } = await supabase
          .from('gps_tracker_settings')
          .select('*')
          .eq('tracker_id', typedTracker.id)
          .maybeSingle();

        const typedSettings = settings as TrackerSettings | null;

        // === GENERATE ALERTS ===
        const alerts: Array<{
          tracker_id: string;
          group_id: string;
          alert_type: string;
          title: string;
          message: string;
          latitude?: number;
          longitude?: number;
          speed?: number;
          geofence_id?: string;
        }> = [];

        // Speed alert
        if (typedSettings?.speed_alert_enabled && speed !== null) {
          const speedLimit = typedSettings.speed_limit_kmh || 120;
          if (speed > speedLimit) {
            alerts.push({
              tracker_id: typedTracker.id,
              group_id: typedTracker.group_id,
              alert_type: 'speed_limit',
              title: `Exceso de velocidad: ${speed.toFixed(0)} km/h`,
              message: `El dispositivo superó el límite de ${speedLimit} km/h`,
              latitude: latitude ?? undefined,
              longitude: longitude ?? undefined,
              speed,
            });
          }
        }

        // Low battery alert
        if (typedSettings?.battery_alert_enabled && batteryLevel !== null) {
          const threshold = typedSettings.low_battery_threshold || 20;
          if (batteryLevel <= threshold && (previousBattery === null || previousBattery > threshold)) {
            alerts.push({
              tracker_id: typedTracker.id,
              group_id: typedTracker.group_id,
              alert_type: 'low_battery',
              title: `Batería baja: ${batteryLevel}%`,
              message: `La batería del dispositivo está por debajo del ${threshold}%`,
              latitude: latitude ?? undefined,
              longitude: longitude ?? undefined,
            });
          }
        }

        // Power cut alert (external voltage dropped to 0 or very low)
        if (typedSettings?.power_cut_alert_enabled && externalVoltage !== null && externalVoltage < 1) {
          alerts.push({
            tracker_id: typedTracker.id,
            group_id: typedTracker.group_id,
            alert_type: 'power_cut',
            title: 'Corte de energía detectado',
            message: 'Se ha desconectado la alimentación externa del dispositivo',
            latitude: latitude ?? undefined,
            longitude: longitude ?? undefined,
          });
        }

        // Ignition alerts
        if (typedSettings?.ignition_alert_enabled && ignition !== null && previousIgnition !== null && ignition !== previousIgnition) {
          alerts.push({
            tracker_id: typedTracker.id,
            group_id: typedTracker.group_id,
            alert_type: ignition ? 'ignition_on' : 'ignition_off',
            title: ignition ? 'Motor encendido' : 'Motor apagado',
            message: ignition ? 'El vehículo ha sido encendido' : 'El vehículo ha sido apagado',
            latitude: latitude ?? undefined,
            longitude: longitude ?? undefined,
          });
        }

        // === GEOFENCE CHECKING ===
        if (latitude !== null && longitude !== null) {
          const { data: geofences } = await supabase
            .from('gps_tracker_geofences')
            .select(`
              id,
              is_inside,
              geofence:gps_geofences (
                id,
                name,
                fence_type,
                center_lat,
                center_lng,
                radius_meters,
                polygon_points,
                alert_on_enter,
                alert_on_exit,
                is_active
              )
            `)
            .eq('tracker_id', typedTracker.id);

          if (geofences) {
            for (const tg of geofences) {
              const geofence = tg.geofence as any;
              if (!geofence || !geofence.is_active) continue;

              let isInside = false;

              if (geofence.fence_type === 'circle' && geofence.center_lat && geofence.center_lng && geofence.radius_meters) {
                isInside = isInsideCircle(latitude, longitude, geofence.center_lat, geofence.center_lng, geofence.radius_meters);
              } else if (geofence.fence_type === 'polygon' && geofence.polygon_points) {
                isInside = isInsidePolygon(latitude, longitude, geofence.polygon_points);
              }

              const wasInside = tg.is_inside;

              // Update tracker-geofence status
              await supabase
                .from('gps_tracker_geofences')
                .update({ is_inside: isInside, last_checked_at: new Date().toISOString() })
                .eq('id', tg.id);

              // Generate alert if status changed
              if (wasInside !== null && isInside !== wasInside) {
                if (isInside && geofence.alert_on_enter) {
                  alerts.push({
                    tracker_id: typedTracker.id,
                    group_id: typedTracker.group_id,
                    alert_type: 'geofence_enter',
                    title: `Entrada a geocerca: ${geofence.name}`,
                    message: `El dispositivo entró a la zona "${geofence.name}"`,
                    latitude,
                    longitude,
                    geofence_id: geofence.id,
                  });
                } else if (!isInside && geofence.alert_on_exit) {
                  alerts.push({
                    tracker_id: typedTracker.id,
                    group_id: typedTracker.group_id,
                    alert_type: 'geofence_exit',
                    title: `Salida de geocerca: ${geofence.name}`,
                    message: `El dispositivo salió de la zona "${geofence.name}"`,
                    latitude,
                    longitude,
                    geofence_id: geofence.id,
                  });
                }
              }
            }
          }
        }

        // Insert all alerts
        if (alerts.length > 0) {
          const { error: alertError } = await supabase.from('gps_alerts').insert(alerts);
          if (alertError) {
            console.error('[FLESPI] Error inserting alerts:', alertError);
          } else {
            console.log('[FLESPI] Created', alerts.length, 'alerts for', imei);
          }
        }

        processedCount++;
        console.log('[FLESPI] ✅ Processed:', imei, '| Speed:', speed, '| Ignition:', ignition, '| Battery:', batteryLevel);

      } catch (msgError) {
        console.error('[FLESPI] Error processing message:', msgError);
      }
    }

    console.log('[FLESPI] Processed', processedCount, 'of', messages.length);

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
