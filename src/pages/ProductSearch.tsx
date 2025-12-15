import { useState, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Search as SearchIcon, MapPin, Phone, Package, ArrowLeft, CheckCircle2, XCircle, Map, List, ChevronDown, ChevronUp } from 'lucide-react';
import { GlobalHeader } from '@/components/GlobalHeader';
import ProvidersMap from '@/components/ProvidersMapView';
import { MessagingPanel } from '@/components/MessagingPanel';
import { NavigationBar } from '@/components/NavigationBar';
import { ProductPhotoCarousel } from '@/components/ProductPhotoCarousel';
import { trackProductSearch } from '@/lib/analytics';
import { StatusControl } from '@/components/StatusControl';
interface Category {
  id: string;
  name: string;
}

interface SearchResult {
  product_id: string;
  product_name: string;
  product_description: string;
  price: number;
  stock: number;
  unit: string;
  provider_name: string;
  provider_phone: string;
  provider_postal_code: string;
  provider_id: string;
  provider_address: string;
  provider_latitude: number | null;
  provider_longitude: number | null;
  provider_status: 'available' | 'busy';
}

interface MapProvider {
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

const ProductSearch = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [searchTerm, setSearchTerm] = useState(searchParams.get('q') || '');
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<SearchResult[]>([]);
  const [mapProviders, setMapProviders] = useState<MapProvider[]>([]);
  const [hasSearched, setHasSearched] = useState(false);
  const [isMessagingOpen, setIsMessagingOpen] = useState(false);
  const [selectedReceiverId, setSelectedReceiverId] = useState<string | undefined>();
  const [selectedReceiverName, setSelectedReceiverName] = useState<string | undefined>();
  const [categories, setCategories] = useState<Category[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string>('todas');
  const [expandedProducts, setExpandedProducts] = useState<Set<string>>(new Set());
  const [showFullScreenMap, setShowFullScreenMap] = useState(false);
  const [vehicleFilter, setVehicleFilter] = useState<'all' | 'taxi' | 'ruta'>('all');
  const [selectedRouteNumber, setSelectedRouteNumber] = useState<string>('');
  
  // Lista fija de 50 rutas para mostrar en el desplegable
  const allRouteNumbers = Array.from({ length: 50 }, (_, i) => `Ruta ${i + 1}`);

  const handleOpenChat = async (providerId: string, providerName: string) => {
    // Get the user_id for this provider
    const { data: providerData } = await supabase
      .from('proveedores')
      .select('user_id')
      .eq('id', providerId)
      .single();
    
    if (providerData?.user_id) {
      setSelectedReceiverId(providerData.user_id);
      setSelectedReceiverName(providerName);
      setIsMessagingOpen(true);
    }
  };

  useEffect(() => {
    const fetchCategories = async () => {
      const { data } = await supabase
        .from('product_categories')
        .select('id, name')
        .order('name');
      
      if (data) {
        setCategories(data);
      }
    };
    
    fetchCategories();
  }, []);

  useEffect(() => {
    const query = searchParams.get('q');
    if (query && query !== searchTerm) {
      setSearchTerm(query);
      handleSearch(null, query);
    }
  }, [searchParams]);

  // El usuario elige manualmente entre mapa y listado

  const handleSearch = async (e: React.FormEvent | null, query?: string) => {
    if (e) e.preventDefault();
    const term = query || searchTerm;
    // No buscar si el campo está vacío y la categoría es "todas"
    if (!term.trim() && selectedCategory === 'todas') return;
    
    setLoading(true);
    setHasSearched(true);
    
    try {
      // Search in productos table by name or keywords with provider location
      let query = supabase
        .from('productos')
        .select(`
          id,
          nombre,
          descripcion,
          precio,
          stock,
          unit,
          proveedor_id,
          category_id,
          product_categories (
            name
          ),
          proveedores (
            id,
            nombre,
            telefono,
            codigo_postal,
            user_id
          )
        `)
        .eq('is_available', true);
      
      // Solo aplicar filtro de nombre/keywords si hay término de búsqueda
      if (term.trim()) {
        query = query.or(`nombre.ilike.%${term}%,keywords.ilike.%${term}%`);
      }
      
      // Filtrar por categoría si no es "todas"
      if (selectedCategory !== 'todas') {
        query = query.eq('category_id', selectedCategory);
      }
      
      const { data: productos, error } = await query;

      if (error) {
        console.error('Error searching:', error);
        setResults([]);
        setMapProviders([]);
        return;
      }

      if (productos && productos.length > 0) {
        // Get unique provider user IDs to check their availability status
        const userIds = [...new Set(productos.map((p: any) => p.proveedores?.user_id).filter(Boolean))];
        
        // Fetch profiles to get availability status
        const { data: profilesData } = await supabase
          .from('profiles')
          .select('user_id, estado')
          .in('user_id', userIds)
          .in('estado', ['available', 'busy']);

        const availableUserIds = new Set(profilesData?.map(p => p.user_id) || []);
        
        // Filter products to only include those from available/busy providers
        const availableProductos = productos.filter((p: any) => 
          p.proveedores?.user_id && availableUserIds.has(p.proveedores.user_id)
        );

        if (availableProductos.length === 0) {
          setResults([]);
          setMapProviders([]);
          setLoading(false);
          return;
        }

        // Get unique provider IDs
        const proveedorIds = [...new Set(availableProductos.map((p: any) => p.proveedor_id))];
        
        // Fetch proveedores with all needed data including location
        const { data: proveedoresData, error: proveedoresError } = await supabase
          .from('proveedores')
          .select('id, nombre, telefono, codigo_postal, business_address, business_phone, latitude, longitude, user_id')
          .in('id', proveedorIds);

        if (proveedoresError) {
          console.error('Error fetching proveedores:', proveedoresError);
        }

        // Create a map of proveedor_id to provider data with status
        const providerLocationMap: Record<string, any> = {};
        const providerStatusMap: Record<string, string> = {};
        
        if (proveedoresData) {
          proveedoresData.forEach((p: any) => {
            providerLocationMap[p.id] = p;
            const profile = profilesData?.find(prof => prof.user_id === p.user_id);
            providerStatusMap[p.id] = profile?.estado || 'available'; // Default to available for providers
          });
        }

        const formattedResults: SearchResult[] = availableProductos.map((producto: any) => {
          const proveedorData = providerLocationMap[producto.proveedor_id];
          const providerStatus = providerStatusMap[producto.proveedor_id] || 'offline';
          return {
            product_id: producto.id || '',
            product_name: producto.nombre || '',
            product_description: producto.descripcion || '',
            price: producto.precio || 0,
            stock: producto.stock || 0,
            unit: producto.unit || '',
            provider_name: proveedorData?.nombre || producto.proveedores?.nombre || '',
            provider_phone: proveedorData?.business_phone || proveedorData?.telefono || '',
            provider_postal_code: proveedorData?.codigo_postal || '',
            provider_id: producto.proveedor_id || '',
            provider_address: proveedorData?.business_address || '',
            provider_latitude: proveedorData?.latitude ?? null,
            provider_longitude: proveedorData?.longitude ?? null,
            provider_status: (providerStatus === 'available' || providerStatus === 'busy') ? providerStatus : 'available',
          };
          console.log('📍 Resultado formateado:', producto.nombre, 'coords:', proveedorData?.latitude, proveedorData?.longitude);
        });
        
        setResults(formattedResults);

        // Group products by provider for the map
        const providerMap: Record<string, MapProvider> = {};
        
        formattedResults.forEach((result) => {
          if (result.provider_latitude !== null && result.provider_longitude !== null) {
            if (!providerMap[result.provider_id]) {
              const proveedorData = providerLocationMap[result.provider_id];
              providerMap[result.provider_id] = {
                id: result.provider_id,
                business_name: result.provider_name,
                business_address: result.provider_address,
                business_phone: result.provider_phone || null,
                latitude: result.provider_latitude,
                longitude: result.provider_longitude,
                user_id: proveedorData?.user_id || '',
                productos: []
              };
            }
            
            const provider = providerMap[result.provider_id];
            // Get category name from productos data
            const productoOriginal = availableProductos.find((p: any) => 
              p.nombre === result.product_name && p.proveedor_id === result.provider_id
            );
            const categoryName = productoOriginal?.product_categories?.name || 'Sin categoría';
            
            provider.productos.push({
              nombre: result.product_name,
              precio: result.price,
              descripcion: result.product_description,
              stock: result.stock,
              unit: result.unit,
              categoria: categoryName
            });
          }
        });

        const providersArray = Object.values(providerMap);
        console.log('📍 Proveedores para el mapa:', providersArray);
        setMapProviders(providersArray);
        
        // Track successful search
        trackProductSearch(term, formattedResults.length);
      } else {
        setResults([]);
        setMapProviders([]);
        trackProductSearch(term, 0);
      }
    } catch (error) {
      console.error('Error searching:', error);
      setResults([]);
      setMapProviders([]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      {/* Full Screen Map View */}
      {showFullScreenMap && mapProviders.length > 0 && (
        <div className="fixed inset-0 z-50 bg-background">
          <div className="absolute top-4 left-4 z-[9999]">
            <Button 
              variant="default" 
              size="lg"
              onClick={() => setShowFullScreenMap(false)}
              className="shadow-xl bg-primary text-primary-foreground hover:bg-primary/90"
            >
              <ArrowLeft className="h-5 w-5 mr-2" />
              Volver
            </Button>
          </div>
          <div className="absolute top-4 right-4 z-[9999]">
            <StatusControl />
          </div>
          <div className="h-full w-full">
            <ProvidersMap providers={mapProviders} onOpenChat={handleOpenChat} vehicleFilter={vehicleFilter} />
          </div>
        </div>
      )}

      {/* Normal View */}
      {!showFullScreenMap && (
        <div className="min-h-screen bg-background">
          <GlobalHeader />
          
          <div className="container mx-auto px-4 py-8">
            <h1 className="text-3xl font-bold mb-6">Buscar Productos y Servicios</h1>
        
        <form onSubmit={handleSearch} className="mb-4">
          <div className="flex gap-4">
            <Input
              type="text"
              placeholder="Buscar productos o servicios..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="h-12"
            />
            <Button type="submit" disabled={loading} className="h-12">
              <SearchIcon className="w-4 h-4 mr-2" />
              {loading ? 'Buscando...' : 'Buscar'}
            </Button>
          </div>
        </form>

        {/* Filtro de Transporte */}
        <div className="mb-4">
          <p className="text-sm font-medium mb-3">Tipo de Transporte:</p>
          <div className="flex flex-wrap gap-2">
            <Button
              variant={vehicleFilter === 'all' ? 'default' : 'outline'}
              onClick={() => {
                setVehicleFilter('all');
                setSelectedRouteNumber('');
              }}
              size="sm"
            >
              🚗 Todos
            </Button>
            <Button
              variant={vehicleFilter === 'taxi' ? 'default' : 'outline'}
              onClick={() => {
                setVehicleFilter('taxi');
                setSelectedRouteNumber('');
              }}
              size="sm"
            >
              🚕 Taxis
            </Button>
            <Button
              variant={vehicleFilter === 'ruta' ? 'default' : 'outline'}
              onClick={() => setVehicleFilter('ruta')}
              size="sm"
            >
              🚌 Rutas de Transporte
            </Button>
          </div>
          
          {/* Selector de número de ruta cuando se elige "Rutas de Transporte" */}
          {vehicleFilter === 'ruta' && (
            <div className="mt-3">
              <p className="text-sm font-medium mb-2">Selecciona una ruta:</p>
              <div className="flex flex-wrap gap-2 max-h-32 overflow-y-auto">
                <Button
                  variant={selectedRouteNumber === '' ? 'default' : 'outline'}
                  onClick={() => setSelectedRouteNumber('')}
                  size="sm"
                >
                  Todas las rutas
                </Button>
                {allRouteNumbers.map((routeName) => (
                  <Button
                    key={routeName}
                    variant={selectedRouteNumber === routeName ? 'default' : 'outline'}
                    onClick={() => setSelectedRouteNumber(routeName)}
                    size="sm"
                  >
                    {routeName}
                  </Button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Categorías */}
        <div className="mb-8">
          <p className="text-sm font-medium mb-3">Categorías:</p>
          <div className="flex flex-wrap gap-2">
            <Button
              variant={selectedCategory === 'todas' ? 'default' : 'outline'}
              onClick={() => setSelectedCategory('todas')}
              size="sm"
            >
              Todas
            </Button>
            {categories.map((category) => (
              <Button
                key={category.id}
                variant={selectedCategory === category.id ? 'default' : 'outline'}
                onClick={() => setSelectedCategory(category.id)}
                size="sm"
              >
                {category.name}
              </Button>
            ))}
          </div>
        </div>

        {!hasSearched && (
          <Card>
            <CardContent className="text-center py-12">
              <p className="text-muted-foreground">Ingresa un término de búsqueda para ver resultados</p>
            </CardContent>
          </Card>
        )}

        {hasSearched && results.length === 0 && !loading && (
          <Card>
            <CardContent className="text-center py-12">
              <XCircle className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
              <p className="text-muted-foreground">No se encontraron resultados disponibles para "{searchTerm}"</p>
              <p className="text-sm text-muted-foreground mt-2">
                Los proveedores deben estar disponibles u ocupados para aparecer en los resultados
              </p>
            </CardContent>
          </Card>
        )}

        {results.length > 0 && (
          <div className="space-y-6">
            <div>
              <p className="text-muted-foreground mb-4">
                {results.length} resultado{results.length !== 1 ? 's' : ''} encontrado{results.length !== 1 ? 's' : ''}
              </p>
              
              <Tabs defaultValue="mapa" className="w-full">
                <TabsList className="grid w-full max-w-md grid-cols-2 mb-6">
                  <TabsTrigger 
                    value="mapa" 
                    className="flex items-center gap-2"
                    onClick={() => setShowFullScreenMap(true)}
                  >
                    <Map className="h-4 w-4" />
                    Ver Mapa
                  </TabsTrigger>
                  <TabsTrigger value="lista" className="flex items-center gap-2">
                    <List className="h-4 w-4" />
                    Ver Listado
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="mapa" className="mt-0">
                  {/* El mapa ahora se muestra en pantalla completa */}
                </TabsContent>

                <TabsContent value="lista" className="mt-0">
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {results.map((result, index) => {
                      const productKey = `${result.product_id}-${index}`;
                      const isExpanded = expandedProducts.has(productKey);
                      
                      return (
                        <Card key={productKey} className="overflow-hidden hover:shadow-lg transition-shadow flex flex-col">
                        <div className="aspect-square w-full overflow-hidden">
                          <ProductPhotoCarousel productoId={result.product_id} />
                        </div>
                        <div className="flex-1 flex flex-col p-3">
                            <h3 className="text-lg font-bold mb-0.5">{result.provider_name}</h3>
                            <p className="text-base font-medium text-muted-foreground mb-2">{result.product_name}</p>
                            
                            <div className="mb-2">
                              <button 
                                onClick={() => {
                                  setExpandedProducts(prev => {
                                    const next = new Set(prev);
                                    if (next.has(productKey)) {
                                      next.delete(productKey);
                                    } else {
                                      next.add(productKey);
                                    }
                                    return next;
                                  });
                                }}
                                className="flex items-center gap-1 text-sm text-primary hover:underline"
                              >
                                Ver más {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                              </button>
                              {isExpanded && (
                                <div className="mt-2 space-y-2">
                                  {result.product_description && (
                                    <p className="text-sm text-muted-foreground">{result.product_description}</p>
                                  )}
                                  <div className="flex flex-wrap gap-2">
                                    <Badge variant="default" className="text-base">
                                      ${result.price.toFixed(2)} / {result.unit}
                                    </Badge>
                                    <Badge variant={result.stock > 0 ? 'secondary' : 'destructive'}>
                                      {result.stock > 0 ? (
                                        <>
                                          <CheckCircle2 className="h-3 w-3 mr-1" />
                                          Stock: {result.stock}
                                        </>
                                      ) : (
                                        <>
                                          <XCircle className="h-3 w-3 mr-1" />
                                          Sin stock
                                        </>
                                      )}
                                    </Badge>
                                  </div>
                                </div>
                              )}
                            </div>
                            
                            <Button 
                              className="w-full mt-auto"
                              onClick={() => navigate(`/proveedor/${result.provider_id}`)}
                            >
                              Ver más de este proveedor
                            </Button>
                          </div>
                        </Card>
                      );
                    })}
                  </div>
                </TabsContent>
              </Tabs>
            </div>
          </div>
        )}
          </div>
        </div>
      )}

      {/* Messaging Panel */}
      <MessagingPanel
        isOpen={isMessagingOpen}
        onClose={() => setIsMessagingOpen(false)}
        receiverId={selectedReceiverId}
        receiverName={selectedReceiverName}
      />
      
      {/* Navigation Bar */}
      {!showFullScreenMap && <NavigationBar />}
    </>
  );
};

export default ProductSearch;
