import { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { useRealtimeLocations } from '@/hooks/useRealtimeLocations';
import { supabase } from '@/integrations/supabase/client';
import { Button } from './ui/button';
import TaxiRequestModal from './TaxiRequestModal';
import { toast } from 'sonner';

// Fix Leaflet icon issue
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

interface TaxiDriver {
  user_id: string;
  business_name: string;
  latitude: number;
  longitude: number;
  tarifa_km?: number;
}

interface RealtimeMapProps {
  onOpenChat: (userId: string, apodo: string) => void;
  filterType?: 'taxi' | 'ruta' | null;
  privateRouteUserId?: string | null;
}

export const RealtimeMap = ({ onOpenChat, filterType, privateRouteUserId }: RealtimeMapProps) => {
  const mapRef = useRef<L.Map | null>(null);
  const markersRef = useRef<{ [key: string]: L.Marker }>({});
  const markerStatesRef = useRef<{ [key: string]: string }>({}); // Track estado for each marker
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const { locations, loading, initialLoadDone, updateLocation } = useRealtimeLocations();
  
  // Taxi request modal state
  const [showTaxiModal, setShowTaxiModal] = useState(false);
  const [selectedTaxiDriver, setSelectedTaxiDriver] = useState<TaxiDriver | null>(null);

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

    // Filter locations based on filterType
    let filteredLocations = locations;
    
    // If viewing a private route, only show that specific provider
    if (privateRouteUserId) {
      filteredLocations = locations.filter(loc => loc.user_id === privateRouteUserId);
      console.log('🔒 [Map] Filtering to show only private route provider:', filteredLocations.length);
    } else if (filterType === 'taxi') {
      filteredLocations = locations.filter(loc => loc.is_taxi === true);
      console.log('🚕 [Map] Filtering to show only taxis:', filteredLocations.length);
    } else if (filterType === 'ruta') {
      filteredLocations = locations.filter(loc => loc.is_bus === true);
      console.log('🚌 [Map] Filtering to show only rutas:', filteredLocations.length);
    }

    console.log('🗺️ [Map] Updating', filteredLocations.length, 'markers (initial load done)');
    
    // Primero: remover TODOS los markers que ya no están en filteredLocations
    const currentLocationUserIds = new Set(filteredLocations.map(loc => loc.user_id));
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
    filteredLocations.forEach(location => {
      if (!location.profiles || !location.profiles.estado) {
        console.warn('⚠️ [Map] Missing profile/estado for', location.user_id);
        return;
      }

      const { apodo, estado, telefono } = location.profiles;
      const isCurrentUser = location.user_id === currentUserId;
      const isTaxi = location.is_taxi;
      const isBus = location.is_bus;
      const isPrivateDriver = location.is_private_driver;
      const color = statusColors[estado];
      
      const newLatLng = L.latLng(Number(location.latitude), Number(location.longitude));
      const existingMarker = markersRef.current[location.user_id];
      const previousEstado = markerStatesRef.current[location.user_id];
      
      // If marker exists and estado hasn't changed, just update position (keeps popup open)
      if (existingMarker && previousEstado === estado) {
        existingMarker.setLatLng(newLatLng);
        return;
      }
      
      console.log(`🚕 [Map] ${apodo}: estado=${estado}, color=${color}, isTaxi=${isTaxi}, isBus=${isBus}, recreating=${!!existingMarker}`);
      
      // Remover marker existente solo si el estado cambió
      if (existingMarker) {
        existingMarker.remove();
        delete markersRef.current[location.user_id];
      }
      
      // Track the new estado
      markerStatesRef.current[location.user_id] = estado;

      let iconHtml: string;
      let iconSize: [number, number];
      let iconAnchor: [number, number];
      
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
        iconSize = [32, 48];
        iconAnchor = [16, 24];
      } else if (isBus) {
        // Bus icon — yellow for ALL private routes (drivers AND owners), white for public
        const isPrivateRoute = location.is_private_route;
        const busBodyColor = isPrivateRoute ? '#FDB813' : '#FFFFFF';
        const busStrokeColor = isPrivateRoute ? '#D4960A' : '#999999';
        const busLabel = location.profiles.route_name || (isPrivateDriver ? 'PRIV' : 'RUTA');
        const labelTruncated = busLabel.length > 6 ? busLabel.substring(0, 6) : busLabel;
        iconHtml = `
          <div style="filter: drop-shadow(0 4px 6px rgba(0,0,0,0.3));">
            <svg width="32" height="52" viewBox="0 0 36 80" xmlns="http://www.w3.org/2000/svg">
              <ellipse cx="18" cy="76" rx="14" ry="3" fill="rgba(0,0,0,0.25)"/>
              <ellipse cx="7" cy="66" rx="4" ry="5" fill="#1a1a1a" stroke="#333" stroke-width="0.6"/>
              <ellipse cx="7" cy="66" rx="2" ry="3" fill="#4a4a4a"/>
              <ellipse cx="29" cy="66" rx="4" ry="5" fill="#1a1a1a" stroke="#333" stroke-width="0.6"/>
              <ellipse cx="29" cy="66" rx="2" ry="3" fill="#4a4a4a"/>
              <rect x="5" y="8" width="26" height="64" rx="4" fill="#1a1a1a" stroke="#333" stroke-width="1"/>
              <ellipse cx="7" cy="18" rx="4" ry="5" fill="#1a1a1a" stroke="#333" stroke-width="0.6"/>
              <ellipse cx="7" cy="18" rx="2" ry="3" fill="#4a4a4a"/>
              <ellipse cx="29" cy="18" rx="4" ry="5" fill="#1a1a1a" stroke="#333" stroke-width="0.6"/>
              <ellipse cx="29" cy="18" rx="2" ry="3" fill="#4a4a4a"/>
              <rect x="9" y="10" width="18" height="56" rx="2" fill="${busBodyColor}" stroke="${busStrokeColor}" stroke-width="0.5"/>
              <rect x="5" y="16" width="4" height="8" rx="1" fill="#87CEEB" stroke="#666" stroke-width="0.5"/>
              <rect x="5" y="26" width="4" height="8" rx="1" fill="#87CEEB" stroke="#666" stroke-width="0.5"/>
              <rect x="5" y="36" width="4" height="8" rx="1" fill="#87CEEB" stroke="#666" stroke-width="0.5"/>
              <rect x="5" y="46" width="4" height="8" rx="1" fill="#87CEEB" stroke="#666" stroke-width="0.5"/>
              <rect x="5" y="56" width="4" height="8" rx="1" fill="#87CEEB" stroke="#666" stroke-width="0.5"/>
              <rect x="27" y="16" width="4" height="8" rx="1" fill="#87CEEB" stroke="#666" stroke-width="0.5"/>
              <rect x="27" y="26" width="4" height="8" rx="1" fill="#87CEEB" stroke="#666" stroke-width="0.5"/>
              <rect x="27" y="36" width="4" height="8" rx="1" fill="#87CEEB" stroke="#666" stroke-width="0.5"/>
              <rect x="27" y="46" width="4" height="8" rx="1" fill="#87CEEB" stroke="#666" stroke-width="0.5"/>
              <rect x="27" y="56" width="4" height="8" rx="1" fill="#87CEEB" stroke="#666" stroke-width="0.5"/>
              <path d="M 9 10 L 9 14 L 27 14 L 27 10 Q 18 8 9 10 Z" fill="#87CEEB" opacity="0.9" stroke="#666" stroke-width="0.5"/>
              <rect x="11" y="66" width="14" height="4" rx="1" fill="#87CEEB" opacity="0.7" stroke="#666" stroke-width="0.5"/>
              <circle cx="11" cy="9" r="1.5" fill="#FFFF99" stroke="#666" stroke-width="0.4"/>
              <circle cx="25" cy="9" r="1.5" fill="#FFFF99" stroke="#666" stroke-width="0.4"/>
              <rect x="10" y="70" width="3" height="2" rx="0.5" fill="#FF4444" stroke="#333" stroke-width="0.3"/>
              <rect x="23" y="70" width="3" height="2" rx="0.5" fill="#FF4444" stroke="#333" stroke-width="0.3"/>
              <text x="18" y="42" font-family="Arial" font-size="7" font-weight="bold" fill="#333" text-anchor="middle">${labelTruncated}</text>
            </svg>
          </div>
        `;
        iconSize = [32, 52];
        iconAnchor = [16, 40];
      } else if (isCurrentUser) {
        iconHtml = `
          <svg width="30" height="30" viewBox="0 0 30 30" style="filter: drop-shadow(0 2px 4px rgba(0,0,0,0.3));">
            <path d="M15 2 L18 12 L28 15 L18 18 L15 28 L12 18 L2 15 L12 12 Z" 
                  fill="${color}" stroke="white" stroke-width="2"/>
          </svg>
        `;
        iconSize = [30, 30];
        iconAnchor = [15, 15];
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
        iconSize = [20, 20];
        iconAnchor = [10, 10];
      }

      const icon = L.divIcon({
        html: iconHtml,
        className: 'custom-marker',
        iconSize: iconSize,
        iconAnchor: iconAnchor
      });

      const marker = L.marker(newLatLng, { icon }).addTo(mapRef.current!);
      const visibilityText = isCurrentUser && estado === 'offline' 
        ? 'No visible para otros' 
        : isCurrentUser ? 'Visible para otros' : '';
      const visibilityColor = estado === 'offline' ? '#ef4444' : '#22c55e';

      const routeLabel = location.profiles.route_name || '';
      const isPrivateRoute = location.is_private_route;
      const busTypeLabel = isPrivateRoute ? 'Transporte Privado' : 'Ruta de Transporte';
      const unitLabel = location.unit_name || '';
      const unitPlacas = location.unit_placas || '';
      const driverLabel = location.driver_name || '';
      
      // Build favorite button HTML — use escaped double quotes for onclick
      const favoritoTarget = location.route_producto_id 
        ? `&quot;producto&quot;, &quot;${location.route_producto_id}&quot;`
        : (location.proveedor_id ? `&quot;proveedor&quot;, &quot;${location.proveedor_id}&quot;` : null);
      const favoritoButtonHtml = favoritoTarget && !isCurrentUser ? `
        <button 
          onclick="window.addToFavoritos(${favoritoTarget})"
          style="position:absolute;top:8px;right:8px;padding:4px;border-radius:50%;border:none;background:transparent;cursor:pointer;"
          title="Agregar a favoritos"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#ef4444" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/></svg>
        </button>
      ` : '';

      // App theme colors
      const cardBg = '#273547';
      const cardFg = '#fafafa';
      const primaryColor = '#3b82f6';
      const mutedFg = '#bfbfbf';
      const amberColor = '#FDB813';

      let popupContent: string;

      if (isCurrentUser) {
        popupContent = `
          <div style="background:${cardBg};color:${cardFg};padding:12px;min-width:200px;border-radius:8px;">
            <h3 style="font-weight:bold;font-size:16px;margin-bottom:8px;">${apodo || 'Tu ubicación'}</h3>
            <p style="font-size:13px;color:${visibilityColor};font-weight:600;">${visibilityText}</p>
          </div>
        `;
      } else if (isBus) {
        // Bus/route popup — themed with app colors, NO communication buttons
        // Build unit info line with nombre + placas
        const unitInfoParts: string[] = [];
        if (unitLabel) unitInfoParts.push(unitLabel);
        if (unitPlacas) unitInfoParts.push(`Placas: ${unitPlacas}`);
        const unitInfoLine = unitInfoParts.join(' · ');
        
        popupContent = `
          <div style="background:${cardBg};color:${cardFg};padding:14px;min-width:240px;border-radius:10px;position:relative;">
            ${favoritoButtonHtml}
            <div style="margin-bottom:10px;">
              <p style="font-size:12px;color:${isPrivateRoute ? amberColor : primaryColor};font-weight:600;margin:0 0 2px 0;">${busTypeLabel}</p>
            </div>
            ${routeLabel ? `
              <div style="background:rgba(59,130,246,0.15);border:1px solid rgba(59,130,246,0.3);border-radius:6px;padding:8px;margin-bottom:8px;">
                <div style="display:flex;align-items:center;gap:6px;">
                  <span style="font-size:16px;">🛣️</span>
                  <span style="font-size:15px;font-weight:700;color:${primaryColor};">${routeLabel}</span>
                </div>
              </div>
            ` : ''}
            ${unitInfoLine ? `
              <div style="background:rgba(253,184,19,0.15);border:1px solid rgba(253,184,19,0.3);border-radius:6px;padding:8px;margin-bottom:8px;">
                <div style="display:flex;align-items:center;gap:6px;">
                  <span style="font-size:16px;">🚌</span>
                  <div>
                    <span style="font-size:13px;font-weight:600;color:${amberColor};">${unitLabel}</span>
                    ${unitPlacas ? `<span style="font-size:11px;color:${mutedFg};display:block;margin-top:2px;">Placas: ${unitPlacas}</span>` : ''}
                  </div>
                </div>
              </div>
            ` : ''}
            ${driverLabel ? `
              <div style="background:rgba(255,255,255,0.08);border-radius:6px;padding:8px;margin-bottom:8px;">
                <div style="display:flex;align-items:center;gap:6px;">
                  <span style="font-size:14px;">👤</span>
                  <div>
                    <span style="font-size:11px;color:${mutedFg};display:block;">Chofer</span>
                    <span style="font-size:13px;font-weight:600;color:${cardFg};">${driverLabel}</span>
                  </div>
                </div>
              </div>
            ` : ''}
            <div style="display:flex;align-items:center;gap:6px;">
              <span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${color};"></span>
              <span style="font-size:12px;color:${mutedFg};">${estado === 'available' ? 'Disponible' : estado === 'busy' ? 'En servicio' : 'Fuera de línea'}</span>
            </div>
          </div>
        `;
      } else if (isTaxi) {
        // Taxi popup — keep taxi request button and communication
        popupContent = `
          <div style="background:${cardBg};color:${cardFg};padding:14px;min-width:220px;border-radius:10px;position:relative;">
            ${favoritoButtonHtml}
            <h3 style="font-weight:bold;font-size:16px;margin:0 0 4px 0;padding-right:30px;">${apodo || 'Taxi'} 🚕</h3>
            <p style="font-size:12px;color:#eab308;font-weight:600;margin:0 0 8px 0;">Servicio de Taxi</p>
            <div style="display:flex;align-items:center;gap:6px;margin-bottom:10px;">
              <span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${color};"></span>
              <span style="font-size:12px;color:${mutedFg};">${estado === 'available' ? 'Disponible' : estado === 'busy' ? 'Ocupado' : 'Fuera de línea'}</span>
            </div>
            ${estado === 'available' ? `
            <button 
              onclick='window.requestTaxi(${JSON.stringify(location.user_id)}, ${JSON.stringify(apodo || "Taxi")}, ${location.latitude}, ${location.longitude}, ${location.profiles?.tarifa_km || 15})'
              style="width:100%;background:#eab308;color:#1a1a1a;border:none;padding:10px;border-radius:6px;font-weight:700;font-size:14px;cursor:pointer;"
            >
              🚕 Solicitar Taxi
            </button>
            ` : ''}
          </div>
        `;
      } else {
        // Generic user popup
        popupContent = `
          <div style="background:${cardBg};color:${cardFg};padding:12px;min-width:180px;border-radius:8px;">
            <h3 style="font-weight:bold;font-size:15px;margin:0 0 6px 0;">${apodo || 'Usuario'}</h3>
            <div style="display:flex;align-items:center;gap:6px;">
              <span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${color};"></span>
              <span style="font-size:12px;color:${mutedFg};">${estado}</span>
            </div>
          </div>
        `;
      }

      marker.bindPopup(popupContent, {
        closeButton: true,
        autoClose: false,
        closeOnClick: false,
        maxWidth: 300,
        className: 'custom-popup-dark'
      });

      marker.on('click', () => {
        marker.openPopup();
      });

      markersRef.current[location.user_id] = marker;
    });
  }, [locations, currentUserId, initialLoadDone, filterType, privateRouteUserId]);

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

    (window as any).requestTaxi = (userId: string, businessName: string, lat: number, lng: number, tarifaKm: number) => {
      setSelectedTaxiDriver({
        user_id: userId,
        business_name: businessName,
        latitude: lat,
        longitude: lng,
        tarifa_km: tarifaKm
      });
      setShowTaxiModal(true);
    };

    (window as any).addToFavoritos = async (tipo: string, itemId: string) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        toast.error('Debes iniciar sesión para guardar favoritos');
        return;
      }

      const insertData: any = {
        user_id: user.id,
        tipo,
      };
      if (tipo === 'producto') insertData.producto_id = itemId;
      if (tipo === 'proveedor') insertData.proveedor_id = itemId;

      const { error } = await supabase
        .from('favoritos')
        .insert(insertData);

      if (error) {
        if (error.code === '23505') {
          toast.info('Ya está en tus favoritos');
        } else {
          toast.error('Error al agregar a favoritos');
        }
        return;
      }
      toast.success('❤️ Agregado a favoritos');
    };
  }, [onOpenChat]);

  return (
    <>
      <div id="map" className="w-full h-[calc(100vh-120px)]"></div>
      
      {/* Taxi Request Modal */}
      {selectedTaxiDriver && (
        <TaxiRequestModal
          isOpen={showTaxiModal}
          onClose={() => {
            setShowTaxiModal(false);
            setSelectedTaxiDriver(null);
          }}
          driver={selectedTaxiDriver}
        />
      )}
    </>
  );
};