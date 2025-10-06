import { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

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
  productos: {
    nombre: string;
    precio: number;
  }[];
}

interface ProvidersMapProps {
  providers: Provider[];
}

const ProvidersMap = ({ providers }: ProvidersMapProps) => {
  const mapRef = useRef<L.Map | null>(null);
  const mapContainerRef = useRef<HTMLDivElement>(null);

  console.log('🗺️ ProvidersMap recibió proveedores:', providers);
  
  // Filter providers with valid coordinates
  const validProviders = providers.filter(p => p.latitude && p.longitude);
  console.log('✅ Proveedores válidos con coordenadas:', validProviders);
  
  useEffect(() => {
    if (!mapContainerRef.current) return;
    
    // Clean up previous map instance
    if (mapRef.current) {
      mapRef.current.remove();
      mapRef.current = null;
    }

    if (validProviders.length === 0) return;

    // Create new map
    const center: [number, number] = [validProviders[0].latitude, validProviders[0].longitude];
    
    const map = L.map(mapContainerRef.current).setView(center, 12);
    
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
    }).addTo(map);

    // Add markers
    validProviders.forEach((provider) => {
      const marker = L.marker([provider.latitude, provider.longitude]).addTo(map);
      
      const popupContent = `
        <div style="padding: 8px;">
          <h3 style="font-weight: 600; font-size: 1.125rem; margin-bottom: 4px;">${provider.business_name}</h3>
          <p style="font-size: 0.875rem; color: #6b7280; margin-bottom: 8px;">${provider.business_address}</p>
          ${provider.business_phone ? `
            <p style="font-size: 0.875rem; margin-bottom: 8px;">
              <span style="font-weight: 500;">Teléfono:</span> ${provider.business_phone}
            </p>
          ` : ''}
          ${provider.productos.length > 0 ? `
            <div>
              <p style="font-weight: 500; font-size: 0.875rem; margin-bottom: 4px;">Productos encontrados:</p>
              <ul style="font-size: 0.875rem;">
                ${provider.productos.map(producto => `
                  <li>${producto.nombre} - $${producto.precio}</li>
                `).join('')}
              </ul>
            </div>
          ` : ''}
        </div>
      `;
      
      marker.bindPopup(popupContent);
    });

    mapRef.current = map;

    // Cleanup on unmount
    return () => {
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, [validProviders]);

  if (validProviders.length === 0) {
    return (
      <div className="w-full h-[500px] rounded-lg overflow-hidden border flex items-center justify-center bg-muted">
        <p className="text-muted-foreground">No hay proveedores con ubicación disponible</p>
      </div>
    );
  }

  return (
    <div 
      ref={mapContainerRef}
      className="w-full h-[500px] rounded-lg overflow-hidden border"
    />
  );
};

export default ProvidersMap;
