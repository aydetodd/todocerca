import { useState } from 'react';
import { useFavoritos, Favorito } from '@/hooks/useFavoritos';
import { GlobalHeader } from '@/components/GlobalHeader';
import { NavigationBar } from '@/components/NavigationBar';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Skeleton } from '@/components/ui/skeleton';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { 
  Heart, 
  Package, 
  Store, 
  Gift, 
  Trash2, 
  MapPin, 
  Phone, 
  TrendingDown, 
  TrendingUp,
  AlertCircle,
  Map
} from 'lucide-react';
import { ProductPhotoCarousel } from '@/components/ProductPhotoCarousel';
import { ListingPhotoCarousel } from '@/components/ListingPhotoCarousel';
import { MessagingPanel } from '@/components/MessagingPanel';
import ProvidersMap from '@/components/ProvidersMapView';

export default function Favoritos() {
  const { favoritos, loading, userId, removeFavorito, getChangedFavoritos } = useFavoritos();
  const [showMap, setShowMap] = useState(false);
  const [isMessagingOpen, setIsMessagingOpen] = useState(false);
  const [selectedReceiverId, setSelectedReceiverId] = useState<string | undefined>();
  const [selectedReceiverName, setSelectedReceiverName] = useState<string | undefined>();

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
                <TabsList className="w-full grid grid-cols-3 mb-4">
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
                  <TabsTrigger value="gratis" className="flex items-center gap-1">
                    <Gift className="h-4 w-4" />
                    <span className="hidden sm:inline">Gratis</span>
                    {listings.length > 0 && (
                      <Badge variant="secondary" className="ml-1">{listings.length}</Badge>
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
                      />
                    ))
                  )}
                </TabsContent>

                <TabsContent value="gratis" className="space-y-3">
                  {listings.length === 0 ? (
                    <p className="text-center text-muted-foreground py-8">
                      No tienes cosas gratis favoritas
                    </p>
                  ) : (
                    listings.map((fav) => (
                      <FavoritoListingCard 
                        key={fav.id} 
                        favorito={fav} 
                        onDelete={() => handleDelete(fav.id)} 
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
function FavoritoProductoCard({ favorito, onDelete }: { favorito: Favorito; onDelete: () => void }) {
  const producto = favorito.producto!;
  const precioChanged = favorito.precio_guardado !== null && producto.precio !== favorito.precio_guardado;
  const stockChanged = favorito.stock_guardado !== null && producto.stock !== favorito.stock_guardado;
  const precioBajo = precioChanged && producto.precio < (favorito.precio_guardado || 0);
  const precioAlto = precioChanged && producto.precio > (favorito.precio_guardado || 0);

  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex gap-4">
          <div className="w-24 h-24 flex-shrink-0 rounded-lg overflow-hidden">
            <ProductPhotoCarousel productoId={producto.id} />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold truncate">{producto.nombre}</h3>
            {producto.descripcion && (
              <p className="text-sm text-muted-foreground line-clamp-1">{producto.descripcion}</p>
            )}
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
          </div>
          <Button variant="ghost" size="icon" onClick={onDelete}>
            <Trash2 className="h-4 w-4 text-destructive" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function FavoritoProveedorCard({ favorito, onDelete }: { favorito: Favorito; onDelete: () => void }) {
  const proveedor = favorito.proveedor!;

  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-semibold">{proveedor.nombre}</h3>
            {proveedor.telefono && (
              <div className="flex items-center gap-1 text-sm text-muted-foreground mt-1">
                <Phone className="h-3 w-3" />
                {proveedor.telefono}
              </div>
            )}
            {proveedor.latitude && proveedor.longitude && (
              <div className="flex items-center gap-1 text-sm text-muted-foreground mt-1">
                <MapPin className="h-3 w-3" />
                Con ubicación
              </div>
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
