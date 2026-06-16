import { useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";

/**
 * Hook que envía la ubicación del chofer al edge function `trip-geofence-tick`
 * cada 15 segundos para que cierre / abra viajes automáticamente al cruzar
 * el radio de los puntos A y B configurados por el concesionario.
 *
 * No hace nada si no hay `unidadId`.
 */
export function useAutoTripGeofence(unidadId: string | null | undefined, active: boolean) {
  const lastSentRef = useRef(0);

  useEffect(() => {
    if (!unidadId || !active) return;
    if (!navigator.geolocation) return;

    let cancelled = false;

    const send = async (lat: number, lng: number) => {
      try {
        await supabase.functions.invoke("trip-geofence-tick", {
          body: { unidad_id: unidadId, lat, lng },
        });
      } catch (err) {
        console.warn("[useAutoTripGeofence] tick error", err);
      }
    };

    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        if (cancelled) return;
        const now = Date.now();
        // Limitar a 1 tick cada 15 s para no quemar invocaciones
        if (now - lastSentRef.current < 15000) return;
        lastSentRef.current = now;
        send(pos.coords.latitude, pos.coords.longitude);
      },
      (err) => console.warn("[useAutoTripGeofence] geolocation error", err),
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 20000 },
    );

    return () => {
      cancelled = true;
      navigator.geolocation.clearWatch(watchId);
    };
  }, [unidadId, active]);
}
