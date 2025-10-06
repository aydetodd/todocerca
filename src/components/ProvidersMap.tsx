import { useEffect, useRef, useState } from 'react';
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
    descripcion: string;
    stock: number;
    unit: string;
    categoria: string;
  }[];
}

interface ProvidersMapProps {
  providers: Provider[];
}

const ProvidersMap = ({ providers }: ProvidersMapProps) => {
  const mapRef = useRef<L.Map | null>(null);
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const [selectedProduct, setSelectedProduct] = useState<{ provider: Provider; productIndex: number } | null>(null);

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
      
      const productsList = provider.productos.map((producto, idx) => `
        <div style="display: flex; justify-content: space-between; align-items: center; padding: 4px 0; border-bottom: 1px solid #e5e7eb;">
          <span style="font-size: 0.875rem;">${producto.nombre}</span>
          <button 
            onclick="window.showProductDetails('${provider.id}', ${idx})"
            style="color: #3b82f6; font-size: 0.75rem; text-decoration: underline; background: none; border: none; cursor: pointer; padding: 0; margin-left: 8px;"
          >
            Ver más...
          </button>
        </div>
      `).join('');
      
      const popupContent = `
        <div style="padding: 12px; min-width: 250px;">
          <h3 style="font-weight: 600; font-size: 1.125rem; margin-bottom: 12px;">${provider.business_name}</h3>
          
          <div style="display: flex; gap: 8px; margin-bottom: 12px;">
            <button 
              onclick="window.makeCall('${provider.business_phone}')"
              style="flex: 1; background-color: #3b82f6; color: white; padding: 8px; border-radius: 6px; border: none; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 4px; font-size: 0.875rem;"
              title="Llamar"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg>
            </button>
            <button 
              onclick="window.openWhatsApp('${provider.business_phone}')"
              style="flex: 1; background-color: #22c55e; color: white; padding: 8px; border-radius: 6px; border: none; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 4px; font-size: 0.875rem;"
              title="WhatsApp"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></svg>
            </button>
            <button 
              onclick="window.openInternalChat('${provider.id}', '${provider.business_name}')"
              style="flex: 1; background-color: #f59e0b; color: white; padding: 8px; border-radius: 6px; border: none; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 4px; font-size: 0.875rem;"
              title="Mensaje"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
            </button>
          </div>
          
          ${provider.productos.length > 0 ? `
            <div style="margin-top: 12px;">
              <p style="font-weight: 500; font-size: 0.875rem; margin-bottom: 8px;">Productos:</p>
              <div style="max-height: 200px; overflow-y: auto;">
                ${productsList}
              </div>
            </div>
          ` : ''}
        </div>
      `;
      
      marker.bindPopup(popupContent, {
        closeButton: true,
        autoClose: false,
        closeOnClick: false,
        maxWidth: 350
      });
    });

    mapRef.current = map;

    // Add global functions for popup buttons
    (window as any).makeCall = (phone: string) => {
      window.location.href = `tel:${phone}`;
    };

    (window as any).openWhatsApp = (phone: string) => {
      window.open(`https://wa.me/${phone}`, '_blank');
    };

    (window as any).openInternalChat = (providerId: string, providerName: string) => {
      console.log('Open chat with provider:', providerId, providerName);
      // TODO: Implementar navegación al chat interno
    };

    (window as any).showProductDetails = (providerId: string, productIndex: number) => {
      const provider = validProviders.find(p => p.id === providerId);
      if (provider && provider.productos[productIndex]) {
        const product = provider.productos[productIndex];
        
        const detailsHTML = `
          <div style="padding: 16px; max-width: 400px;">
            <h3 style="font-weight: 700; font-size: 1.25rem; margin-bottom: 16px; color: #1f2937;">${product.nombre}</h3>
            
            <div style="display: grid; gap: 12px;">
              <div>
                <p style="font-weight: 600; font-size: 0.875rem; color: #6b7280; margin-bottom: 4px;">Proveedor</p>
                <p style="font-size: 1rem; color: #1f2937;">${provider.business_name}</p>
              </div>
              
              <div>
                <p style="font-weight: 600; font-size: 0.875rem; color: #6b7280; margin-bottom: 4px;">Precio</p>
                <p style="font-size: 1.25rem; font-weight: 700; color: #3b82f6;">$${product.precio.toFixed(2)}${product.unit ? `/${product.unit}` : ''}</p>
              </div>
              
              ${product.descripcion ? `
                <div>
                  <p style="font-weight: 600; font-size: 0.875rem; color: #6b7280; margin-bottom: 4px;">Descripción</p>
                  <p style="font-size: 0.875rem; color: #4b5563;">${product.descripcion}</p>
                </div>
              ` : ''}
              
              <div>
                <p style="font-weight: 600; font-size: 0.875rem; color: #6b7280; margin-bottom: 4px;">Categoría</p>
                <p style="font-size: 0.875rem; color: #1f2937;">${product.categoria}</p>
              </div>
              
              <div>
                <p style="font-weight: 600; font-size: 0.875rem; color: #6b7280; margin-bottom: 4px;">Stock disponible</p>
                <p style="font-size: 0.875rem; color: #1f2937;">${product.stock} ${product.unit || 'unidades'}</p>
              </div>
            </div>
            
            <div style="margin-top: 16px; padding-top: 16px; border-top: 1px solid #e5e7eb;">
              <p style="font-weight: 600; font-size: 0.875rem; color: #6b7280; margin-bottom: 8px;">Contactar</p>
              <div style="display: flex; gap: 8px;">
                <button 
                  onclick="window.makeCall('${provider.business_phone}')"
                  style="flex: 1; background-color: #3b82f6; color: white; padding: 10px; border-radius: 6px; border: none; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 6px; font-size: 0.875rem; font-weight: 500;"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg>
                  Llamar
                </button>
                <button 
                  onclick="window.openWhatsApp('${provider.business_phone}')"
                  style="flex: 1; background-color: #22c55e; color: white; padding: 10px; border-radius: 6px; border: none; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 6px; font-size: 0.875rem; font-weight: 500;"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></svg>
                  WhatsApp
                </button>
              </div>
            </div>
          </div>
        `;
        
        // Create a new popup with product details
        const detailsPopup = L.popup({
          closeButton: true,
          autoClose: false,
          closeOnClick: false,
          maxWidth: 450
        })
        .setLatLng([provider.latitude, provider.longitude])
        .setContent(detailsHTML)
        .openOn(mapRef.current!);
      }
    };

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
