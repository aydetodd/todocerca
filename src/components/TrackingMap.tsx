import { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { MemberLocation } from '@/hooks/useTrackingLocations';
import { GpsTracker } from '@/hooks/useGpsTrackers';
import { isGpsTrackerOnline } from '@/lib/gpsTrackers';
import { Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { formatDistanceToNow } from 'date-fns';
import { es } from 'date-fns/locale';

// Fix default Leaflet icon paths
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

interface TrackingMapProps {
  locations: MemberLocation[];
  currentUserId: string | null;
  showNamesButton?: boolean;
  gpsTrackers?: GpsTracker[];
}

const TrackingMap = ({ locations, currentUserId, showNamesButton = false, gpsTrackers = [] }: TrackingMapProps) => {
  const mapRef = useRef<L.Map | null>(null);
  const markersRef = useRef<{ [key: string]: L.Marker }>({});
  const trackerMarkersRef = useRef<{ [key: string]: L.Marker }>({});
  const hasInitializedView = useRef(false);
  const previousLocationCount = useRef(0);
  
  const [allPopupsOpen, setAllPopupsOpen] = useState(false);

  useEffect(() => {
    if (!mapRef.current) {
      // Inicializar mapa centrado en México
      mapRef.current = L.map('tracking-map', { attributionControl: false }).setView([23.6345, -102.5528], 5);

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(mapRef.current);
    }

    return () => {
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (!mapRef.current || locations.length === 0) return;

    // Determinar si debemos recentrar el mapa
    const shouldRecenter = !hasInitializedView.current || locations.length !== previousLocationCount.current;
    previousLocationCount.current = locations.length;

    const bounds = L.latLngBounds([]);
    const currentMarkerIds = new Set<string>();

    locations.forEach((loc) => {
      const position: L.LatLngExpression = [loc.latitude, loc.longitude];
      currentMarkerIds.add(loc.user_id);
      
      bounds.extend(position);

      // Crear icono personalizado según si es el dueño o no
      const isOwner = loc.member?.is_owner;
      const iconColor = isOwner ? '#ea580c' : '#2d9d78';
      
      const customIcon = L.divIcon({
        className: 'custom-tracking-marker',
        html: `
          <div style="
            background-color: ${iconColor};
            width: 32px;
            height: 32px;
            border-radius: 50% 50% 50% 0;
            transform: rotate(-45deg);
            border: 3px solid white;
            box-shadow: 0 2px 8px rgba(0,0,0,0.3);
            display: flex;
            align-items: center;
            justify-content: center;
          ">
            <div style="
              transform: rotate(45deg);
              color: white;
              font-weight: bold;
              font-size: 14px;
            ">
              ${isOwner ? '👑' : '📍'}
            </div>
          </div>
        `,
        iconSize: [32, 32],
        iconAnchor: [16, 32],
        popupAnchor: [0, -32]
      });

      // Popup con información
      const popupContent = `
        <div style="font-family: system-ui; min-width: 150px;">
          <strong style="font-size: 16px; color: ${iconColor};">
            ${loc.member?.nickname || 'Miembro'}
          </strong>
          ${isOwner ? '<div style="font-size: 11px; color: #ea580c;">👑 Dueño del Grupo</div>' : ''}
          <div style="margin-top: 8px; font-size: 12px; color: #666;">
            <div>Última actualización:</div>
            <div>${new Date(loc.updated_at).toLocaleString()}</div>
          </div>
        </div>
      `;

      // Si el marcador ya existe, solo actualizar posición
      if (markersRef.current[loc.user_id]) {
        markersRef.current[loc.user_id].setLatLng(position);
        markersRef.current[loc.user_id].setIcon(customIcon);
        markersRef.current[loc.user_id].getPopup()?.setContent(popupContent);
      } else {
        // Crear nuevo marcador
        const marker = L.marker(position, { icon: customIcon }).addTo(mapRef.current!);
        
        marker.bindPopup(popupContent, {
          closeOnClick: false,
          autoClose: false,
          closeButton: true,
        });
        
        markersRef.current[loc.user_id] = marker;
      }
    });

    // Eliminar marcadores que ya no existen
    Object.keys(markersRef.current).forEach(userId => {
      if (!currentMarkerIds.has(userId)) {
        markersRef.current[userId].remove();
        delete markersRef.current[userId];
      }
    });

    // Solo ajustar vista inicialmente o cuando cambia el número de ubicaciones
    if (shouldRecenter && bounds.isValid()) {
      if (locations.length === 1) {
        mapRef.current.setView([locations[0].latitude, locations[0].longitude], 15);
      } else {
        mapRef.current.fitBounds(bounds, { padding: [50, 50] });
      }
      hasInitializedView.current = true;
    }
  }, [locations, currentUserId]);

  // Effect para GPS Trackers
  useEffect(() => {
    if (!mapRef.current) return;

    const currentTrackerIds = new Set<string>();

    // Filtrar trackers con ubicación válida
    const trackersWithLocation = gpsTrackers.filter(t => t.latitude && t.longitude);

    trackersWithLocation.forEach((tracker) => {
      const position: L.LatLngExpression = [tracker.latitude!, tracker.longitude!];
      currentTrackerIds.add(tracker.id);

      const online = isGpsTrackerOnline(tracker.last_seen);
      const iconColor = online ? '#3b82f6' : '#6b7280'; // blue if online, gray if offline

      // Icono de rastreador GPS (cuadrado con antena)
      const trackerIcon = L.divIcon({
        className: 'custom-gps-tracker-marker',
        html: `
          <div style="
            position: relative;
            width: 36px;
            height: 36px;
          ">
            <div style="
              background-color: ${iconColor};
              width: 28px;
              height: 28px;
              border-radius: 6px;
              border: 3px solid white;
              box-shadow: 0 2px 8px rgba(0,0,0,0.4);
              display: flex;
              align-items: center;
              justify-content: center;
              position: absolute;
              bottom: 0;
              left: 4px;
            ">
              <span style="font-size: 14px;">📡</span>
            </div>
            <div style="
              position: absolute;
              top: 0;
              left: 50%;
              transform: translateX(-50%);
              width: 3px;
              height: 10px;
              background: ${iconColor};
              border-radius: 2px;
            "></div>
            ${online ? `
              <div style="
                position: absolute;
                top: -2px;
                left: 50%;
                transform: translateX(-50%);
                width: 8px;
                height: 8px;
                background: #22c55e;
                border-radius: 50%;
                border: 2px solid white;
                animation: pulse 2s infinite;
              "></div>
            ` : ''}
          </div>
        `,
        iconSize: [36, 36],
        iconAnchor: [18, 36],
        popupAnchor: [0, -36]
      });

      // Popup del tracker
      const lastSeenText = tracker.last_seen
        ? formatDistanceToNow(new Date(tracker.last_seen), { addSuffix: true, locale: es })
        : 'Nunca';

      const popupContent = `
        <div style="font-family: system-ui; min-width: 180px;">
          <strong style="font-size: 16px; color: ${iconColor};">
            📡 ${tracker.name}
          </strong>
          <div style="font-size: 11px; color: ${online ? '#22c55e' : '#6b7280'}; margin-top: 2px;">
            ${online ? '🟢 En línea' : '⚫ Offline'}
          </div>
          <div style="margin-top: 8px; font-size: 12px; color: #666;">
            <div><strong>IMEI:</strong> ${tracker.imei}</div>
            <div><strong>Modelo:</strong> ${tracker.model || 'GPS'}</div>
            ${tracker.speed !== undefined ? `<div><strong>Velocidad:</strong> ${tracker.speed.toFixed(0)} km/h</div>` : ''}
            ${tracker.battery_level !== null ? `<div><strong>Batería:</strong> ${tracker.battery_level}%</div>` : ''}
            <div style="margin-top: 4px; font-size: 11px; color: #888;">
              Última señal: ${lastSeenText}
            </div>
          </div>
        </div>
      `;

      // Si el marcador ya existe, actualizar
      if (trackerMarkersRef.current[tracker.id]) {
        trackerMarkersRef.current[tracker.id].setLatLng(position);
        trackerMarkersRef.current[tracker.id].setIcon(trackerIcon);
        trackerMarkersRef.current[tracker.id].getPopup()?.setContent(popupContent);
      } else {
        // Crear nuevo marcador
        const marker = L.marker(position, { icon: trackerIcon }).addTo(mapRef.current!);
        
        marker.bindPopup(popupContent, {
          closeOnClick: false,
          autoClose: false,
          closeButton: true,
        });
        
        trackerMarkersRef.current[tracker.id] = marker;
      }
    });

    // Eliminar marcadores de trackers que ya no existen
    Object.keys(trackerMarkersRef.current).forEach(trackerId => {
      if (!currentTrackerIds.has(trackerId)) {
        trackerMarkersRef.current[trackerId].remove();
        delete trackerMarkersRef.current[trackerId];
      }
    });

    // Si no hay miembros pero sí trackers, ajustar vista a trackers
    if (locations.length === 0 && trackersWithLocation.length > 0 && !hasInitializedView.current) {
      const bounds = L.latLngBounds([]);
      trackersWithLocation.forEach(t => {
        bounds.extend([t.latitude!, t.longitude!]);
      });
      if (bounds.isValid()) {
        if (trackersWithLocation.length === 1) {
          mapRef.current.setView([trackersWithLocation[0].latitude!, trackersWithLocation[0].longitude!], 15);
        } else {
          mapRef.current.fitBounds(bounds, { padding: [50, 50] });
        }
        hasInitializedView.current = true;
      }
    }
  }, [gpsTrackers, locations.length]);

  const toggleAllPopups = () => {
    const allMarkers = [
      ...Object.values(markersRef.current),
      ...Object.values(trackerMarkersRef.current)
    ];
    
    if (allPopupsOpen) {
      allMarkers.forEach(marker => marker.closePopup());
      setAllPopupsOpen(false);
    } else {
      allMarkers.forEach(marker => marker.openPopup());
      setAllPopupsOpen(true);
    }
  };

  return (
    <div className="relative w-full h-full">
      <div 
        id="tracking-map" 
        className="w-full h-full rounded-lg shadow-lg border border-border"
      />
      
      {/* Botón Nombres - solo si showNamesButton es true */}
      {showNamesButton && (
        <Button
          onClick={toggleAllPopups}
          className={`absolute top-3 right-3 z-[1000] backdrop-blur-sm border border-border shadow-lg ${
            allPopupsOpen 
              ? 'bg-primary text-primary-foreground hover:bg-primary/90' 
              : 'bg-background/95 text-foreground hover:bg-accent'
          }`}
          size="sm"
        >
          <Users className="w-4 h-4 mr-2" />
          Nombres
        </Button>
      )}
    </div>
  );
};

export default TrackingMap;
