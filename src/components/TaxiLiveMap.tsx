import React, { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Button } from '@/components/ui/button';
import { X, Locate, Navigation } from 'lucide-react';

interface TaxiLiveMapProps {
  pickupLat: number;
  pickupLng: number;
  destinationLat: number;
  destinationLng: number;
  pickupAddress?: string | null;
  destinationAddress?: string | null;
  isDriver: boolean;
  tripStatus: 'pending' | 'accepted';
  onClose: () => void;
}

const TAXI_ICON_SVG = `
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="40" height="40">
    <rect x="2" y="10" width="20" height="8" rx="2" fill="#FBBF24" stroke="#92400E" stroke-width="1"/>
    <rect x="4" y="6" width="16" height="6" rx="1" fill="#FBBF24" stroke="#92400E" stroke-width="1"/>
    <rect x="7" y="3" width="10" height="4" rx="1" fill="#FBBF24" stroke="#92400E" stroke-width="1"/>
    <text x="9" y="6" font-size="3" fill="#92400E" font-weight="bold">TAXI</text>
    <circle cx="6" cy="18" r="2" fill="#1F2937"/>
    <circle cx="18" cy="18" r="2" fill="#1F2937"/>
    <rect x="5" y="11" width="4" height="3" rx="0.5" fill="#60A5FA"/>
    <rect x="15" y="11" width="4" height="3" rx="0.5" fill="#60A5FA"/>
  </svg>
`;

const USER_ICON_SVG = `
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="32" height="32">
    <circle cx="12" cy="12" r="10" fill="#3B82F6" stroke="#1D4ED8" stroke-width="2"/>
    <circle cx="12" cy="12" r="4" fill="white"/>
  </svg>
`;

export default function TaxiLiveMap({
  pickupLat,
  pickupLng,
  destinationLat,
  destinationLng,
  pickupAddress,
  destinationAddress,
  isDriver,
  tripStatus,
  onClose
}: TaxiLiveMapProps) {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const myLocationMarkerRef = useRef<L.Marker | null>(null);
  const [myPosition, setMyPosition] = useState<{lat: number, lng: number} | null>(null);
  const watchIdRef = useRef<number | null>(null);

  // Inicializar mapa
  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;

    const map = L.map(mapContainerRef.current, {
      attributionControl: false,
      zoomControl: true,
    }).setView([pickupLat, pickupLng], 15);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(map);

    // Marcador de recogida
    L.marker([pickupLat, pickupLng], {
      icon: L.divIcon({
        html: '<div style="font-size: 32px; filter: drop-shadow(2px 2px 2px rgba(0,0,0,0.3));">📍</div>',
        className: 'pickup-marker',
        iconSize: [32, 32],
        iconAnchor: [16, 32]
      })
    }).addTo(map).bindPopup(`<b>Recogida</b><br/>${pickupAddress || 'Punto de recogida'}`);

    // Marcador de destino
    L.marker([destinationLat, destinationLng], {
      icon: L.divIcon({
        html: '<div style="font-size: 32px; filter: drop-shadow(2px 2px 2px rgba(0,0,0,0.3));">🏁</div>',
        className: 'destination-marker',
        iconSize: [32, 32],
        iconAnchor: [16, 32]
      })
    }).addTo(map).bindPopup(`<b>Destino</b><br/>${destinationAddress || 'Destino final'}`);

    // Línea de ruta
    L.polyline(
      [[pickupLat, pickupLng], [destinationLat, destinationLng]],
      { color: '#22C55E', weight: 4, opacity: 0.7, dashArray: '10, 10' }
    ).addTo(map);

    // Ajustar vista a los bounds
    const bounds = L.latLngBounds(
      [pickupLat, pickupLng],
      [destinationLat, destinationLng]
    );
    map.fitBounds(bounds, { padding: [50, 50] });

    mapRef.current = map;

    return () => {
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, [pickupLat, pickupLng, destinationLat, destinationLng]);

  // Tracking GPS en tiempo real
  useEffect(() => {
    if (!navigator.geolocation) return;

    // Obtener posición inicial
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setMyPosition({
          lat: position.coords.latitude,
          lng: position.coords.longitude
        });
      },
      (error) => console.error('Error obteniendo ubicación:', error),
      { enableHighAccuracy: true }
    );

    // Watch position
    watchIdRef.current = navigator.geolocation.watchPosition(
      (position) => {
        const newPos = {
          lat: position.coords.latitude,
          lng: position.coords.longitude
        };
        setMyPosition(newPos);
      },
      (error) => console.error('Error tracking:', error),
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 5000 }
    );

    return () => {
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
      }
    };
  }, []);

  // Actualizar marcador de mi ubicación
  useEffect(() => {
    if (!mapRef.current || !myPosition) return;

    // Icono según rol: taxi para conductor, punto azul para pasajero
    const iconHtml = isDriver 
      ? `<div style="transform: translateY(-10px);">${TAXI_ICON_SVG}</div>`
      : USER_ICON_SVG;

    if (!myLocationMarkerRef.current) {
      myLocationMarkerRef.current = L.marker([myPosition.lat, myPosition.lng], {
        icon: L.divIcon({
          html: iconHtml,
          className: 'my-location-marker',
          iconSize: isDriver ? [40, 40] : [32, 32],
          iconAnchor: isDriver ? [20, 30] : [16, 16]
        })
      }).addTo(mapRef.current);
      
      myLocationMarkerRef.current.bindPopup(isDriver ? 'Tu taxi' : 'Tu ubicación');
    } else {
      myLocationMarkerRef.current.setLatLng([myPosition.lat, myPosition.lng]);
    }
  }, [myPosition, isDriver]);

  // Centrar en mi ubicación
  const centerOnMyLocation = () => {
    if (mapRef.current && myPosition) {
      mapRef.current.setView([myPosition.lat, myPosition.lng], 16);
    }
  };

  // Centrar en ruta completa
  const centerOnRoute = () => {
    if (mapRef.current) {
      const bounds = L.latLngBounds(
        [pickupLat, pickupLng],
        [destinationLat, destinationLng]
      );
      if (myPosition) {
        bounds.extend([myPosition.lat, myPosition.lng]);
      }
      mapRef.current.fitBounds(bounds, { padding: [50, 50] });
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-background">
      {/* Mapa pantalla completa */}
      <div ref={mapContainerRef} className="absolute inset-0" />
      
      {/* Header overlay */}
      <div className="absolute top-0 left-0 right-0 bg-gradient-to-b from-background/90 to-transparent p-4 z-[1000]">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-bold text-lg flex items-center gap-2">
              {isDriver ? '🚕 Viaje en curso' : '🚕 Tu taxi viene en camino'}
            </h2>
            <p className="text-sm text-muted-foreground">
              {tripStatus === 'accepted' ? 'Taxi confirmado' : 'Esperando confirmación'}
            </p>
          </div>
          <Button variant="outline" size="icon" onClick={onClose}>
            <X className="h-5 w-5" />
          </Button>
        </div>
      </div>

      {/* Controles flotantes */}
      <div className="absolute bottom-24 right-4 flex flex-col gap-2 z-[1000]">
        <Button 
          variant="secondary" 
          size="icon" 
          onClick={centerOnMyLocation}
          className="bg-background/90 shadow-lg"
        >
          <Locate className="h-5 w-5" />
        </Button>
        <Button 
          variant="secondary" 
          size="icon" 
          onClick={centerOnRoute}
          className="bg-background/90 shadow-lg"
        >
          <Navigation className="h-5 w-5" />
        </Button>
      </div>

      {/* Footer con info */}
      <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-background to-transparent p-4 z-[1000]">
        <div className="bg-card border rounded-lg p-3 shadow-lg">
          <div className="flex items-center gap-2 text-sm mb-2">
            <span className="text-2xl">📍</span>
            <span className="line-clamp-1">{pickupAddress || 'Punto de recogida'}</span>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <span className="text-2xl">🏁</span>
            <span className="line-clamp-1">{destinationAddress || 'Destino'}</span>
          </div>
        </div>
      </div>

      {/* Indicador de estado del taxi */}
      {tripStatus === 'accepted' && (
        <div className="absolute top-20 left-1/2 -translate-x-1/2 z-[1000]">
          <div className="bg-yellow-500 text-yellow-950 px-4 py-2 rounded-full font-bold shadow-lg animate-pulse">
            🚕 {isDriver ? 'Viaje activo' : 'Taxi en camino'}
          </div>
        </div>
      )}
    </div>
  );
}
