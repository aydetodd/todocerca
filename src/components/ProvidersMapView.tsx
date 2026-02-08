import React, { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { useRealtimeLocations } from '@/hooks/useRealtimeLocations';
import TaxiRequestModal from '@/components/TaxiRequestModal';
import { AppointmentBooking } from '@/components/AppointmentBooking';

// Fix for default marker icon in React-Leaflet
import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png';
import markerIcon from 'leaflet/dist/images/marker-icon.png';
import markerShadow from 'leaflet/dist/images/marker-shadow.png';

delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconUrl: markerIcon,
  iconRetinaUrl: markerIcon2x,
  shadowUrl: markerShadow,
});

interface Provider {
  id: string;
  business_name: string;
  business_address: string;
  business_phone: string | null;
  latitude: number;
  longitude: number;
  user_id: string;
  productos: {
    nombre: string;
    precio: number;
    descripcion: string;
    stock: number;
    unit: string;
    categoria: string;
  }[];
}

interface ProvidersMapProps {
  providers: Provider[];
  onOpenChat?: (providerId: string, providerName: string) => void;
  vehicleFilter?: 'all' | 'taxi' | 'ruta';
}

// Vehicle colors based on status
const VEHICLE_COLORS: Record<string, { body: string; roof: string }> = {
  available: { body: '#22c55e', roof: '#16a34a' },
  busy: { body: '#FDB813', roof: '#FFD700' },
  offline: { body: '#ef4444', roof: '#dc2626' }
};

// Bus is always white
const BUS_COLOR = { body: '#FFFFFF', roof: '#F0F0F0' };

// Calculate bearing between two points
const calculateBearing = (lat1: number, lng1: number, lat2: number, lng2: number): number => {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const toDeg = (rad: number) => (rad * 180) / Math.PI;
  
  const dLng = toRad(lng2 - lng1);
  const y = Math.sin(dLng) * Math.cos(toRad(lat2));
  const x = Math.cos(toRad(lat1)) * Math.sin(toRad(lat2)) - 
            Math.sin(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.cos(dLng);
  
  let bearing = toDeg(Math.atan2(y, x));
  return (bearing + 360) % 360; // Normalize to 0-360
};

const createTaxiIcon = (providerStatus: string, rotation: number = 0) => {
  const taxiColor = VEHICLE_COLORS[providerStatus] || VEHICLE_COLORS.available;

  const taxiSvg = `
    <svg width="27" height="39" viewBox="0 0 36 52" xmlns="http://www.w3.org/2000/svg">
      <ellipse cx="18" cy="48" rx="14" ry="3" fill="rgba(0,0,0,0.25)"/>
      <ellipse cx="10" cy="38" rx="3.5" ry="4.5" fill="#1a1a1a" stroke="#333" stroke-width="0.6"/>
      <ellipse cx="10" cy="38" rx="2" ry="2.8" fill="#4a4a4a"/>
      <ellipse cx="26" cy="38" rx="3.5" ry="4.5" fill="#1a1a1a" stroke="#333" stroke-width="0.6"/>
      <ellipse cx="26" cy="38" rx="2" ry="2.8" fill="#4a4a4a"/>
      <path d="M 11 14 L 11 40 Q 11 42 13 42 L 23 42 Q 25 42 25 40 L 25 14 Q 25 12 23 12 L 13 12 Q 11 12 11 14 Z" fill="${taxiColor.body}" stroke="#333" stroke-width="0.7"/>
      <ellipse cx="10" cy="20" rx="3.5" ry="4.5" fill="#1a1a1a" stroke="#333" stroke-width="0.6"/>
      <ellipse cx="10" cy="20" rx="2" ry="2.8" fill="#4a4a4a"/>
      <ellipse cx="26" cy="20" rx="3.5" ry="4.5" fill="#1a1a1a" stroke="#333" stroke-width="0.6"/>
      <ellipse cx="26" cy="20" rx="2" ry="2.8" fill="#4a4a4a"/>
      <rect x="12" y="23" width="12" height="12" rx="1.5" fill="${taxiColor.roof}" stroke="#333" stroke-width="0.6"/>
      <rect x="11.5" y="24" width="2" height="10" rx="0.4" fill="#4A90E2" opacity="0.6" stroke="#333" stroke-width="0.4"/>
      <rect x="22.5" y="24" width="2" height="10" rx="0.4" fill="#4A90E2" opacity="0.6" stroke="#333" stroke-width="0.4"/>
      <path d="M 13 15 L 13 18 L 23 18 L 23 15 Q 18 13.5 13 15 Z" fill="#4A90E2" opacity="0.7" stroke="#333" stroke-width="0.5"/>
      <path d="M 13 36 L 13 39 L 23 39 L 23 36 Z" fill="#4A90E2" opacity="0.6" stroke="#333" stroke-width="0.5"/>
      <text x="18" y="30" font-family="Arial, sans-serif" font-size="6" font-weight="bold" fill="#333" text-anchor="middle">TAXI</text>
      <circle cx="13" cy="14" r="1.4" fill="#FFF" stroke="#333" stroke-width="0.4"/>
      <circle cx="23" cy="14" r="1.4" fill="#FFF" stroke="#333" stroke-width="0.4"/>
      <circle cx="13" cy="40" r="1.2" fill="#FF4444" stroke="#333" stroke-width="0.4"/>
      <circle cx="23" cy="40" r="1.2" fill="#FF4444" stroke="#333" stroke-width="0.4"/>
      <line x1="13" y1="25" x2="13" y2="33" stroke="#333" stroke-width="0.5" opacity="0.3"/>
      <line x1="23" y1="25" x2="23" y2="33" stroke="#333" stroke-width="0.5" opacity="0.3"/>
    </svg>
  `;

  return L.divIcon({
    html: `<div style="filter: drop-shadow(0 4px 6px rgba(0,0,0,0.3)); transform: rotate(${rotation}deg); transition: transform 0.3s ease-out;">${taxiSvg}</div>`,
    className: 'custom-taxi-marker',
    iconSize: [27, 39],
    iconAnchor: [14, 20]
  });
};

// Create bus icon (white bus with route name) - longer design with side windows
const createBusIcon = (routeName: string, rotation: number = 0) => {
  const busSvg = `
    <svg width="18" height="40" viewBox="0 0 36 80" xmlns="http://www.w3.org/2000/svg">
      <!-- Shadow -->
      <ellipse cx="18" cy="76" rx="14" ry="3" fill="rgba(0,0,0,0.25)"/>
      
      <!-- Rear wheels -->
      <ellipse cx="7" cy="66" rx="4" ry="5" fill="#1a1a1a" stroke="#333" stroke-width="0.6"/>
      <ellipse cx="7" cy="66" rx="2" ry="3" fill="#4a4a4a"/>
      <ellipse cx="29" cy="66" rx="4" ry="5" fill="#1a1a1a" stroke="#333" stroke-width="0.6"/>
      <ellipse cx="29" cy="66" rx="2" ry="3" fill="#4a4a4a"/>
      
      <!-- Bus body (dark border) -->
      <rect x="5" y="8" width="26" height="64" rx="4" fill="#1a1a1a" stroke="#333" stroke-width="1"/>
      
      <!-- Front wheels -->
      <ellipse cx="7" cy="18" rx="4" ry="5" fill="#1a1a1a" stroke="#333" stroke-width="0.6"/>
      <ellipse cx="7" cy="18" rx="2" ry="3" fill="#4a4a4a"/>
      <ellipse cx="29" cy="18" rx="4" ry="5" fill="#1a1a1a" stroke="#333" stroke-width="0.6"/>
      <ellipse cx="29" cy="18" rx="2" ry="3" fill="#4a4a4a"/>
      
      <!-- White roof (center) -->
      <rect x="9" y="10" width="18" height="56" rx="2" fill="#FFFFFF" stroke="#ccc" stroke-width="0.5"/>
      
      <!-- Left side windows -->
      <rect x="5" y="16" width="4" height="8" rx="1" fill="#87CEEB" stroke="#666" stroke-width="0.5"/>
      <rect x="5" y="26" width="4" height="8" rx="1" fill="#87CEEB" stroke="#666" stroke-width="0.5"/>
      <rect x="5" y="36" width="4" height="8" rx="1" fill="#87CEEB" stroke="#666" stroke-width="0.5"/>
      <rect x="5" y="46" width="4" height="8" rx="1" fill="#87CEEB" stroke="#666" stroke-width="0.5"/>
      <rect x="5" y="56" width="4" height="8" rx="1" fill="#87CEEB" stroke="#666" stroke-width="0.5"/>
      
      <!-- Right side windows -->
      <rect x="27" y="16" width="4" height="8" rx="1" fill="#87CEEB" stroke="#666" stroke-width="0.5"/>
      <rect x="27" y="26" width="4" height="8" rx="1" fill="#87CEEB" stroke="#666" stroke-width="0.5"/>
      <rect x="27" y="36" width="4" height="8" rx="1" fill="#87CEEB" stroke="#666" stroke-width="0.5"/>
      <rect x="27" y="46" width="4" height="8" rx="1" fill="#87CEEB" stroke="#666" stroke-width="0.5"/>
      <rect x="27" y="56" width="4" height="8" rx="1" fill="#87CEEB" stroke="#666" stroke-width="0.5"/>
      
      <!-- Front windshield -->
      <path d="M 9 10 L 9 14 L 27 14 L 27 10 Q 18 8 9 10 Z" fill="#87CEEB" opacity="0.9" stroke="#666" stroke-width="0.5"/>
      
      <!-- Rear window -->
      <rect x="11" y="66" width="14" height="4" rx="1" fill="#87CEEB" opacity="0.7" stroke="#666" stroke-width="0.5"/>
      
      <!-- Headlights -->
      <circle cx="11" cy="9" r="1.5" fill="#FFFF99" stroke="#666" stroke-width="0.4"/>
      <circle cx="25" cy="9" r="1.5" fill="#FFFF99" stroke="#666" stroke-width="0.4"/>
      
      <!-- Taillights -->
      <rect x="10" y="70" width="3" height="2" rx="0.5" fill="#FF4444" stroke="#333" stroke-width="0.3"/>
      <rect x="23" y="70" width="3" height="2" rx="0.5" fill="#FF4444" stroke="#333" stroke-width="0.3"/>
      
      <!-- Route name on white roof -->
      ${routeName ? `<text x="18" y="42" font-family="Arial, sans-serif" font-size="7" font-weight="700" fill="#111827" text-anchor="middle">${routeName}</text>` : ''}
    </svg>
  `;

  return L.divIcon({
    html: `<div style="filter: drop-shadow(0 4px 6px rgba(0,0,0,0.3)); transform: rotate(${rotation}deg); transition: transform 0.3s ease-out;">${busSvg}</div>`,
    className: 'custom-bus-marker',
    iconSize: [18, 40],
    iconAnchor: [9, 20]
  });
};

function ProvidersMap({ providers, onOpenChat, vehicleFilter = 'all' }: ProvidersMapProps) {
  const mapRef = useRef<L.Map | null>(null);
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const markersRef = useRef<Map<string, L.Marker>>(new Map());
  const prevPositionsRef = useRef<Map<string, { lat: number; lng: number; rotation: number }>>(new Map());
  const [selectedProduct, setSelectedProduct] = useState<{ provider: Provider; product: Provider['productos'][0] } | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [taxiRequestDriver, setTaxiRequestDriver] = useState<{
    user_id: string;
    business_name: string;
    latitude: number;
    longitude: number;
    tarifa_km?: number;
  } | null>(null);
  const [appointmentProvider, setAppointmentProvider] = useState<{
    id: string;
    nombre: string;
    telefono: string | null;
  } | null>(null);

  const isRouteSearch = vehicleFilter === 'ruta';

  // Get real-time locations - don't block on loading if we have static coordinates
  const { locations: realtimeLocations, loading: realtimeLoading } = useRealtimeLocations();

  console.log('🗺️ ProvidersMap - proveedores recibidos:', providers.length);
  console.log('📍 ProvidersMap - ubicaciones en tiempo real:', realtimeLocations.length, 'loading:', realtimeLoading);
  
  // Merge provider data with real-time locations - ONLY show providers with realtime data to get correct status
  const providersWithRealtimeLocation = React.useMemo(() => {
    return providers
      .map(provider => {
        // First check if there's realtime location data with status
        const realtimeLocation = realtimeLocations.find(loc => loc.user_id === provider.user_id);
        
        if (realtimeLocation) {
          // Use the status from realtime data - this is the source of truth
          const status = realtimeLocation.profiles?.estado || 'offline';
          const providerType = realtimeLocation.profiles?.provider_type || null;
          const routeName = realtimeLocation.profiles?.route_name || null;
          
          console.log(`🔄 Proveedor ${provider.business_name}: realtime status=${status}, type=${providerType}`);
          
          // Don't show offline providers
          if (status === 'offline') {
            console.log(`❌ ${provider.business_name}: offline, no mostrar`);
            return null;
          }
          
          return {
            ...provider,
            latitude: realtimeLocation.latitude,
            longitude: realtimeLocation.longitude,
            _realtimeStatus: status,
            _providerType: providerType,
            _routeName: routeName,
            _isBus: realtimeLocation.is_bus,
            _isTaxi: realtimeLocation.is_taxi,
            _tarifaKm: realtimeLocation.profiles?.tarifa_km || 15
          };
        }
        
        // No realtime data - don't show this provider (we don't know their status)
        console.log(`⚠️ ${provider.business_name}: sin datos realtime, esperando...`);
        return null;
      })
      .filter((p): p is NonNullable<typeof p> => p !== null);
  }, [providers, realtimeLocations]);
  
  // Filter providers with valid coordinates and apply vehicle filter
  const validProviders = React.useMemo(() => {
    let filtered = providersWithRealtimeLocation.filter(p => p.latitude && p.longitude);
    
    // Apply vehicle type filter
    if (vehicleFilter !== 'all') {
      filtered = filtered.filter(p => {
        // A provider can be BOTH taxi AND bus if they have products in both categories
        const isBus = (p as any)._isBus || (p as any)._providerType === 'ruta';
        const isTaxi = (p as any)._isTaxi || 
          (p as any)._providerType === 'taxi' ||
          p.productos.some(prod => 
            prod.categoria?.toLowerCase().includes('taxi') || 
            prod.nombre?.toLowerCase().includes('taxi')
          );
        
        // Filter based on search - provider shows if they have matching products
        if (vehicleFilter === 'taxi') return isTaxi;
        if (vehicleFilter === 'ruta') return isBus;
        return true;
      });
    }
    
    return filtered;
  }, [providersWithRealtimeLocation, vehicleFilter]);

  console.log('✅ Proveedores válidos:', validProviders.length, 'filtro:', vehicleFilter, 'realtime loaded:', !realtimeLoading);
  
  // Initialize map once
  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current || validProviders.length === 0) return;

    const center: [number, number] = [validProviders[0].latitude, validProviders[0].longitude];
    
    const map = L.map(mapContainerRef.current, { attributionControl: false }).setView(center, 14);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(map);

    mapRef.current = map;
    console.log('🗺️ Map initialized');

    return () => {
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
        markersRef.current.clear();
      }
    };
  }, [validProviders.length > 0]);

  // Update markers when providers change - smooth movement like TrackingMap
  useEffect(() => {
    if (!mapRef.current || validProviders.length === 0) return;

    // Track current provider IDs
    const currentProviderIds = new Set(validProviders.map(p => p.user_id));
    
    // Remove markers for providers that are no longer present
    markersRef.current.forEach((marker, userId) => {
      if (!currentProviderIds.has(userId)) {
        marker.remove();
        markersRef.current.delete(userId);
      }
    });

    // Add or update markers for each provider
    validProviders.forEach((provider) => {
      const existingMarker = markersRef.current.get(provider.user_id);
      const newPos: [number, number] = [provider.latitude, provider.longitude];

      // Icon type is determined by the SEARCH FILTER (vehicleFilter), not provider type
      const showAsTaxi = vehicleFilter === 'taxi';
      const showAsBus = vehicleFilter === 'ruta';
      
      const routeName = (provider as any)._routeName || '';
      const providerStatus = (provider as any)._realtimeStatus || 'available';

      // If marker exists, update position AND update icon if status changed
      if (existingMarker) {
        const currentLatLng = existingMarker.getLatLng();
        const prevData = prevPositionsRef.current.get(provider.user_id);
        let rotation = prevData?.rotation || 0;

        // Only update if position actually changed
        const positionChanged = 
          Math.abs(currentLatLng.lat - provider.latitude) > 0.000001 ||
          Math.abs(currentLatLng.lng - provider.longitude) > 0.000001;
          
        if (positionChanged) {
          // Calculate new bearing/rotation based on movement direction
          rotation = calculateBearing(
            currentLatLng.lat, 
            currentLatLng.lng, 
            provider.latitude, 
            provider.longitude
          );
          
          const vehicleEmoji = showAsBus ? '🚌' : showAsTaxi ? '🚕' : '📍';
          console.log(`${vehicleEmoji} ${provider.business_name}: ${provider.latitude.toFixed(6)}, ${provider.longitude.toFixed(6)} - rotation: ${rotation.toFixed(0)}°`);
          existingMarker.setLatLng(newPos);
          
          // Store new position and rotation
          prevPositionsRef.current.set(provider.user_id, { 
            lat: provider.latitude, 
            lng: provider.longitude, 
            rotation 
          });
          
          // Update icon with new rotation (only for taxi/bus)
          if (showAsBus) {
            existingMarker.setIcon(createBusIcon(routeName, rotation));
          } else if (showAsTaxi) {
            existingMarker.setIcon(createTaxiIcon(providerStatus, rotation));
            (existingMarker as any)._taxiStatus = providerStatus;
          }
        }

        // IMPORTANT: also update taxi color when status changes (available <-> busy)
        if (showAsTaxi && !positionChanged) {
          const prevStatus = (existingMarker as any)._taxiStatus as string | undefined;
          if (prevStatus !== providerStatus) {
            existingMarker.setIcon(createTaxiIcon(providerStatus, rotation));
            (existingMarker as any)._taxiStatus = providerStatus;
            console.log(`🎨 ${provider.business_name}: status ${prevStatus ?? 'unknown'} -> ${providerStatus}`);
          }
        }

        return; // Don't recreate marker
      }

      // Create new marker only if it doesn't exist
      // Icon depends on search filter: taxi -> taxi icon, ruta -> bus icon, other -> default blue pin
      let marker: L.Marker;
      if (showAsBus) {
        marker = L.marker(newPos, { icon: createBusIcon(routeName, 0) }).addTo(mapRef.current!);
        (marker as any)._isBus = true;
      } else if (showAsTaxi) {
        marker = L.marker(newPos, { icon: createTaxiIcon(providerStatus, 0) }).addTo(mapRef.current!);
        (marker as any)._taxiStatus = providerStatus;
      } else {
        // Default blue location pin for all other categories
        marker = L.marker(newPos).addTo(mapRef.current!);
      }
      
      // Store initial position
      prevPositionsRef.current.set(provider.user_id, { 
        lat: provider.latitude, 
        lng: provider.longitude, 
        rotation: 0 
      });
      
      const productsList = isRouteSearch
        ? provider.productos
            .map(
              (producto) => `
        <div style="padding: 8px 0; border-bottom: 1px solid #e5e7eb;">
          <div style="font-weight: 600; font-size: 0.95rem; margin-bottom: 4px;">${producto.nombre}</div>
          <div style="font-size: 0.85rem; margin-bottom: 4px;"><strong>$${Number(producto.precio).toFixed(2)}</strong></div>
          ${producto.descripcion ? `<div style="font-size: 0.8rem; color: #6b7280; line-height: 1.2;">${producto.descripcion}</div>` : ''}
        </div>
      `
            )
            .join('')
        : provider.productos
            .map(
              (producto, idx) => `
        <div style="display: flex; justify-content: space-between; align-items: center; padding: 4px 0; border-bottom: 1px solid #e5e7eb;">
          <span style="font-size: 0.875rem;">${producto.nombre}</span>
          <button onclick="window.showProductDetails('${provider.id}', ${idx})" style="color: #3b82f6; font-size: 0.75rem; text-decoration: underline; background: none; border: none; cursor: pointer;">Ver más...</button>
        </div>
      `
            )
            .join('');
       
      // Build popup content based on filter type
      const isTaxiView = vehicleFilter === 'taxi';
      const tarifaKm = (provider as any)._tarifaKm || 15;
      
      // Heart/favorite button HTML for popups
      const heartSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#ef4444" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/></svg>`;
      const favBtnStyle = `position:absolute;top:8px;right:28px;padding:4px;border-radius:50%;border:none;background:transparent;cursor:pointer;z-index:10;`;
      const providerFavBtn = `<button onclick="window.addToFavoritos(&quot;proveedor&quot;, &quot;${provider.id}&quot;)" style="${favBtnStyle}" title="Agregar a favoritos">${heartSvg}</button>`;

      const popupContent = isRouteSearch
        ? `
        <div style="padding: 12px; min-width: 250px; position: relative;">
          ${providerFavBtn}
          <h3 style="font-weight: 700; font-size: 1.05rem; margin-bottom: 12px; padding-right: 30px;">Rutas de Transporte</h3>
          ${
            provider.productos.length > 0
              ? `<div style="max-height: 260px; overflow-y: auto;">${productsList}</div>`
              : `<p style="font-size: 0.875rem; color: #6b7280;">Sin rutas disponibles</p>`
          }
        </div>
      `
        : isTaxiView
        ? `
        <div style="padding: 12px; min-width: 250px; position: relative;">
          ${providerFavBtn}
          <h3 style="font-weight: 600; font-size: 1.125rem; margin-bottom: 8px; padding-right: 30px;">${provider.business_name}</h3>
          <p style="font-size: 0.85rem; color: #6b7280; margin-bottom: 12px;">💰 Tarifa: $${tarifaKm.toFixed(2)} MXN/km</p>
          <div style="display: flex; gap: 8px; margin-bottom: 12px;">
            <button onclick='window.makeCall(${JSON.stringify(provider.business_phone || "")})' style="flex: 1; background-color: #3b82f6; color: white; padding: 8px; border-radius: 6px; border: none; cursor: pointer;">📞</button>
            <button onclick='window.openWhatsApp(${JSON.stringify(provider.business_phone || "")})' style="flex: 1; background-color: #22c55e; color: white; padding: 8px; border-radius: 6px; border: none; cursor: pointer;">💬</button>
            <button onclick='window.openInternalChat(${JSON.stringify(provider.user_id)}, ${JSON.stringify(provider.business_name)})' style="flex: 1; background-color: #f59e0b; color: white; padding: 8px; border-radius: 6px; border: none; cursor: pointer;">✉️</button>
          </div>
          <button id="hail-btn-${provider.user_id}" onclick='window.hailTaxi(${JSON.stringify(provider.user_id)}, ${JSON.stringify(provider.business_name)}, this)' style="width: 100%; background-color: #f59e0b; color: white; padding: 10px; border-radius: 8px; border: none; cursor: pointer; font-weight: 700; font-size: 0.95rem; margin-bottom: 8px;">🖐️ ¡Parada! — Hacerle la parada al taxi</button>
          <button onclick='window.requestTaxi(${JSON.stringify(provider.user_id)}, ${JSON.stringify(provider.business_name)}, ${provider.latitude}, ${provider.longitude}, ${tarifaKm})' style="width: 100%; background-color: #22c55e; color: white; padding: 12px; border-radius: 8px; border: none; cursor: pointer; font-weight: 700; font-size: 1rem;">🚕 Solicitar Taxi</button>
        </div>
      `
        : `
        <div style="padding: 12px; min-width: 250px; background: hsl(215, 30%, 22%); border-radius: 8px; position: relative;">
          ${providerFavBtn}
          <h3 style="font-weight: 600; font-size: 1.125rem; margin-bottom: 12px; color: #f8fafc; padding-right: 30px;">${provider.business_name}</h3>
          <div style="display: flex; gap: 8px; margin-bottom: 12px;">
            <button onclick='window.makeCall(${JSON.stringify(provider.business_phone || "")})' style="flex: 1; background-color: hsl(215, 70%, 48%); color: white; padding: 8px; border-radius: 6px; border: none; cursor: pointer;">📞</button>
            <button onclick='window.openWhatsApp(${JSON.stringify(provider.business_phone || "")})' style="flex: 1; background-color: #22c55e; color: white; padding: 8px; border-radius: 6px; border: none; cursor: pointer;">💬</button>
            <button onclick='window.openInternalChat(${JSON.stringify(provider.user_id)}, ${JSON.stringify(provider.business_name)})' style="flex: 1; background-color: hsl(215, 65%, 50%); color: white; padding: 8px; border-radius: 6px; border: none; cursor: pointer;">✉️</button>
          </div>
          <button onclick='window.goToProviderProfile(${JSON.stringify(provider.id)})' style="width: 100%; background-color: hsl(215, 70%, 48%); color: white; padding: 10px; border-radius: 6px; border: none; cursor: pointer; font-weight: 600; margin-bottom: 8px;">🛒 Ver productos y hacer pedido</button>
          <button onclick='window.bookAppointment(${JSON.stringify(provider.id)}, ${JSON.stringify(provider.business_name)}, ${JSON.stringify(provider.business_phone || "")})' style="width: 100%; background-color: hsl(215, 65%, 55%); color: white; padding: 10px; border-radius: 6px; border: none; cursor: pointer; font-weight: 600;">📅 Agendar Cita</button>
        </div>
      `;
      
      marker.bindPopup(popupContent, { closeButton: true, autoClose: false, closeOnClick: false, maxWidth: 350 });
      markersRef.current.set(provider.user_id, marker);
      console.log(`✅ Nuevo marcador: ${provider.business_name}`);
    });
  }, [validProviders]);

  // Setup global functions
  useEffect(() => {
    (window as any).makeCall = (phone: string) => {
      window.location.href = `tel:${phone}`;
    };
    (window as any).openWhatsApp = (phone: string) => {
      const formattedPhone = phone?.startsWith('+') ? phone : `+52${phone}`;
      window.open(`https://wa.me/${formattedPhone}`, '_blank');
    };
    (window as any).openInternalChat = (userId: string, providerName: string) => {
      if (onOpenChat) {
        // Pass user_id directly (not provider.id) since MessagingPanel expects user_id
        onOpenChat(userId, providerName);
      }
    };
    (window as any).goToProviderProfile = (providerId: string) => {
      window.location.href = `/proveedor/${providerId}`;
    };
    (window as any).showProductDetails = (providerId: string, productIndex: number) => {
      const provider = providers.find(p => p.id === providerId);
      if (provider?.productos[productIndex]) {
        setSelectedProduct({ provider, product: provider.productos[productIndex] });
        setIsDialogOpen(true);
      }
    };
    (window as any).requestTaxi = (userId: string, businessName: string, lat: number, lng: number, tarifaKm: number) => {
      setTaxiRequestDriver({
        user_id: userId,
        business_name: businessName,
        latitude: lat,
        longitude: lng,
        tarifa_km: tarifaKm
      });
    };
    (window as any).hailTaxi = async (driverUserId: string, driverName: string, btnElement: HTMLButtonElement) => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
          alert('Inicia sesión para hacerle la parada al taxi');
          return;
        }

        // Disable button immediately to prevent double-tap
        btnElement.disabled = true;
        btnElement.style.opacity = '0.6';
        btnElement.textContent = '⏳ Enviando...';

        // Get user name
        const { data: profile } = await supabase
          .from('profiles')
          .select('nombre, apodo')
          .eq('user_id', user.id)
          .single();
        
        const userName = profile?.apodo || profile?.nombre || 'Un usuario';

        // Send message to driver via messages table (triggers realtime TTS alert)
        const { error } = await supabase
          .from('messages')
          .insert({
            sender_id: user.id,
            receiver_id: driverUserId,
            message: `🖐️ ¡PARADA DE TAXI! ${userName} te está haciendo la parada. Detente para atender la solicitud.`,
            is_panic: false
          });

        if (error) throw error;

        btnElement.textContent = '✅ ¡Parada enviada!';
        btnElement.style.backgroundColor = '#16a34a';
        
        // Re-enable after 10 seconds
        setTimeout(() => {
          btnElement.disabled = false;
          btnElement.style.opacity = '1';
          btnElement.style.backgroundColor = '#f59e0b';
          btnElement.textContent = '🖐️ ¡Parada! — Hacerle la parada al taxi';
        }, 10000);
      } catch (error) {
        console.error('Error enviando parada de taxi:', error);
        btnElement.disabled = false;
        btnElement.style.opacity = '1';
        btnElement.textContent = '🖐️ ¡Parada! — Hacerle la parada al taxi';
        alert('No se pudo enviar la parada. Inténtalo de nuevo.');
      }
    };
    (window as any).bookAppointment = (providerId: string, providerName: string, providerPhone: string) => {
      setAppointmentProvider({
        id: providerId,
        nombre: providerName,
        telefono: providerPhone || null
      });
    };
    (window as any).addToFavoritos = async (tipo: string, itemId: string) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        alert('Debes iniciar sesión para guardar favoritos');
        return;
      }
      const filterCol = tipo === 'producto' ? 'producto_id' : tipo === 'proveedor' ? 'proveedor_id' : 'listing_id';
      const { data: existing } = await supabase
        .from('favoritos')
        .select('id')
        .eq('user_id', user.id)
        .eq(filterCol, itemId)
        .maybeSingle();
      if (existing) {
        const { error } = await supabase.from('favoritos').delete().eq('id', existing.id);
        if (error) { alert('Error al quitar de favoritos'); } else { alert('Eliminado de favoritos'); }
        return;
      }
      const insertData: any = { user_id: user.id, tipo };
      if (tipo === 'producto') insertData.producto_id = itemId;
      if (tipo === 'proveedor') insertData.proveedor_id = itemId;
      if (tipo === 'listing') insertData.listing_id = itemId;
      const { error } = await supabase.from('favoritos').insert(insertData);
      if (error) { alert('Error al agregar a favoritos'); } else { alert('Agregado a favoritos ❤️'); }
    };
  }, [onOpenChat, providers]);

  // Show loading while realtime data loads
  if (realtimeLoading && validProviders.length === 0) {
    return (
      <div className="w-full h-full rounded-lg overflow-hidden border flex items-center justify-center bg-muted">
        <p className="text-muted-foreground">Cargando ubicaciones...</p>
      </div>
    );
  }

  // No providers with valid coordinates
  if (validProviders.length === 0) {
    return (
      <div className="w-full h-full rounded-lg overflow-hidden border flex items-center justify-center bg-muted">
        <p className="text-muted-foreground">No hay proveedores con ubicación disponible</p>
      </div>
    );
  }

  return (
    <>
      <div ref={mapContainerRef} className="w-full h-full rounded-lg overflow-hidden border" />

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-full md:max-w-2xl h-full md:h-auto max-h-screen overflow-y-auto">
          {selectedProduct && (
            <>
              <DialogHeader className="sticky top-0 bg-background pb-4 border-b">
                <DialogTitle className="text-2xl font-bold">{selectedProduct.product.nombre}</DialogTitle>
              </DialogHeader>
              
              {isRouteSearch ? (
                <div className="space-y-5 py-4">
                  <div>
                    <p className="text-sm font-semibold text-muted-foreground mb-1">Precio</p>
                    <p className="text-3xl font-bold text-primary">
                      ${selectedProduct.product.precio.toFixed(2)}
                      {selectedProduct.product.unit && `/${selectedProduct.product.unit}`}
                    </p>
                  </div>

                  {selectedProduct.product.descripcion && (
                    <div>
                      <p className="text-sm font-semibold text-muted-foreground mb-1">Descripción</p>
                      <p className="text-sm text-muted-foreground">{selectedProduct.product.descripcion}</p>
                    </div>
                  )}
                </div>
              ) : (
                <div className="space-y-6 py-4">
                  <div>
                    <p className="text-sm font-semibold text-muted-foreground mb-1">Proveedor</p>
                    <p className="text-base">{selectedProduct.provider.business_name}</p>
                  </div>
                  
                  <div>
                    <p className="text-sm font-semibold text-muted-foreground mb-1">Precio</p>
                    <p className="text-3xl font-bold text-primary">
                      ${selectedProduct.product.precio.toFixed(2)}
                      {selectedProduct.product.unit && `/${selectedProduct.product.unit}`}
                    </p>
                  </div>
                  
                  {selectedProduct.product.descripcion && (
                    <div>
                      <p className="text-sm font-semibold text-muted-foreground mb-1">Descripción</p>
                      <p className="text-sm text-muted-foreground">{selectedProduct.product.descripcion}</p>
                    </div>
                  )}
                  
                  <div>
                    <p className="text-sm font-semibold text-muted-foreground mb-1">Categoría</p>
                    <p className="text-base">{selectedProduct.product.categoria}</p>
                  </div>
                  
                  <div>
                    <p className="text-sm font-semibold text-muted-foreground mb-1">Stock disponible</p>
                    <p className="text-base">{selectedProduct.product.stock} {selectedProduct.product.unit || 'unidades'}</p>
                  </div>
                  
                </div>
              )}
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Taxi Request Modal */}
      {taxiRequestDriver && (
        <TaxiRequestModal
          isOpen={!!taxiRequestDriver}
          onClose={() => setTaxiRequestDriver(null)}
          driver={taxiRequestDriver}
        />
      )}

      {/* Appointment Booking Modal */}
      <Dialog open={!!appointmentProvider} onOpenChange={() => setAppointmentProvider(null)}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          {appointmentProvider && (
            <AppointmentBooking
              proveedorId={appointmentProvider.id}
              proveedorNombre={appointmentProvider.nombre}
              proveedorTelefono={appointmentProvider.telefono}
              onClose={() => setAppointmentProvider(null)}
            />
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

export default ProvidersMap;
