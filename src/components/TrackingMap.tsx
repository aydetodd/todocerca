import { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { MemberLocation } from '@/hooks/useTrackingLocations';
import { Users, X, Eye, EyeOff } from 'lucide-react';
import { Button } from '@/components/ui/button';

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
  
  const [showNamesList, setShowNamesList] = useState(false);
  const [hiddenMembers, setHiddenMembers] = useState<Set<string>>(new Set());

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
      
      // Si el miembro está oculto, no mostrar en el mapa
      if (hiddenMembers.has(loc.user_id)) {
        // Si existe el marcador, removerlo
        if (markersRef.current[loc.user_id]) {
          markersRef.current[loc.user_id].remove();
          delete markersRef.current[loc.user_id];
        }
        return;
      }
      
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

      // Popup con información y botón de cerrar
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

      // Si el marcador ya existe, solo actualizar posición (preserva popup abierto)
      if (markersRef.current[loc.user_id]) {
        markersRef.current[loc.user_id].setLatLng(position);
        markersRef.current[loc.user_id].setIcon(customIcon);
        // Actualizar contenido del popup sin cerrarlo
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
      if (!currentMarkerIds.has(userId) || hiddenMembers.has(userId)) {
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
  }, [locations, currentUserId, hiddenMembers]);

  const toggleMemberVisibility = (userId: string) => {
    setHiddenMembers(prev => {
      const newSet = new Set(prev);
      if (newSet.has(userId)) {
        newSet.delete(userId);
      } else {
        newSet.add(userId);
      }
      return newSet;
    });
  };

  const showAllMembers = () => {
    setHiddenMembers(new Set());
  };

  return (
    <div className="relative w-full h-full">
      <div 
        id="tracking-map" 
        className="w-full h-full rounded-lg shadow-lg border border-border"
      />
      
      {/* Botón Nombres */}
      <Button
        onClick={() => setShowNamesList(!showNamesList)}
        className="absolute top-3 right-3 z-[1000] bg-background/95 backdrop-blur-sm border border-border text-foreground hover:bg-accent shadow-lg"
        size="sm"
      >
        <Users className="w-4 h-4 mr-2" />
        Nombres
      </Button>

      {/* Panel de nombres */}
      {showNamesList && (
        <div className="absolute top-14 right-3 z-[1000] bg-background/95 backdrop-blur-sm border border-border rounded-lg shadow-xl p-3 min-w-[200px] max-w-[280px] max-h-[300px] overflow-y-auto">
          <div className="flex items-center justify-between mb-3 pb-2 border-b border-border">
            <span className="font-semibold text-sm">Miembros ({locations.length})</span>
            <button 
              onClick={() => setShowNamesList(false)}
              className="p-1 hover:bg-accent rounded"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          
          {hiddenMembers.size > 0 && (
            <button
              onClick={showAllMembers}
              className="w-full text-xs text-primary hover:underline mb-2 text-left"
            >
              Mostrar todos
            </button>
          )}
          
          <div className="space-y-2">
            {locations.map((loc) => {
              const isHidden = hiddenMembers.has(loc.user_id);
              const isOwner = loc.member?.is_owner;
              
              return (
                <div 
                  key={loc.user_id}
                  className={`flex items-center justify-between p-2 rounded-lg transition-colors ${
                    isHidden ? 'bg-muted/50 opacity-60' : 'bg-accent/50'
                  }`}
                >
                  <div className="flex items-center gap-2 flex-1 min-w-0">
                    <div 
                      className="w-3 h-3 rounded-full flex-shrink-0"
                      style={{ backgroundColor: isOwner ? '#ea580c' : '#2d9d78' }}
                    />
                    <span className={`text-sm truncate ${isHidden ? 'line-through' : ''}`}>
                      {loc.member?.nickname || 'Miembro'}
                    </span>
                    {isOwner && <span className="text-xs">👑</span>}
                  </div>
                  <button
                    onClick={() => toggleMemberVisibility(loc.user_id)}
                    className="p-1.5 hover:bg-background rounded ml-2 flex-shrink-0"
                    title={isHidden ? 'Mostrar en mapa' : 'Ocultar del mapa'}
                  >
                    {isHidden ? (
                      <EyeOff className="w-4 h-4 text-muted-foreground" />
                    ) : (
                      <Eye className="w-4 h-4 text-primary" />
                    )}
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};

export default TrackingMap;
