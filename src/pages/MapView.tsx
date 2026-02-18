import { useState, useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { GlobalHeader } from '@/components/GlobalHeader';
import { RealtimeMap } from '@/components/RealtimeMap';
import { MessagingPanel } from '@/components/MessagingPanel';
import { StatusControl } from '@/components/StatusControl';

import MapSearchBar from '@/components/MapSearchBar';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Users, Route } from 'lucide-react';
import L from 'leaflet';
import { useRouteOverlay, routeNameToId } from '@/hooks/useRouteOverlay';

export default function MapView() {
  const [searchParams] = useSearchParams();
  const filterType = searchParams.get('type') as 'taxi' | 'ruta' | null;
  const privateRouteToken = searchParams.get('token');
  const publicRouteProductoId = searchParams.get('producto');
  const fleetParam = searchParams.get('fleet') === 'true';
  const fleetTypeParam = searchParams.get('fleetType') as 'publico' | 'foraneo' | 'privado' | 'taxi' | null;
  const [isMessagingOpen, setIsMessagingOpen] = useState(false);
  const [selectedReceiverId, setSelectedReceiverId] = useState<string | undefined>();
  const [selectedReceiverName, setSelectedReceiverName] = useState<string | undefined>();
  const [hasActiveSubscription, setHasActiveSubscription] = useState(false);
  const [isProvider, setIsProvider] = useState(false);
  const [privateRouteProviderId, setPrivateRouteProviderId] = useState<string | null>(null);
  const [privateRouteName, setPrivateRouteName] = useState<string | null>(null);
  const [privateRouteProductoId, setPrivateRouteProductoId] = useState<string | null>(null);
  const [routeTypeLabel, setRouteTypeLabel] = useState<string>('privada');
  const [viewingRouteType, setViewingRouteType] = useState<string | null>(null);
  const [fleetUserIds, setFleetUserIds] = useState<string[]>([]);
  const [isFleetOwner, setIsFleetOwner] = useState(false);
  const [fleetMode, setFleetMode] = useState(fleetParam);
  const [fleetUnitCount, setFleetUnitCount] = useState(0);
  const [activeRouteOverlay, setActiveRouteOverlay] = useState<string | null>(null);
  const leafletMapRef = useRef<L.Map | null>(null);
  const searchMarkerRef = useRef<L.Marker | null>(null);
  const { toast } = useToast();

  // Route polyline overlay on the map
  useRouteOverlay(leafletMapRef, activeRouteOverlay);

  // GPS tracking ahora es global via GlobalProviderTracking

  useEffect(() => {
    // If we have a public route product ID, fetch its provider info
    // For PUBLIC routes: only set userId filter, NOT productoId (public routes don't use assignments)
    if (publicRouteProductoId && !privateRouteToken) {
      const fetchPublicRoute = async () => {
        const { data: producto } = await supabase
          .from('productos')
          .select('id, nombre, proveedor_id, route_type, is_private, proveedores(user_id)')
          .eq('id', publicRouteProductoId)
          .maybeSingle();
        
      if (producto) {
          setPrivateRouteProviderId((producto.proveedores as any)?.user_id || null);
          setPrivateRouteName(producto.nombre);
          setPrivateRouteProductoId(producto.id);
          const rt = (producto as any).route_type;
          setViewingRouteType(rt || 'urbana');
          setRouteTypeLabel(rt === 'foranea' ? 'foránea' : rt === 'privada' ? 'privada' : 'pública');
        }
      };
      fetchPublicRoute();
    }

    // If we have a token, fetch the private route info
    if (privateRouteToken) {
      const fetchPrivateRoute = async () => {
        // Try reading the product directly (owner/chofer can read via RLS)
        let { data: producto, error } = await supabase
          .from('productos')
          .select('id, nombre, proveedor_id, is_private, route_type, proveedores(user_id)')
          .eq('invite_token', privateRouteToken)
          .eq('is_private', true)
          .maybeSingle();
        
        // If RLS blocks (passenger not yet invited), try via edge function
        if (!producto) {
          // Fallback: query without is_private filter to find any matching token
          const { data: publicProduct } = await supabase
            .from('productos')
            .select('id, nombre, proveedor_id, route_type, proveedores(user_id)')
            .eq('invite_token', privateRouteToken)
            .maybeSingle();
          
          if (publicProduct) {
            producto = { ...publicProduct, is_private: true } as any;
          }
        }
        
        if (!producto) {
          console.error('[MapView] Error fetching private route:', error);
          toast({
            title: "Enlace inválido",
            description: "La ruta privada no existe o el enlace ha expirado",
            variant: "destructive",
          });
          return;
        }
        
        setPrivateRouteProviderId((producto.proveedores as any)?.user_id || null);
        setPrivateRouteName(producto.nombre);
        setPrivateRouteProductoId(producto.id);
        
        const rt = (producto as any).route_type;
        setViewingRouteType(rt || 'privada');
        const label = rt === 'foranea' ? 'foránea' : rt === 'privada' ? 'privada' : 'pública';
        setRouteTypeLabel(label);
        
        toast({
          title: `Ruta: ${producto.nombre}`,
          description: `Mostrando ubicación de la ruta ${label}`,
        });
      };
      
      fetchPrivateRoute();
    }

    const checkSubscription = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Check if user is a provider
      const { data: profile } = await supabase
        .from('profiles')
        .select('id, role')
        .eq('user_id', user.id)
        .single();

      if (profile?.role === 'proveedor') {
        setIsProvider(true);

        // Check if this proveedor owns private routes (fleet owner)
        const { data: proveedor } = await supabase
          .from('proveedores')
          .select('id')
          .eq('user_id', user.id)
          .single();

        if (proveedor) {
          const { data: privateRoutes, count } = await supabase
            .from('productos')
            .select('id', { count: 'exact' })
            .eq('proveedor_id', proveedor.id)
            .eq('is_private', true);

          if (count && count > 0) {
            setIsFleetOwner(true);
            
            // Build fleet user IDs filtered by transport type if specified
            let driverUserIds: string[] = [];
            
            if (fleetTypeParam) {
              // Get unit IDs for this transport type
              const { data: units } = await supabase
                .from('unidades_empresa')
                .select('id')
                .eq('proveedor_id', proveedor.id)
                .eq('transport_type', fleetTypeParam)
                .eq('is_active', true);
              
              const unitIds = units?.map(u => u.id) || [];
              
              if (unitIds.length > 0) {
                // Get drivers assigned to these units
                const { data: assignments } = await supabase
                  .from('asignaciones_chofer')
                  .select('chofer_id')
                  .in('unidad_id', unitIds);
                
                const choferIds = [...new Set(assignments?.map(a => a.chofer_id) || [])];
                
                if (choferIds.length > 0) {
                  const { data: drivers } = await supabase
                    .from('choferes_empresa')
                    .select('user_id')
                    .in('id', choferIds)
                    .eq('is_active', true)
                    .not('user_id', 'is', null);
                  
                  driverUserIds = drivers?.map(d => d.user_id).filter(Boolean) as string[] || [];
                }
              }
            } else {
              // No filter: get all active drivers
              const { data: drivers } = await supabase
                .from('choferes_empresa')
                .select('user_id')
                .eq('proveedor_id', proveedor.id)
                .eq('is_active', true)
                .not('user_id', 'is', null);
              
              driverUserIds = drivers?.map(d => d.user_id).filter(Boolean) as string[] || [];
            }
            
            const allFleetUserIds = [user.id, ...driverUserIds.filter(id => id !== user.id)];
            setFleetUserIds(allFleetUserIds);
            setFleetUnitCount(allFleetUserIds.length);
          }
        }

        console.log('[MapView] Syncing subscription from Stripe...');
        
        // Call check-subscription to sync from Stripe silently
        const { data: { session } } = await supabase.auth.getSession();
        if (session) {
          try {
            const { data: syncResult, error: syncError } = await supabase.functions.invoke(
              'check-subscription',
              {
                headers: {
                  Authorization: `Bearer ${session.access_token}`
                }
              }
            );

            if (syncError) {
              console.error('[MapView] Error syncing subscription:', syncError);
            } else {
              console.log('[MapView] Subscription sync result:', syncResult);
              if (syncResult?.subscribed) {
                setHasActiveSubscription(true);
              }
            }
          } catch (err) {
            console.error('[MapView] Exception syncing subscription:', err);
          }
        }

        // Also check database in case sync just completed
        const { data: subscription } = await supabase
          .from('subscriptions')
          .select('status, end_date')
          .eq('profile_id', profile.id)
          .eq('status', 'activa')
          .maybeSingle();

        if (subscription) {
          if (!subscription.end_date || new Date(subscription.end_date) > new Date()) {
            setHasActiveSubscription(true);
          }
        }
      }
    };

    // Check if current user is a driver with today's assignment → auto-activate route overlay
    const checkDriverRoute = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: driver } = await supabase
        .from('choferes_empresa')
        .select('id')
        .eq('user_id', user.id)
        .eq('is_active', true)
        .maybeSingle();

      if (!driver) return;

      const today = new Date().toISOString().split('T')[0];
      const { data: assignment } = await supabase
        .from('asignaciones_chofer')
        .select('producto_id, productos(nombre)')
        .eq('chofer_id', driver.id)
        .eq('fecha', today)
        .maybeSingle();

      if (assignment) {
        const routeName = (assignment.productos as any)?.nombre;
        const overlayId = routeNameToId(routeName);
        if (overlayId) {
          console.log(`[MapView] Auto-activating route overlay: ${overlayId} (from "${routeName}")`);
          setActiveRouteOverlay(overlayId);
        }
      }
    };

    checkSubscription();
    checkDriverRoute();
  }, [privateRouteToken, publicRouteProductoId, toast]);

  const handleOpenChat = (userId: string, apodo: string) => {
    setSelectedReceiverId(userId);
    setSelectedReceiverName(apodo);
    setIsMessagingOpen(true);
  };

  const handleSearchLocation = (lat: number, lng: number, label: string) => {
    const map = leafletMapRef.current;
    if (!map) return;

    // Remove previous search marker
    if (searchMarkerRef.current) {
      searchMarkerRef.current.remove();
      searchMarkerRef.current = null;
    }

    // Fly to location
    map.flyTo([lat, lng], 17, { duration: 1.5 });

    // Add a temporary marker
    const marker = L.marker([lat, lng], {
      icon: L.divIcon({
        html: '<div style="font-size:32px;filter:drop-shadow(2px 2px 2px rgba(0,0,0,0.3));">📍</div>',
        className: 'search-result-marker',
        iconSize: [32, 32],
        iconAnchor: [16, 32],
      }),
    }).addTo(map);

    marker.bindPopup(
      `<div style="background:#273547;color:#fafafa;padding:10px;border-radius:8px;min-width:180px;">
        <p style="font-weight:600;font-size:14px;margin:0 0 4px 0;">📍 ${label}</p>
        <button onclick="this.closest('.leaflet-popup').querySelector('.leaflet-popup-close-button').click();window.__removeSearchMarker&&window.__removeSearchMarker()" 
          style="background:#ef4444;color:white;border:none;padding:4px 10px;border-radius:4px;font-size:12px;cursor:pointer;margin-top:4px;">
          Quitar marcador
        </button>
      </div>`,
      { closeButton: true, className: 'custom-popup-dark' }
    ).openPopup();

    searchMarkerRef.current = marker;

    // Global function to remove marker from popup button
    (window as any).__removeSearchMarker = () => {
      if (searchMarkerRef.current) {
        searchMarkerRef.current.remove();
        searchMarkerRef.current = null;
      }
    };
  };

  return (
    <div className="min-h-screen flex flex-col">
      <GlobalHeader title={
        fleetMode 
          ? `Mi Flota${fleetTypeParam ? ` - ${fleetTypeParam === 'publico' ? 'Público' : fleetTypeParam === 'foraneo' ? 'Foráneo' : fleetTypeParam === 'privado' ? 'Privado' : 'Taxi'}` : ''}`
          :
        filterType === 'taxi' ? 'Taxis Disponibles' : 
        filterType === 'ruta' ? 'Rutas de Transporte' : 
        'Mapa en Tiempo Real'
      } />

      {/* Map with overlays */}
      <div className="flex-1 relative">
        <RealtimeMap 
          onOpenChat={handleOpenChat} 
          filterType={fleetMode ? null : filterType}
          privateRouteUserId={fleetMode ? null : privateRouteProviderId}
          privateRouteProductoId={fleetMode ? null : privateRouteProductoId}
          privateRouteName={fleetMode ? null : privateRouteName}
          viewingRouteType={fleetMode ? null : viewingRouteType}
          fleetUserIds={fleetMode ? fleetUserIds : undefined}
          mapRef={leafletMapRef}
        />
        
        {/* Top-left controls: fleet toggle + search */}
        <div className="absolute top-4 left-4 z-30">
          <div className="flex flex-col gap-2">
            {isFleetOwner && !privateRouteToken && (
              <Button
                variant={fleetMode ? "default" : "outline"}
                size="sm"
                onClick={() => setFleetMode(!fleetMode)}
                className={`shadow-lg backdrop-blur-sm ${
                  fleetMode 
                    ? 'bg-amber-500 hover:bg-amber-600 text-black font-bold' 
                    : 'bg-background/90 hover:bg-background text-foreground'
                }`}
              >
                <Users className="h-4 w-4 mr-2" />
                {fleetMode ? `Mi Flota (${fleetUnitCount})` : '🚌 Mi Flota'}
              </Button>
            )}
            {/* Route overlay toggle — always visible for testing */}
            {!privateRouteToken && !fleetMode && (
              <Button
                variant={activeRouteOverlay ? "default" : "outline"}
                size="sm"
                onClick={() => setActiveRouteOverlay(prev => prev ? null : 'L1_MANGA')}
                className={`shadow-lg backdrop-blur-sm border-2 ${
                  activeRouteOverlay 
                    ? 'bg-blue-600 hover:bg-blue-700 text-white font-bold border-blue-400' 
                    : 'bg-background/95 hover:bg-background text-foreground border-blue-300'
                }`}
              >
                <Route className="h-4 w-4 mr-2" />
                {activeRouteOverlay ? '🛣️ Ocultar Ruta L1' : '🛣️ Ver Ruta L1 Manga'}
              </Button>
            )}
            <MapSearchBar onSelectLocation={handleSearchLocation} />
          </div>
        </div>
        
        {/* Route indicator with favorite button */}
        {privateRouteName && !fleetMode && (
          <div className={`absolute z-30 bg-background/90 backdrop-blur-sm px-4 py-2 rounded-lg shadow-md flex flex-col ${isFleetOwner ? 'top-14 left-4' : 'top-4 left-4'}`}>
            <span className="text-sm font-bold">
              Ruta: {privateRouteName}
            </span>
            <span className="text-xs text-muted-foreground">
              Mostrando ubicación de la ruta {routeTypeLabel}
            </span>
          </div>
        )}
        
        {/* Status Control overlay for providers on map */}
        {isProvider && (
          <div className="absolute top-4 right-4 z-30" style={{ top: privateRouteName && !fleetMode ? '60px' : '16px' }}>
            <StatusControl />
          </div>
        )}
      </div>

      {/* Messaging Panel (se abre desde el popup del mapa) */}
      <MessagingPanel 
        isOpen={isMessagingOpen}
        onClose={() => setIsMessagingOpen(false)}
        receiverId={selectedReceiverId}
        receiverName={selectedReceiverName}
      />

    </div>
  );
}
