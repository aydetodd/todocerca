import { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { useRealtimeLocations } from '@/hooks/useRealtimeLocations';
import { supabase } from '@/integrations/supabase/client';
import { Button } from './ui/button';
import { Phone, MessageCircle } from 'lucide-react';

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
  const { locations, updateLocation } = useRealtimeLocations();

  // Get current user
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setCurrentUserId(data.user?.id || null);
    });
  }, []);

  // Initialize map with user's location
  useEffect(() => {
    if (!mapRef.current) {
      // Try to get user's current location
      if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
          (position) => {
            const map = L.map('map').setView(
              [position.coords.latitude, position.coords.longitude], 
              13
            );

            L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
              attribution: '© OpenStreetMap contributors'
            }).addTo(map);

            mapRef.current = map;
          },
          (error) => {
            console.error('Error getting location:', error);
            // Fallback to Querétaro if location access denied
            const map = L.map('map').setView([20.5937, -100.3929], 13);

            L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
              attribution: '© OpenStreetMap contributors'
            }).addTo(map);

            mapRef.current = map;
          }
        );
      } else {
        // Fallback if geolocation not supported
        const map = L.map('map').setView([20.5937, -100.3929], 13);

        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
          attribution: '© OpenStreetMap contributors'
        }).addTo(map);

        mapRef.current = map;
      }
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

  // Update markers
  useEffect(() => {
    if (!mapRef.current) return;

    // Clear old markers
    Object.values(markersRef.current).forEach(marker => marker.remove());
    markersRef.current = {};

    // Add new markers
    locations.forEach(location => {
      if (!location.profiles) return;

      const isCurrentUser = location.user_id === currentUserId;
      const estado = location.profiles.estado || 'offline';
      
      // Color based on status
      const colors = {
        available: '#22c55e', // green
        busy: '#eab308',      // yellow
        offline: '#ef4444'    // red
      };

      const iconHtml = `
        <div style="
          background-color: ${colors[estado]};
          width: ${isCurrentUser ? '30px' : '20px'};
          height: ${isCurrentUser ? '30px' : '20px'};
          border-radius: 50%;
          border: 3px solid white;
          box-shadow: 0 2px 4px rgba(0,0,0,0.3);
        "></div>
      `;

      const icon = L.divIcon({
        html: iconHtml,
        className: 'custom-marker',
        iconSize: [isCurrentUser ? 30 : 20, isCurrentUser ? 30 : 20]
      });

      const marker = L.marker([Number(location.latitude), Number(location.longitude)], { icon })
        .addTo(mapRef.current!);

      // Popup content
      const popupContent = `
        <div class="p-3 min-w-[200px]">
          <h3 class="font-bold text-lg mb-2">${location.profiles.apodo || 'Usuario'}</h3>
          <p class="text-sm mb-3">Estado: <span class="font-semibold" style="color: ${colors[estado]}">${estado}</span></p>
          <div class="flex gap-2">
            <button 
              onclick="window.makeCall('${location.profiles.telefono}')"
              class="flex-1 bg-blue-500 hover:bg-blue-600 text-white px-3 py-2 rounded text-sm flex items-center justify-center gap-1"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg>
              Llamar
            </button>
            <button 
              onclick="window.openWhatsApp('${location.profiles.telefono}')"
              class="flex-1 bg-green-500 hover:bg-green-600 text-white px-3 py-2 rounded text-sm flex items-center justify-center gap-1"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></svg>
              WhatsApp
            </button>
            <button 
              onclick="window.openInternalChat('${location.user_id}', '${location.profiles.apodo}')"
              class="flex-1 bg-amber-500 hover:bg-amber-600 text-white px-3 py-2 rounded text-sm flex items-center justify-center gap-1"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
              Mensaje
            </button>
          </div>
        </div>
      `;

      marker.bindPopup(popupContent, {
        closeButton: true,
        autoClose: false,
        closeOnClick: false,
        maxWidth: 300
      });
      markersRef.current[location.user_id] = marker;
    });
  }, [locations, currentUserId]);

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