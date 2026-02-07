import { useState, useEffect, useRef } from 'react';

interface GeoLocation {
  pais: string;       // ISO code e.g. "MX"
  estado: string;     // State/region name
  ciudad: string;     // City/municipality name
  latitude: number;
  longitude: number;
}

/**
 * Hook that detects the user's current city via GPS + Nominatim reverse geocoding.
 * Returns the resolved country, state and city based on the user's actual GPS position.
 */
export function useCurrentCity() {
  const [location, setLocation] = useState<GeoLocation | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const attemptedRef = useRef(false);

  useEffect(() => {
    if (attemptedRef.current) return;
    attemptedRef.current = true;

    if (!navigator.geolocation) {
      setError('Geolocalización no soportada');
      setLoading(false);
      return;
    }

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const { latitude, longitude } = position.coords;
        try {
          const response = await fetch(
            `https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}&zoom=10&addressdetails=1`,
            { headers: { 'Accept-Language': 'es' } }
          );
          const data = await response.json();
          const address = data.address || {};

          // Resolve country ISO code
          const countryCode = (address.country_code || 'mx').toUpperCase();

          // Resolve state - Nominatim uses "state" for Mexican states
          const estado = address.state || '';

          // Resolve city/municipality - Nominatim may use different fields
          // Priority: city > town > municipality > county > village
          const ciudad = address.city 
            || address.town 
            || address.municipality 
            || address.county 
            || address.village 
            || '';

          console.log('[useCurrentCity] Resolved location:', { countryCode, estado, ciudad, latitude, longitude, address });

          setLocation({
            pais: countryCode,
            estado,
            ciudad,
            latitude,
            longitude,
          });
        } catch (err) {
          console.error('[useCurrentCity] Reverse geocoding error:', err);
          setError('Error detectando ubicación');
        } finally {
          setLoading(false);
        }
      },
      (err) => {
        console.error('[useCurrentCity] GPS error:', err);
        setError('No se pudo obtener la ubicación GPS');
        setLoading(false);
      },
      {
        enableHighAccuracy: false,
        timeout: 10000,
        maximumAge: 300000, // Cache for 5 minutes
      }
    );
  }, []);

  return { location, loading, error };
}
