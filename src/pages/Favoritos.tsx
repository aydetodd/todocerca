import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useFavoritos, Favorito } from '@/hooks/useFavoritos';
import { GlobalHeader } from '@/components/GlobalHeader';
import { NavigationBar } from '@/components/NavigationBar';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Skeleton } from '@/components/ui/skeleton';

import { 
  Heart, 
  Package, 
  Store, 
  Trash2, 
  MapPin, 
  Phone, 
  TrendingDown, 
  TrendingUp,
  AlertCircle,
  Map,
  ExternalLink
} from 'lucide-react';
import { ProductPhotoCarousel } from '@/components/ProductPhotoCarousel';
import { ListingPhotoCarousel } from '@/components/ListingPhotoCarousel';
import { MessagingPanel } from '@/components/MessagingPanel';
import ProvidersMap from '@/components/ProvidersMapView';
import { supabase } from '@/integrations/supabase/client';

export default function Favoritos() {
  const navigate = useNavigate();
  const { favoritos, loading, userId, removeFavorito, getChangedFavoritos } = useFavoritos();
  const [showMap, setShowMap] = useState(false);
  const [isMessagingOpen, setIsMessagingOpen] = useState(false);
  const [selectedReceiverId, setSelectedReceiverId] = useState<string | undefined>();
  const [selectedReceiverName, setSelectedReceiverName] = useState<string | undefined>();
  const [routeCategoryId, setRouteCategoryId] = useState<string | null>(null);
  const [routeActiveMap, setRouteActiveMap] = useState<Record<string, boolean>>({});
  const [providerRouteData, setProviderRouteData] = useState<Record<string, { isRoute: boolean; token: string | null; names: string[] }>>({});

  // Batch fetch route category, active status, and provider route data
  useEffect(() => {
    if (favoritos.length === 0) return;
    
    const fetchBatchData = async () => {
      // 1. Fetch route category
      const { data: cat } = await supabase
        .from('product_categories')
        .select('id')
        .eq('name', 'Rutas de Transporte')
        .maybeSingle();
      
      if (cat) {
        setRouteCategoryId(cat.id);
        
        // 2. Batch check active assignments for private route products only
        const privateRouteProductIds = favoritos
          .filter(f => f.tipo === 'producto' && f.producto?.category_id === cat.id && f.producto?.is_private)
          .map(f => f.producto!.id);
        
        if (privateRouteProductIds.length > 0) {
          const today = new Date().toISOString().split('T')[0];
          const { data: assignments } = await supabase
            .from('asignaciones_chofer')
            .select('producto_id')
            .in('producto_id', privateRouteProductIds)
            .eq('fecha', today);
          
          const activeMap: Record<string, boolean> = {};
          privateRouteProductIds.forEach(id => {
            activeMap[id] = !!assignments?.some(a => a.producto_id === id);
          });
          setRouteActiveMap(activeMap);
        }
      }

      // 3. Batch fetch route products for all favorited providers
      const providerIds = favoritos
        .filter(f => f.tipo === 'proveedor' && f.proveedor)
        .map(f => f.proveedor!.id);

      if (providerIds.length > 0) {
        const { data: allProducts } = await supabase
          .from('productos')
          .select('id, nombre, invite_token, is_private, proveedor_id')
          .in('proveedor_id', providerIds);
        
        const routeData: Record<string, { isRoute: boolean; token: string | null; names: string[] }> = {};
        providerIds.forEach(pid => {
          const products = allProducts?.filter(p => p.proveedor_id === pid) || [];
          const privateRoutes = products.filter(p => p.is_private);
          routeData[pid] = {
            isRoute: privateRoutes.length > 0,
            token: privateRoutes[0]?.invite_token || null,
            names: privateRoutes.length > 0 ? privateRoutes.map(p => p.nombre) : products.map(p => p.nombre),
          };
        });
        setProviderRouteData(routeData);
      }
    };
    
    fetchBatchData();
  }, [favoritos]);

  const handleOpenChat = (userId: string, apodo: string) => {
    setSelectedReceiverId(userId);
    setSelectedReceiverName(apodo);
    setIsMessagingOpen(true);
  };
  
  const productos = favoritos.filter(f => f.tipo === 'producto' && f.producto);
  const proveedores = favoritos.filter(f => f.tipo === 'proveedor' && f.proveedor);
  const listings = favoritos.filter(f => f.tipo === 'listing' && f.listing);
  const changedFavoritos = getChangedFavoritos();

  const handleDelete = async (id: string) => {
    await removeFavorito(id);
  };

  // Prepare providers for map
  const mapProviders = [
    ...productos.filter(f => f.producto).map(f => ({
      id: f.producto!.proveedor_id,
      business_name: f.producto!.nombre,
      business_address: '',
      business_phone: null,
      latitude: 0,
      longitude: 0,
      user_id: '',
      productos: [{
        id: f.producto!.id,
        nombre: f.producto!.nombre,
        precio: f.producto!.precio,
        descripcion: f.producto!.descripcion || '',
        stock: f.producto!.stock,
        unit: f.producto!.unit || '',
        categoria: ''
      }]
    })),
    ...proveedores.filter(f => f.proveedor?.latitude && f.proveedor?.longitude).map(f => ({
      id: f.proveedor!.id,
      business_name: f.proveedor!.nombre,
      business_address: '',
      business_phone: f.proveedor!.telefono,
      latitude: f.proveedor!.latitude!,
      longitude: f.proveedor!.longitude!,
      user_id: f.proveedor!.user_id,
      productos: []
    })),
    ...listings.filter(f => f.listing?.latitude && f.listing?.longitude).map(f => ({
      id: f.listing!.id,
      business_name: f.listing!.title,
      business_address: '',
      business_phone: null,
      latitude: f.listing!.latitude!,
      longitude: f.listing!.longitude!,
      user_id: '',
      productos: []
    }))
  ].filter(p => p.latitude && p.longitude);

  if (!userId) {
    return (
      <div className="min-h-screen bg-background">
        <GlobalHeader />
        <div className="container mx-auto px-4 py-8">
          <Card className="border-dashed border-2">
            <CardContent className="py-12 text-center">
              <Heart className="h-16 w-16 mx-auto mb-4 text-muted-foreground/50" />
              <h2 className="text-xl font-semibold mb-2">Inicia sesión</h2>
              <p className="text-muted-foreground">Para guardar y ver tus favoritos</p>
            </CardContent>
          </Card>
        </div>
        <NavigationBar />
      </div>
    );
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-background">
        <GlobalHeader />
        <div className="container mx-auto px-4 py-8 space-y-4">
          <Skeleton className="h-12 w-48" />
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-32 w-full" />
        </div>
        <NavigationBar />
      </div>
    );
  }

  return (
    <>
      {/* Full Screen Map */}
      {showMap && mapProviders.length > 0 && (
        <div className="fixed inset-0 z-50 bg-background">
          <div className="absolute top-4 left-4 z-[9999]">
            <Button variant="default" onClick={() => setShowMap(false)}>
              ← Volver
            </Button>
          </div>
          <div className="h-full w-full">
            <ProvidersMap providers={mapProviders} onOpenChat={handleOpenChat} vehicleFilter="all" />
          </div>
        </div>
      )}

      {!showMap && (
        <div className="min-h-screen bg-background pb-20">
          <GlobalHeader />
          
          <div className="container mx-auto px-4 py-6">
            <div className="flex items-center justify-between mb-6">
              <h1 className="text-2xl font-bold flex items-center gap-2">
                <Heart className="h-6 w-6 text-primary" />
                Mis Favoritos
              </h1>
              {mapProviders.length > 0 && (
                <Button variant="outline" onClick={() => setShowMap(true)}>
                  <Map className="h-4 w-4 mr-2" />
                  Ver en mapa
                </Button>
              )}
            </div>

            {/* Notifications for changes */}
            {changedFavoritos.length > 0 && (
              <Card className="mb-4 border-primary/50 bg-primary/5">
                <CardContent className="py-3">
                  <div className="flex items-center gap-2 text-primary">
                    <AlertCircle className="h-5 w-5" />
                    <span className="font-medium">
                      {changedFavoritos.length} favorito(s) con cambios de precio o stock
                    </span>
                  </div>
                </CardContent>
              </Card>
            )}

            {favoritos.length === 0 ? (
              <Card className="border-dashed border-2">
                <CardContent className="py-12 text-center">
                  <Heart className="h-16 w-16 mx-auto mb-4 text-muted-foreground/50" />
                  <h2 className="text-xl font-semibold mb-2">Sin favoritos</h2>
                  <p className="text-muted-foreground">
                    Guarda productos, proveedores o cosas gratis para acceder rápidamente
                  </p>
                </CardContent>
              </Card>
            ) : (
              <Tabs defaultValue="productos" className="w-full">
                <TabsList className="w-full grid grid-cols-2 mb-4">
                  <TabsTrigger value="productos" className="flex items-center gap-1">
                    <Package className="h-4 w-4" />
                    <span className="hidden sm:inline">Productos</span>
                    {productos.length > 0 && (
                      <Badge variant="secondary" className="ml-1">{productos.length}</Badge>
                    )}
                  </TabsTrigger>
                  <TabsTrigger value="proveedores" className="flex items-center gap-1">
                    <Store className="h-4 w-4" />
                    <span className="hidden sm:inline">Proveedores</span>
                    {proveedores.length > 0 && (
                      <Badge variant="secondary" className="ml-1">{proveedores.length}</Badge>
                    )}
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="productos" className="space-y-3">
                  {productos.length === 0 ? (
                    <p className="text-center text-muted-foreground py-8">
                      No tienes productos favoritos
                    </p>
                  ) : (
                    productos.map((fav) => (
                      <FavoritoProductoCard 
                        key={fav.id} 
                        favorito={fav} 
                        onDelete={() => handleDelete(fav.id)}
                        routeCategoryId={routeCategoryId}
                        onNavigate={(path) => navigate(path)}
                        routeActive={routeActiveMap[fav.producto?.id || ''] ?? null}
                      />
                    ))
                  )}
                </TabsContent>

                <TabsContent value="proveedores" className="space-y-3">
                  {proveedores.length === 0 ? (
                    <p className="text-center text-muted-foreground py-8">
                      No tienes proveedores favoritos
                    </p>
                  ) : (
                    proveedores.map((fav) => (
                      <FavoritoProveedorCard 
                        key={fav.id} 
                        favorito={fav} 
                        onDelete={() => handleDelete(fav.id)}
                        onNavigate={(path) => navigate(path)}
                        routeData={providerRouteData[fav.proveedor?.id || ''] || null}
                      />
                    ))
                  )}
                </TabsContent>

              </Tabs>
            )}
          </div>

          <NavigationBar />
        </div>
      )}

      <MessagingPanel
        isOpen={isMessagingOpen}
        onClose={() => setIsMessagingOpen(false)}
        receiverId={selectedReceiverId}
        receiverName={selectedReceiverName}
      />
    </>
  );
}

// Card components
function FavoritoProductoCard({ favorito, onDelete, routeCategoryId, onNavigate, routeActive }: { 
  favorito: Favorito; 
  onDelete: () => void;
  routeCategoryId: string | null;
  onNavigate: (path: string) => void;
  routeActive: boolean | null;
}) {
  const producto = favorito.producto!;
  const precioChanged = favorito.precio_guardado !== null && producto.precio !== favorito.precio_guardado;
  const stockChanged = favorito.stock_guardado !== null && producto.stock !== favorito.stock_guardado;
  const precioBajo = precioChanged && producto.precio < (favorito.precio_guardado || 0);
  const isRoute = producto.category_id === routeCategoryId;

  const handleNavigate = () => {
    if (isRoute) {
      if (producto.is_private && producto.invite_token) {
        onNavigate(`/mapa?token=${producto.invite_token}`);
      } else {
        onNavigate(`/mapa?type=ruta&producto=${producto.id}`);
      }
    } else {
      onNavigate(`/proveedor/${producto.proveedor_id}?action=pedido`);
    }
  };

  return (
    <Card 
      className="cursor-pointer hover:bg-accent/50 transition-colors" 
      onClick={handleNavigate}
    >
      <CardContent className="p-4">
        <div className="flex gap-4">
          {!isRoute && (
            <div className="w-24 h-24 flex-shrink-0 rounded-lg overflow-hidden">
              <ProductPhotoCarousel productoId={producto.id} />
            </div>
          )}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1">
              {isRoute && <span className="text-lg">{producto.is_private ? '🔒' : '🚌'}</span>}
              <h3 className="font-semibold truncate">{producto.nombre}</h3>
              {isRoute && (
                <Badge variant="outline" className="text-xs shrink-0">Ruta</Badge>
              )}
            </div>
            {producto.descripcion && (
              <p className="text-sm text-muted-foreground line-clamp-1">{producto.descripcion}</p>
            )}
            {!isRoute && (
              <>
                <div className="flex items-center gap-2 mt-2">
                  <span className="font-bold text-primary">${producto.precio}</span>
                  {precioChanged && (
                    <Badge variant={precioBajo ? "default" : "destructive"} className="text-xs">
                      {precioBajo ? <TrendingDown className="h-3 w-3 mr-1" /> : <TrendingUp className="h-3 w-3 mr-1" />}
                      era ${favorito.precio_guardado}
                    </Badge>
                  )}
                </div>
                <div className="flex items-center gap-2 mt-1">
                  <span className="text-sm text-muted-foreground">Stock: {producto.stock}</span>
                  {stockChanged && (
                    <Badge variant="outline" className="text-xs">
                      era {favorito.stock_guardado}
                    </Badge>
                  )}
                </div>
              </>
            )}
            {isRoute ? (
              <div className="flex items-center gap-2 mt-2">
                <div className="flex items-center gap-1 text-xs font-medium text-primary bg-primary/10 rounded-md px-2 py-1 w-fit">
                  <MapPin className="h-3 w-3" />
                  Ver ubicación en mapa
                </div>
                {producto.is_private && routeActive === false && (
                  <div className="flex items-center gap-1 text-xs text-muted-foreground">
                    <AlertCircle className="h-3 w-3" />
                    Sin servicio activo
                  </div>
                )}
              </div>
            ) : (
              <div className="flex items-center gap-1 mt-1 text-xs text-primary">
                <ExternalLink className="h-3 w-3" />
                Ver proveedor
              </div>
            )}
          </div>
          <Button variant="ghost" size="icon" onClick={(e) => { e.stopPropagation(); onDelete(); }}>
            <Trash2 className="h-4 w-4 text-destructive" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function FavoritoProveedorCard({ favorito, onDelete, onNavigate, routeData }: { 
  favorito: Favorito; 
  onDelete: () => void;
  onNavigate: (path: string) => void;
  routeData: { isRoute: boolean; token: string | null; names: string[] } | null;
}) {
  const proveedor = favorito.proveedor!;
  const isRouteProvider = routeData?.isRoute ?? false;
  const routeProductNames = routeData?.names ?? [];

  const handleNavigate = () => {
    if (isRouteProvider && routeData?.token) {
      onNavigate(`/mapa?type=ruta&token=${routeData.token}`);
    } else {
      onNavigate(`/proveedor/${proveedor.id}`);
    }
  };

  return (
    <Card className="cursor-pointer hover:bg-accent/50 transition-colors" onClick={handleNavigate}>
      <CardContent className="p-4">
        <div className="flex items-center justify-between">
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold">{proveedor.nombre}</h3>
            {isRouteProvider && (
              <Badge variant="outline" className="text-xs mt-1">🚌 Transporte</Badge>
            )}
            {routeProductNames.length > 0 && (
              <div className="mt-1 space-y-0.5">
                {routeProductNames.map((name, i) => (
                  <p key={i} className="text-sm text-muted-foreground flex items-center gap-1">
                    <span>🛣️</span> {name}
                  </p>
                ))}
              </div>
            )}
            {!isRouteProvider && proveedor.telefono && (
              <div className="flex items-center gap-1 text-sm text-muted-foreground mt-1">
                <Phone className="h-3 w-3" />
                {proveedor.telefono}
              </div>
            )}
            <div className="flex items-center gap-1 mt-1 text-xs text-primary">
              <ExternalLink className="h-3 w-3" />
              {isRouteProvider ? 'Ver en mapa' : 'Ver perfil'}
            </div>
          </div>
          <Button variant="ghost" size="icon" onClick={(e) => { e.stopPropagation(); onDelete(); }}>
            <Trash2 className="h-4 w-4 text-destructive" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function FavoritoListingCard({ favorito, onDelete }: { favorito: Favorito; onDelete: () => void }) {
  const listing = favorito.listing!;
  const isExpired = new Date(listing.expires_at) < new Date();

  return (
    <Card className={isExpired ? 'opacity-60' : ''}>
      <CardContent className="p-4">
        <div className="flex gap-4">
          <div className="w-24 h-24 flex-shrink-0 rounded-lg overflow-hidden">
            <ListingPhotoCarousel listingId={listing.id} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <h3 className="font-semibold truncate">{listing.title}</h3>
              <Badge variant="secondary">¡Gratis!</Badge>
            </div>
            {listing.description && (
              <p className="text-sm text-muted-foreground line-clamp-2 mt-1">{listing.description}</p>
            )}
            {isExpired ? (
              <Badge variant="destructive" className="mt-2">Expirado</Badge>
            ) : (
              <p className="text-xs text-muted-foreground mt-2">
                Expira: {new Date(listing.expires_at).toLocaleDateString()}
              </p>
            )}
          </div>
          <Button variant="ghost" size="icon" onClick={onDelete}>
            <Trash2 className="h-4 w-4 text-destructive" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
