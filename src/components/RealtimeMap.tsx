import { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { useRealtimeLocations } from '@/hooks/useRealtimeLocations';
import { supabase } from '@/integrations/supabase/client';
import { Button } from './ui/button';
import { Phone, MessageCircle } from 'lucide-react';
// Removed react-dom/server import - using plain SVG instead

// Fix Leaflet icon issue
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

interface RealtimeMapProps {
  onOpenChat: (userId: string, apodo: string) => void;
}

export const RealtimeMap = ({ onOpenChat }: RealtimeMapProps) => {
  const mapRef = useRef<L.Map | null>(null);
  const markersRef = useRef<{ [key: string]: L.Marker }>({});
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const { locations, loading, initialLoadDone, updateLocation } = useRealtimeLocations();

  // Get current user
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setCurrentUserId(data.user?.id || null);
    });
  }, []);

  // Initialize map with user's location
  useEffect(() => {
    // Prevent double initialization
    if (mapRef.current) {
      console.log('🗺️ Map already initialized, skipping');
      return;
    }
    
    // Try to get user's current location
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const map = L.map('map', { attributionControl: false }).setView(
            [position.coords.latitude, position.coords.longitude], 
            13
          );

          L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(map);

          mapRef.current = map;
        },
        (error) => {
          console.error('Error getting location:', error);
          // Fallback to Querétaro if location access denied
          const map = L.map('map', { attributionControl: false }).setView([20.5937, -100.3929], 13);

          L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(map);

          mapRef.current = map;
        }
      );
    } else {
      // Fallback if geolocation not supported
      const map = L.map('map', { attributionControl: false }).setView([20.5937, -100.3929], 13);

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(map);

      mapRef.current = map;
    }

    return () => {
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, []);

  // Update location every 5 seconds
  useEffect(() => {
    if (!currentUserId) return;

    const updateUserLocation = () => {
      if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
          (position) => {
            updateLocation(position.coords.latitude, position.coords.longitude);
          },
          (error) => {
            console.error('Error getting location:', error);
          }
        );
      }
    };

    updateUserLocation();
    const interval = setInterval(updateUserLocation, 5000);

    return () => clearInterval(interval);
  }, [currentUserId, updateLocation]);

  // Update markers - SOLO cuando initialLoadDone sea true
  useEffect(() => {
    if (!mapRef.current) return;
    
    // No mostrar markers hasta que la carga inicial esté lista
    if (!initialLoadDone) {
      console.log('⏳ [Map] Waiting for initial load...');
      return;
    }

    console.log('🗺️ [Map] Updating', locations.length, 'markers (initial load done)');
    
    // Primero: remover TODOS los markers que ya no están en locations
    const currentLocationUserIds = new Set(locations.map(loc => loc.user_id));
    Object.keys(markersRef.current).forEach(userId => {
      if (!currentLocationUserIds.has(userId)) {
        console.log(`🗑️ [Map] Removing marker for ${userId} (no longer in locations)`);
        markersRef.current[userId].remove();
        delete markersRef.current[userId];
      }
    });

    // Status colors
    const statusColors: Record<string, string> = {
      available: '#22c55e', // green
      busy: '#eab308',      // yellow  
      offline: '#ef4444'    // red - pero no debería llegar aquí porque se filtra antes
    };

    // Taxi colors based on status
    const taxiColors: Record<string, { body: string; roof: string }> = {
      available: { body: '#22c55e', roof: '#16a34a' }, // green
      busy: { body: '#eab308', roof: '#d4a106' },      // yellow
      offline: { body: '#ef4444', roof: '#dc2626' }    // red
    };

    // Add/update markers for each location
    locations.forEach(location => {
      if (!location.profiles || !location.profiles.estado) {
        console.warn('⚠️ [Map] Missing profile/estado for', location.user_id);
        return;
      }

      const { apodo, estado, telefono } = location.profiles;
      const isCurrentUser = location.user_id === currentUserId;
      const isTaxi = location.is_taxi;
      const color = statusColors[estado];
      
      console.log(`🚕 [Map] ${apodo}: estado=${estado}, color=${color}, isTaxi=${isTaxi}`);
      
      // Remover marker existente para recrear con nuevo color
      if (markersRef.current[location.user_id]) {
        markersRef.current[location.user_id].remove();
        delete markersRef.current[location.user_id];
      }

      let iconHtml: string;
      
      if (isTaxi) {
        const taxiColor = taxiColors[estado];
        iconHtml = `
          <div style="filter: drop-shadow(0 4px 6px rgba(0,0,0,0.3));">
            <svg width="32" height="48" viewBox="0 0 32 48" xmlns="http://www.w3.org/2000/svg">
              <ellipse cx="16" cy="44" rx="12" ry="3" fill="rgba(0,0,0,0.25)"/>
              <ellipse cx="8" cy="34" rx="3" ry="4" fill="#1a1a1a"/>
              <ellipse cx="24" cy="34" rx="3" ry="4" fill="#1a1a1a"/>
              <path d="M 9 12 L 9 36 Q 9 38 11 38 L 21 38 Q 23 38 23 36 L 23 12 Q 23 10 21 10 L 11 10 Q 9 10 9 12 Z" 
                    fill="${taxiColor.body}" stroke="#333" stroke-width="0.6"/>
              <ellipse cx="8" cy="18" rx="3" ry="4" fill="#1a1a1a"/>
              <ellipse cx="24" cy="18" rx="3" ry="4" fill="#1a1a1a"/>
              <rect x="10" y="20" width="12" height="10" rx="1.5" fill="${taxiColor.roof}"/>
              <rect x="9.5" y="21" width="2" height="8" rx="0.3" fill="#4A90E2" opacity="0.6"/>
              <rect x="20.5" y="21" width="2" height="8" rx="0.3" fill="#4A90E2" opacity="0.6"/>
              <path d="M 11 13 L 11 16 L 21 16 L 21 13 Q 16 11.5 11 13 Z" fill="#4A90E2" opacity="0.7"/>
              <text x="16" y="26" font-family="Arial" font-size="5" font-weight="bold" fill="#333" text-anchor="middle">TAXI</text>
              <circle cx="11" cy="12" r="1.2" fill="#FFF"/>
              <circle cx="21" cy="12" r="1.2" fill="#FFF"/>
              <circle cx="11" cy="36" r="1" fill="#FF4444"/>
              <circle cx="21" cy="36" r="1" fill="#FF4444"/>
            </svg>
          </div>
        `;
      } else if (isCurrentUser) {
        iconHtml = `
          <svg width="30" height="30" viewBox="0 0 30 30" style="filter: drop-shadow(0 2px 4px rgba(0,0,0,0.3));">
            <path d="M15 2 L18 12 L28 15 L18 18 L15 28 L12 18 L2 15 L12 12 Z" 
                  fill="${color}" stroke="white" stroke-width="2"/>
          </svg>
        `;
      } else {
        iconHtml = `
          <div style="
            background-color: ${color};
            width: 20px;
            height: 20px;
            border-radius: 50%;
            border: 3px solid white;
            box-shadow: 0 2px 4px rgba(0,0,0,0.3);
          "></div>
        `;
      }

      const icon = L.divIcon({
        html: iconHtml,
        className: 'custom-marker',
        iconSize: [isTaxi ? 32 : (isCurrentUser ? 30 : 20), isTaxi ? 48 : (isCurrentUser ? 30 : 20)],
        iconAnchor: [isTaxi ? 16 : (isCurrentUser ? 15 : 10), isTaxi ? 24 : (isCurrentUser ? 15 : 10)]
      });

      const newLatLng = L.latLng(Number(location.latitude), Number(location.longitude));
      const marker = L.marker(newLatLng, { icon }).addTo(mapRef.current!);

      const visibilityText = isCurrentUser && estado === 'offline' 
        ? 'No visible para otros' 
        : isCurrentUser ? 'Visible para otros' : '';
      const visibilityColor = estado === 'offline' ? '#ef4444' : '#22c55e';

      const popupContent = `
        <div class="p-3 min-w-[200px]">
          <h3 class="font-bold text-lg mb-2">${apodo || 'Usuario'}${isTaxi ? ' 🚕' : ''}</h3>
          ${isTaxi ? '<p class="text-xs mb-2 text-blue-600 font-semibold">Servicio de Taxi</p>' : ''}
          <p class="text-sm mb-2">Estado: <span class="font-semibold" style="color: ${color}">${estado}</span></p>
          ${isCurrentUser ? `
            <p class="text-xs mb-2" style="color: ${visibilityColor}">
              <strong>${visibilityText}</strong>
            </p>
          ` : ''}
          ${!isCurrentUser ? `
          <div class="flex gap-2">
            <button 
              onclick='window.makeCall(${JSON.stringify(telefono || "")})'
              class="flex-1 bg-blue-500 hover:bg-blue-600 text-white px-3 py-2 rounded text-sm flex items-center justify-center gap-1"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg>
              Llamar
            </button>
            <button 
              onclick='window.openWhatsApp(${JSON.stringify(telefono || "")})'
              class="flex-1 bg-green-500 hover:bg-green-600 text-white px-3 py-2 rounded text-sm flex items-center justify-center gap-1"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></svg>
              WhatsApp
            </button>
            <button 
              onclick='window.openInternalChat(${JSON.stringify(location.user_id)}, ${JSON.stringify(apodo || "Usuario")})'
              class="flex-1 bg-blue-600 hover:bg-blue-700 text-white px-3 py-2 rounded text-sm flex items-center justify-center gap-1"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
              Mensaje
            </button>
          </div>
          ` : `<p class="text-sm text-gray-500">Tu ubicación actual</p>`}
        </div>
      `;

      marker.bindPopup(popupContent, {
        closeButton: true,
        autoClose: false,
        closeOnClick: false,
        maxWidth: 300
      });

      marker.on('click', () => {
        marker.openPopup();
      });

      markersRef.current[location.user_id] = marker;
    });
  }, [locations, currentUserId, initialLoadDone]);

  // Add global functions for popup buttons
  useEffect(() => {
    (window as any).makeCall = (phone: string) => {
      window.location.href = `tel:${phone}`;
    };

    (window as any).openWhatsApp = (phone: string) => {
      window.open(`https://wa.me/${phone}`, '_blank');
    };

    (window as any).openInternalChat = (userId: string, apodo: string) => {
      onOpenChat(userId, apodo);
    };
  }, [onOpenChat]);

  return (
    <div id="map" className="w-full h-[calc(100vh-120px)]"></div>
  );
};