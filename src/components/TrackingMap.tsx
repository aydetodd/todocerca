import { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { MemberLocation } from '@/hooks/useTrackingLocations';

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
}

const TrackingMap = ({ locations, currentUserId }: TrackingMapProps) => {
  const mapRef = useRef<L.Map | null>(null);
  const markersRef = useRef<{ [key: string]: L.Marker }>({});
  const hasInitializedView = useRef(false);
  const previousLocationCount = useRef(0);

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

    // Limpiar marcadores antiguos
    Object.values(markersRef.current).forEach(marker => marker.remove());
    markersRef.current = {};

    const bounds = L.latLngBounds([]);

    locations.forEach((loc) => {
      const position: L.LatLngExpression = [loc.latitude, loc.longitude];
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

      const marker = L.marker(position, { icon: customIcon }).addTo(mapRef.current!);

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

      // Crear popup que permanece abierto hasta el siguiente click
      const popup = L.popup({
        closeOnClick: false,
        autoClose: false,
        closeButton: true,
      }).setContent(popupContent);
      
      marker.bindPopup(popup);
      
      // Al hacer click, mantener popup abierto
      marker.on('click', () => {
        marker.openPopup();
      });
      
      markersRef.current[loc.user_id] = marker;
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

  return (
    <div 
      id="tracking-map" 
      className="w-full h-full rounded-lg shadow-lg border border-border"
    />
  );
};

export default TrackingMap;
