import { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Phone, MessageCircle, MessageSquare } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useRealtimeLocations } from '@/hooks/useRealtimeLocations';

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
}

const ProvidersMap = ({ providers, onOpenChat }: ProvidersMapProps) => {
  const mapRef = useRef<L.Map | null>(null);
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const markersRef = useRef<Map<string, L.Marker>>(new Map());
  const [selectedProduct, setSelectedProduct] = useState<{ provider: Provider; product: Provider['productos'][0] } | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  // Get real-time locations
  const { locations: realtimeLocations } = useRealtimeLocations();

  console.log('🗺️ ProvidersMap - proveedores recibidos:', providers);
  console.log('📍 ProvidersMap - ubicaciones en tiempo real:', realtimeLocations);
  
  // Merge provider data with real-time locations
  const providersWithRealtimeLocation = providers.map(provider => {
    const realtimeLocation = realtimeLocations.find(loc => loc.user_id === provider.user_id);
    if (realtimeLocation) {
      console.log(`🔄 Actualizando ubicación para ${provider.business_name}:`, {
        old: { lat: provider.latitude, lng: provider.longitude },
        new: { lat: realtimeLocation.latitude, lng: realtimeLocation.longitude }
      });
      return {
        ...provider,
        latitude: realtimeLocation.latitude,
        longitude: realtimeLocation.longitude
      };
    }
    return provider;
  });
  
  // Filter providers with valid coordinates
  const validProviders = providersWithRealtimeLocation.filter(p => p.latitude && p.longitude);
  console.log('✅ Proveedores válidos con coordenadas:', validProviders);
  
  // Initialize map once
  useEffect(() => {
    if (!mapContainerRef.current) return;
    if (mapRef.current) {
      console.log('🗺️ Map already initialized');
      return;
    }

    if (validProviders.length === 0) return;

    // Create new map
    const center: [number, number] = [validProviders[0].latitude, validProviders[0].longitude];
    
    const map = L.map(mapContainerRef.current, { attributionControl: false }).setView(center, 12);
    
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
  }, []);

  // Update markers when providers change
  useEffect(() => {
    if (!mapRef.current || validProviders.length === 0) return;

    console.log('🔄 Updating markers for providers:', validProviders.length);

    // Remove all existing markers
    markersRef.current.forEach(marker => marker.remove());
    markersRef.current.clear();

    // Add/update markers
    validProviders.forEach((provider) => {
      // Check if provider has taxi products
      const isTaxi = provider.productos.some(p => 
        p.categoria?.toLowerCase().includes('taxi') || 
        p.nombre?.toLowerCase().includes('taxi')
      );
      
      // Get provider status from realtime locations
      const realtimeLocation = realtimeLocations.find(loc => loc.user_id === provider.user_id);
      const providerStatus = realtimeLocation?.profiles?.estado || 'available';
      
      console.log('Provider:', provider.business_name, '- isTaxi:', isTaxi, '- status:', providerStatus);
      
      // Colors based on status
      const taxiColors = {
        available: { body: '#22c55e', roof: '#16a34a' }, // green
        busy: { body: '#FDB813', roof: '#FFD700' },      // yellow (original taxi color)
        offline: { body: '#ef4444', roof: '#dc2626' }    // red (shouldn't show anyway)
      };
      
      let icon;
      if (isTaxi) {
        const taxiColor = taxiColors[providerStatus] || taxiColors.available;
        // Taxi icon - vista en perspectiva con llantas laterales
        const taxiTopViewSvg = `
          <svg width="36" height="52" viewBox="0 0 36 52" xmlns="http://www.w3.org/2000/svg">
            <!-- Sombra del carro -->
            <ellipse cx="18" cy="48" rx="14" ry="3" fill="rgba(0,0,0,0.25)"/>
            
            <!-- Llanta trasera izquierda -->
            <ellipse cx="10" cy="38" rx="3.5" ry="4.5" fill="#1a1a1a" stroke="#333" stroke-width="0.6"/>
            <ellipse cx="10" cy="38" rx="2" ry="2.8" fill="#4a4a4a"/>
            
            <!-- Llanta trasera derecha -->
            <ellipse cx="26" cy="38" rx="3.5" ry="4.5" fill="#1a1a1a" stroke="#333" stroke-width="0.6"/>
            <ellipse cx="26" cy="38" rx="2" ry="2.8" fill="#4a4a4a"/>
            
            <!-- Cuerpo principal del taxi (parte trasera) -->
            <path d="M 11 14 L 11 40 Q 11 42 13 42 L 23 42 Q 25 42 25 40 L 25 14 Q 25 12 23 12 L 13 12 Q 11 12 11 14 Z" 
                  fill="${taxiColor.body}" stroke="#333" stroke-width="0.7"/>
            
            <!-- Llanta delantera izquierda -->
            <ellipse cx="10" cy="20" rx="3.5" ry="4.5" fill="#1a1a1a" stroke="#333" stroke-width="0.6"/>
            <ellipse cx="10" cy="20" rx="2" ry="2.8" fill="#4a4a4a"/>
            
            <!-- Llanta delantera derecha -->
            <ellipse cx="26" cy="20" rx="3.5" ry="4.5" fill="#1a1a1a" stroke="#333" stroke-width="0.6"/>
            <ellipse cx="26" cy="20" rx="2" ry="2.8" fill="#4a4a4a"/>
            
            <!-- Techo/Cabina superior -->
            <rect x="12" y="23" width="12" height="12" rx="1.5" fill="${taxiColor.roof}" stroke="#333" stroke-width="0.6"/>
            
            <!-- Ventanas laterales izquierda -->
            <rect x="11.5" y="24" width="2" height="10" rx="0.4" fill="#4A90E2" opacity="0.6" stroke="#333" stroke-width="0.4"/>
            
            <!-- Ventanas laterales derecha -->
            <rect x="22.5" y="24" width="2" height="10" rx="0.4" fill="#4A90E2" opacity="0.6" stroke="#333" stroke-width="0.4"/>
            
            <!-- Parabrisas frontal -->
            <path d="M 13 15 L 13 18 L 23 18 L 23 15 Q 18 13.5 13 15 Z" 
                  fill="#4A90E2" opacity="0.7" stroke="#333" stroke-width="0.5"/>
            
            <!-- Ventana trasera -->
            <path d="M 13 36 L 13 39 L 23 39 L 23 36 Z" 
                  fill="#4A90E2" opacity="0.6" stroke="#333" stroke-width="0.5"/>
            
            <!-- Texto TAXI en el techo -->
            <text x="18" y="30" font-family="Arial, sans-serif" font-size="6" font-weight="bold" fill="#333" text-anchor="middle">TAXI</text>
            
            <!-- Luces delanteras -->
            <circle cx="13" cy="14" r="1.4" fill="#FFF" stroke="#333" stroke-width="0.4"/>
            <circle cx="23" cy="14" r="1.4" fill="#FFF" stroke="#333" stroke-width="0.4"/>
            
            <!-- Luces traseras -->
            <circle cx="13" cy="40" r="1.2" fill="#FF4444" stroke="#333" stroke-width="0.4"/>
            <circle cx="23" cy="40" r="1.2" fill="#FF4444" stroke="#333" stroke-width="0.4"/>
            
            <!-- Detalles de puertas -->
            <line x1="13" y1="25" x2="13" y2="33" stroke="#333" stroke-width="0.5" opacity="0.3"/>
            <line x1="23" y1="25" x2="23" y2="33" stroke="#333" stroke-width="0.5" opacity="0.3"/>
          </svg>
        `;
        
        const iconHtml = `
          <div style="
            filter: drop-shadow(0 4px 6px rgba(0,0,0,0.3));
            transform: rotate(0deg);
            transition: all 0.3s ease;
          ">
            ${taxiTopViewSvg}
          </div>
        `;
        
        icon = L.divIcon({
          html: iconHtml,
          className: 'custom-taxi-marker',
          iconSize: [36, 52],
          iconAnchor: [18, 26]
        });
      }
      
      const marker = isTaxi 
        ? L.marker([provider.latitude, provider.longitude], { icon }).addTo(mapRef.current!)
        : L.marker([provider.latitude, provider.longitude]).addTo(mapRef.current!);
      
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
              onclick="window.openInternalChat('${provider.user_id}', '${provider.business_name}')"
              style="flex: 1; background-color: #f59e0b; color: white; padding: 8px; border-radius: 6px; border: none; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 4px; font-size: 0.875rem;"
              title="Mensaje"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
            </button>
          </div>
          
          <button 
            onclick="window.goToProviderProfile('${provider.id}')"
            style="width: 100%; background-color: #8b5cf6; color: white; padding: 10px; border-radius: 6px; border: none; cursor: pointer; font-weight: 600; margin-bottom: 12px; font-size: 0.875rem;"
          >
            🛒 Ver productos y hacer pedido
          </button>
          
          ${provider.productos.length > 0 ? `
            <div style="margin-top: 12px;">
              <p style="font-weight: 500; font-size: 0.875rem; margin-bottom: 8px;">Productos disponibles:</p>
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

      // Store marker reference
      markersRef.current.set(provider.user_id, marker);
    });

    console.log('✅ Markers updated:', markersRef.current.size);
  }, [validProviders, onOpenChat]);

  // Setup global functions once
  useEffect(() => {
    // Add global functions for popup buttons
    (window as any).makeCall = (phone: string) => {
      window.location.href = `tel:${phone}`;
    };

    (window as any).openWhatsApp = (phone: string) => {
      const formattedPhone = phone.startsWith('+') ? phone : `+52${phone}`;
      window.open(`https://wa.me/${formattedPhone}`, '_blank');
    };

    (window as any).openInternalChat = (userId: string, providerName: string) => {
      if (onOpenChat) {
        const provider = validProviders.find(p => p.user_id === userId);
        if (provider) {
          onOpenChat(provider.id, providerName);
        }
      }
    };

    (window as any).goToProviderProfile = (providerId: string) => {
      window.location.href = `/proveedor/${providerId}`;
    };

    (window as any).showProductDetails = (providerId: string, productIndex: number) => {
      const provider = providers.find(p => p.id === providerId);
      if (provider && provider.productos[productIndex]) {
        setSelectedProduct({ 
          provider, 
          product: provider.productos[productIndex] 
        });
        setIsDialogOpen(true);
      }
    };
  }, [onOpenChat, providers]);

  if (validProviders.length === 0) {
    return (
      <div className="w-full h-full rounded-lg overflow-hidden border flex items-center justify-center bg-muted">
        <p className="text-muted-foreground">No hay proveedores con ubicación disponible</p>
      </div>
    );
  }

  return (
    <>
      <div 
        ref={mapContainerRef}
        className="w-full h-full rounded-lg overflow-hidden border"
      />

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-full md:max-w-2xl h-full md:h-auto max-h-screen overflow-y-auto">
          {selectedProduct && (
            <>
              <DialogHeader className="sticky top-0 bg-background pb-4 border-b">
                <DialogTitle className="text-2xl font-bold">{selectedProduct.product.nombre}</DialogTitle>
              </DialogHeader>
              
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
                
                <div className="pt-4 border-t">
                  <p className="text-sm font-semibold text-muted-foreground mb-3">Contactar</p>
                  <div className="flex flex-col sm:flex-row gap-3">
                    <Button 
                      className="flex-1 bg-blue-600 hover:bg-blue-700"
                      onClick={() => window.location.href = `tel:${selectedProduct.provider.business_phone}`}
                    >
                      <Phone className="w-4 h-4 mr-2" />
                      Llamar
                    </Button>
                    <Button 
                      className="flex-1 bg-green-600 hover:bg-green-700"
                      onClick={() => {
                        const formattedPhone = selectedProduct.provider.business_phone.startsWith('+') 
                          ? selectedProduct.provider.business_phone 
                          : `+52${selectedProduct.provider.business_phone}`;
                        window.open(`https://wa.me/${formattedPhone}`, '_blank');
                      }}
                    >
                      <MessageCircle className="w-4 h-4 mr-2" />
                      WhatsApp
                    </Button>
                    <Button 
                      className="flex-1 bg-yellow-600 hover:bg-yellow-700"
                      onClick={async () => {
                        if (onOpenChat) {
                          // Get user_id for the provider
                          const { data: providerData } = await supabase
                            .from('proveedores')
                            .select('user_id')
                            .eq('id', selectedProduct.provider.id)
                            .single();
                          
                          if (providerData?.user_id) {
                            onOpenChat(selectedProduct.provider.id, selectedProduct.provider.business_name);
                          }
                        }
                      }}
                    >
                      <MessageSquare className="w-4 h-4 mr-2" />
                      Chat
                    </Button>
                  </div>
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
};

export default ProvidersMap;
