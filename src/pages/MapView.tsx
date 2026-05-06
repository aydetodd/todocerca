import { useState, useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { GlobalHeader } from '@/components/GlobalHeader';
import { RealtimeMap } from '@/components/RealtimeMap';
import { MessagingPanel } from '@/components/MessagingPanel';
import { StatusControl } from '@/components/StatusControl';

import MapSearchBar from '@/components/MapSearchBar';
import { supabase } from '@/integrations/supabase/client';
import { getHermosilloToday } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Users, Route, Heart } from 'lucide-react';
import { useFavoritos } from '@/hooks/useFavoritos';
import L from 'leaflet';
import { useRouteOverlay, routeNameToId } from '@/hooks/useRouteOverlay';
import { FleetRouteFilter, type FleetRouteItem } from '@/components/FleetRouteFilter';

export default function MapView() {
  const [searchParams] = useSearchParams();
  const filterType = searchParams.get('type') as 'taxi' | 'ruta' | null;
  const privateRouteToken = searchParams.get('token');
  const publicRouteProductoId = searchParams.get('producto');
  const asChofer = searchParams.get('as') === 'chofer';
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
  const [activeRouteGeoJSON, setActiveRouteGeoJSON] = useState<any | null>(null);
  const [fleetRoutes, setFleetRoutes] = useState<Array<FleetRouteItem & { route_geojson: any }>>([]);
  const [visibleRouteIds, setVisibleRouteIds] = useState<Set<string>>(new Set());
  const leafletMapRef = useRef<L.Map | null>(null);
  const searchMarkerRef = useRef<L.Marker | null>(null);
  const { toast } = useToast();
  const { addFavorito, isFavorito } = useFavoritos();
  const isRouteFav = privateRouteProductoId ? isFavorito('producto', privateRouteProductoId) : false;

  const mergeRouteTraces = (routes: Array<{ id?: string; route_geojson: { features?: any[] } | null }>, allowedIds?: Set<string>) => {
    const filtered = allowedIds
      ? routes.filter((r) => r.id && allowedIds.has(r.id))
      : routes;
    const features = filtered.flatMap((route) => route.route_geojson?.features || []);
    return features.length > 0 ? { type: 'FeatureCollection', features } : null;
  };

  // Route polyline overlay on the map (catalog OR concessionaire-uploaded)
  useRouteOverlay(leafletMapRef, activeRouteOverlay, activeRouteGeoJSON);

  // GPS tracking ahora es global via GlobalProviderTracking

  useEffect(() => {
    // If we have a public route product ID, fetch its provider info
    // For PUBLIC routes: only set userId filter, NOT productoId (public routes don't use assignments)
    if (publicRouteProductoId && !privateRouteToken) {
      const fetchPublicRoute = async () => {
        const { data: producto } = await supabase
          .from('productos')
          .select('id, nombre, proveedor_id, route_type, is_private, route_geojson, proveedores(user_id)')
          .eq('id', publicRouteProductoId)
          .maybeSingle();
        
        if (producto) {
          setPrivateRouteProviderId((producto.proveedores as any)?.user_id || null);
          setPrivateRouteName(producto.nombre);
          setPrivateRouteProductoId(producto.id);
          const rt = (producto as any).route_type;
          setViewingRouteType(rt || 'urbana');
          setRouteTypeLabel(rt === 'foranea' ? 'foránea' : rt === 'privada' ? 'privada' : 'pública');
          if ((producto as any).route_geojson) {
            setActiveRouteGeoJSON((producto as any).route_geojson);
            setActiveRouteOverlay(null);
          } else {
            setActiveRouteGeoJSON(null);
            toast({
              title: 'Ruta sin trazado',
              description: 'Todavía no hay archivo KML/KMZ guardado para esta ruta.',
            });
          }
        }
      };
      fetchPublicRoute();
    }

    // If we have a token, fetch the private route info
    if (privateRouteToken) {
      const fetchPrivateRoute = async () => {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) {
          toast({
            title: "Inicia sesión",
            description: "Debes registrarte/iniciar sesión en todocerca.mx para ver esta ruta.",
            variant: "destructive",
          });
          window.location.href = `/auth?redirect=${encodeURIComponent(`/mapa?type=ruta&token=${privateRouteToken}`)}`;
          return;
        }

        const { data: producto, error } = await (supabase as any)
          .rpc('get_private_route_by_token', { _token: privateRouteToken })
          .maybeSingle();
        
        if (error || !producto) {
          console.error('[MapView] Error fetching private route:', error);
          const msg = error?.message || '';
          toast({
            title: msg.includes('reclamado') ? "Enlace ya usado" : "Enlace inválido",
            description: msg.includes('reclamado')
              ? "Este enlace personal ya fue vinculado a otra cuenta. Pide uno nuevo al concesionario."
              : (msg || "La ruta privada no existe o el enlace ha expirado"),
            variant: "destructive",
          });
          return;
        }
        
        setPrivateRouteProviderId((producto as any).proveedor_user_id || null);
        setPrivateRouteName(producto.nombre);
        setPrivateRouteProductoId(producto.id);
        if ((producto as any).route_geojson) {
          setActiveRouteGeoJSON((producto as any).route_geojson);
          setActiveRouteOverlay(null);
        } else {
          setActiveRouteGeoJSON(null);
          toast({
            title: 'Ruta sin trazado',
            description: 'Todavía no hay archivo KML/KMZ guardado para esta ruta.',
          });
        }
        
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
          if (fleetMode) {
            const routeTypeMap: Record<string, string> = { publico: 'urbana', foraneo: 'foranea', privado: 'privada', taxi: 'taxi' };
            const { data: tracedRoutes } = await supabase
              .from('productos')
              .select('id, nombre, route_geojson, route_group')
              .eq('proveedor_id', proveedor.id)
              .eq('route_type', routeTypeMap[fleetTypeParam || 'privado'] || 'privada')
              .not('route_geojson', 'is', null);

            const items = (tracedRoutes || []).map((r: any) => {
              const lineFeat = r.route_geojson?.features?.find(
                (f: any) => f?.geometry?.type === 'LineString' || f?.geometry?.type === 'MultiLineString'
              );
              const color = lineFeat?.properties?.color || '#0066CC';
              return {
                id: r.id,
                nombre: r.nombre,
                route_group: r.route_group ?? null,
                color,
                route_geojson: r.route_geojson,
              };
            });
            setFleetRoutes(items);
            const allIds = new Set<string>(items.map((i) => i.id));
            setVisibleRouteIds(allIds);
            setActiveRouteGeoJSON(mergeRouteTraces(items, allIds));
            setActiveRouteOverlay(null);
          }

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
    // SKIP when viewing a specific route (producto/token in URL): the URL is the source of truth
    // to prevent cross-contamination between rutas (e.g. mostrar L1 Manga al ver Ruta 300).
    const checkDriverRoute = async () => {
      if (publicRouteProductoId || privateRouteToken || fleetMode) return;
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: drivers } = await supabase
        .from('choferes_empresa')
        .select('id')
        .eq('user_id', user.id)
        .eq('is_active', true);

      const driverIds = drivers?.map((driver) => driver.id) || [];
      if (driverIds.length === 0) return;

      const today = getHermosilloToday();
      const { data: assignment } = await supabase
        .from('asignaciones_chofer')
        .select('producto_id, productos(nombre, route_geojson)')
        .in('chofer_id', driverIds)
        .eq('fecha', today)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (assignment) {
        const routeName = (assignment.productos as any)?.nombre;
        const routeGeoJSON = (assignment.productos as any)?.route_geojson;
        if (routeGeoJSON) {
          setActiveRouteGeoJSON(routeGeoJSON);
          setActiveRouteOverlay(null);
          return;
        }
        const overlayId = routeNameToId(routeName);
        if (overlayId) {
          console.log(`[MapView] Auto-activating route overlay: ${overlayId} (from "${routeName}")`);
          setActiveRouteOverlay(overlayId);
        }
      }
    };

    checkSubscription();
    checkDriverRoute();
  }, [privateRouteToken, publicRouteProductoId, toast, fleetMode, fleetTypeParam]);

  // Re-render fleet trace overlay when user toggles the filter
  useEffect(() => {
    if (!fleetMode || fleetRoutes.length === 0) return;
    setActiveRouteGeoJSON(mergeRouteTraces(fleetRoutes, visibleRouteIds));
  }, [visibleRouteIds, fleetRoutes, fleetMode]);

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
        asChofer
          ? 'Mi ubicación como chofer'
          : fleetMode 
          ? `Mi flota en tiempo real${fleetTypeParam ? ` - ${fleetTypeParam === 'publico' ? 'Público' : fleetTypeParam === 'foraneo' ? 'Foráneo' : fleetTypeParam === 'privado' ? 'Privado' : 'Taxi'}` : ''}`
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
          fleetTransportType={fleetMode ? fleetTypeParam : null}
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
            {/* Removed hardcoded "Ver Ruta L1 Manga" test toggle — every route now uses its own
                uploaded KML/KMZ via productos.route_geojson. */}
            <MapSearchBar onSelectLocation={handleSearchLocation} />
          </div>
        </div>
        
        {/* Route indicator — anchored bottom-left so it never overlaps top controls */}
        {privateRouteName && !fleetMode && !asChofer && (
          <div className="absolute bottom-4 left-4 z-30 bg-background/90 backdrop-blur-sm px-3 py-2 rounded-lg shadow-md flex flex-col gap-2 max-w-[80vw]">
            <div className="flex flex-col">
              <span className="text-sm font-bold truncate">
                Ruta: {privateRouteName}
              </span>
              <span className="text-xs text-muted-foreground truncate">
                Ubicación de la ruta {routeTypeLabel}
              </span>
            </div>
            {privateRouteProductoId && !isRouteFav && (
              <Button
                size="sm"
                variant="default"
                className="h-8 text-xs"
                onClick={() => addFavorito('producto', privateRouteProductoId)}
              >
                <Heart className="h-3 w-3 mr-1" />
                Guardar en favoritos
              </Button>
            )}
            {privateRouteProductoId && isRouteFav && (
              <span className="text-xs text-primary flex items-center gap-1">
                <Heart className="h-3 w-3 fill-current" /> En tus favoritos
              </span>
            )}
          </div>
        )}
        {/* StatusControl removido aquí: el semáforo ya vive en el GlobalHeader para evitar duplicado */}
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
