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
  const { locations, updateLocation } = useRealtimeLocations();

  // Get current user
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setCurrentUserId(data.user?.id || null);
    });
  }, []);

  // Initialize map with user's location
  useEffect(() => {
    // Cleanup existing map if any
    if (mapRef.current) {
      mapRef.current.remove();
      mapRef.current = null;
    }
    
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

  // Update markers including current user
  useEffect(() => {
    if (!mapRef.current || !currentUserId) return;

    // Store old positions before updating
    const oldPositions = new Map<string, L.LatLng>();
    Object.entries(markersRef.current).forEach(([userId, marker]) => {
      oldPositions.set(userId, marker.getLatLng());
    });

    // Check if current user should be shown
    const currentUserLocation = locations.find(loc => loc.user_id === currentUserId);
    
    // Get current user's profile even if not in locations
    const addCurrentUserMarker = async () => {
      if (!currentUserLocation) {
        // Fetch current user's location and profile
        const { data: locationData } = await supabase
          .from('proveedor_locations')
          .select('*')
          .eq('user_id', currentUserId)
          .single();

        if (locationData) {
          const { data: profileData } = await supabase
            .from('profiles')
            .select('apodo, estado, telefono')
            .eq('user_id', currentUserId)
            .single();

          if (profileData) {
            // Add current user marker
            const estado = profileData.estado || 'offline';
            const colors = {
              available: '#22c55e',
              busy: '#eab308',
              offline: '#ef4444'
            };

            const iconHtml = `
              <svg width="30" height="30" viewBox="0 0 30 30" style="filter: drop-shadow(0 2px 4px rgba(0,0,0,0.3));">
                <path d="M15 2 L18 12 L28 15 L18 18 L15 28 L12 18 L2 15 L12 12 Z" 
                      fill="${colors[estado]}" 
                      stroke="white" 
                      stroke-width="2"/>
              </svg>
            `;

            const icon = L.divIcon({
              html: iconHtml,
              className: 'custom-marker',
              iconSize: [30, 30]
            });

            const marker = L.marker([Number(locationData.latitude), Number(locationData.longitude)], { icon })
              .addTo(mapRef.current!);

            const visibilityText = estado === 'offline' 
              ? 'No visible para otros' 
              : 'Visible para otros';
            const visibilityColor = estado === 'offline' ? '#ef4444' : '#22c55e';

            const popupContent = `
              <div class="p-3 min-w-[200px]">
                <h3 class="font-bold text-lg mb-2">${profileData.apodo || 'Usuario'}</h3>
                <p class="text-sm mb-2">Estado: <span class="font-semibold" style="color: ${colors[estado]}">${estado}</span></p>
                <p class="text-xs mb-2" style="color: ${visibilityColor}">
                  <strong>${visibilityText}</strong>
                </p>
                <p class="text-sm text-gray-500">Tu ubicación actual</p>
              </div>
            `;

            marker.bindPopup(popupContent, {
              closeButton: true,
              autoClose: false,
              closeOnClick: false,
              maxWidth: 300
            });

            markersRef.current[currentUserId] = marker;
          }
        }
      }
    };

    addCurrentUserMarker();

    // Add other users' markers
    locations.forEach(location => {
      if (!location.profiles) return;

      const isCurrentUser = location.user_id === currentUserId;
      const estado = location.profiles.estado || 'offline';
      const isTaxi = location.is_taxi;
      
      console.log('Location for', location.profiles.apodo, '- isTaxi:', isTaxi);
      
      // Color based on status
      const colors = {
        available: '#22c55e', // green
        busy: '#eab308',      // yellow
        offline: '#ef4444'    // red
      };

      let iconHtml: string;
      
      if (isTaxi) {
        // Taxi icon usando SVG directo (sin react-dom/server para evitar errores)
        const carIconSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="white" stroke="white" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
          <path d="M19 17h2c.6 0 1-.4 1-1v-3c0-.9-.7-1.7-1.5-1.9C18.7 10.6 16 10 16 10s-1.3-1.4-2.2-2.3c-.5-.4-1.1-.7-1.8-.7H5c-.6 0-1.1.4-1.4.9l-1.4 2.9A3.7 3.7 0 0 0 2 12v4c0 .6.4 1 1 1h2"/>
          <circle cx="7" cy="17" r="2"/>
          <path d="M9 17h6"/>
          <circle cx="17" cy="17" r="2"/>
        </svg>`;
        iconHtml = `
          <div style="
            background-color: ${colors[estado]};
            width: 32px;
            height: 32px;
            border-radius: 6px;
            border: 3px solid white;
            box-shadow: 0 3px 6px rgba(0,0,0,0.4);
            display: flex;
            align-items: center;
            justify-content: center;
            transform: rotate(0deg);
            transition: all 0.3s ease;
          ">
            ${carIconSvg}
          </div>
        `;
      } else if (isCurrentUser) {
        iconHtml = `
          <svg width="30" height="30" viewBox="0 0 30 30" style="filter: drop-shadow(0 2px 4px rgba(0,0,0,0.3));">
            <path d="M15 2 L18 12 L28 15 L18 18 L15 28 L12 18 L2 15 L12 12 Z" 
                  fill="${colors[estado]}" 
                  stroke="white" 
                  stroke-width="2"/>
          </svg>
        `;
      } else {
        iconHtml = `
          <div style="
            background-color: ${colors[estado]};
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
        iconSize: [isTaxi ? 32 : (isCurrentUser ? 30 : 20), isTaxi ? 32 : (isCurrentUser ? 30 : 20)]
      });

      // Check if marker exists and update it, or create new one
      const existingMarker = markersRef.current[location.user_id];
      const newLatLng = L.latLng(Number(location.latitude), Number(location.longitude));
      
      let marker: L.Marker;
      
      if (existingMarker && oldPositions.has(location.user_id)) {
        // Update existing marker with smooth animation
        marker = existingMarker;
        const oldLatLng = oldPositions.get(location.user_id)!;
        
        // Update icon in case status changed
        marker.setIcon(icon);
        
        // Only animate if position actually changed
        if (oldLatLng.lat !== newLatLng.lat || oldLatLng.lng !== newLatLng.lng) {
          const steps = 20;
          let currentStep = 0;
          const latDiff = (newLatLng.lat - oldLatLng.lat) / steps;
          const lngDiff = (newLatLng.lng - oldLatLng.lng) / steps;
          
          const animateMarker = () => {
            if (currentStep < steps) {
              currentStep++;
              const lat = oldLatLng.lat + (latDiff * currentStep);
              const lng = oldLatLng.lng + (lngDiff * currentStep);
              marker.setLatLng([lat, lng]);
              requestAnimationFrame(animateMarker);
            }
          };
          
          animateMarker();
        }
      } else {
        // Create new marker
        marker = L.marker(newLatLng, { 
          icon,
          draggable: false
        }).addTo(mapRef.current!);
      }

      // Popup content
      const visibilityText = isCurrentUser && estado === 'offline' 
        ? 'No visible para otros' 
        : isCurrentUser ? 'Visible para otros' : '';
      const visibilityColor = estado === 'offline' ? '#ef4444' : '#22c55e';

      const popupContent = `
        <div class="p-3 min-w-[200px]">
          <h3 class="font-bold text-lg mb-2">${location.profiles.apodo || 'Usuario'}${isTaxi ? ' 🚕' : ''}</h3>
          ${isTaxi ? '<p class="text-xs mb-2 text-blue-600 font-semibold">Servicio de Taxi</p>' : ''}
          <p class="text-sm mb-2">Estado: <span class="font-semibold" style="color: ${colors[estado]}">${estado}</span></p>
          ${isCurrentUser ? `
            <p class="text-xs mb-2" style="color: ${visibilityColor}">
              <strong>${visibilityText}</strong>
            </p>
          ` : ''}
          ${!isCurrentUser ? `
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

      // Open popup on click
      marker.on('click', () => {
        marker.openPopup();
      });

      markersRef.current[location.user_id] = marker;
    });
    
    // Remove markers for users no longer in locations
    Object.keys(markersRef.current).forEach(userId => {
      if (!locations.find(loc => loc.user_id === userId) && userId !== currentUserId) {
        markersRef.current[userId].remove();
        delete markersRef.current[userId];
      }
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