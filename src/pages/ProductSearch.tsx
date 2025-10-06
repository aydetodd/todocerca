import { useState, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Search as SearchIcon, MapPin, Phone, Package, ArrowLeft, CheckCircle2, XCircle } from 'lucide-react';
import ProvidersMap from '@/components/ProvidersMap';

interface SearchResult {
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
  provider_latitude: number;
  provider_longitude: number;
  provider_status: 'available' | 'busy';
}

interface MapProvider {
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

const ProductSearch = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [searchTerm, setSearchTerm] = useState(searchParams.get('q') || '');
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<SearchResult[]>([]);
  const [mapProviders, setMapProviders] = useState<MapProvider[]>([]);
  const [hasSearched, setHasSearched] = useState(false);

  useEffect(() => {
    const query = searchParams.get('q');
    if (query && query !== searchTerm) {
      setSearchTerm(query);
      handleSearch(null, query);
    }
  }, [searchParams]);

  const handleSearch = async (e: React.FormEvent | null, query?: string) => {
    if (e) e.preventDefault();
    const term = query || searchTerm;
    if (!term.trim()) return;
    
    setLoading(true);
    setHasSearched(true);
    
    try {
      // Search in productos table by name or keywords with provider location
      const { data: productos, error } = await supabase
        .from('productos')
        .select(`
          id,
          nombre,
          descripcion,
          precio,
          stock,
          unit,
          proveedor_id,
          proveedores (
            id,
            nombre,
            telefono,
            codigo_postal,
            user_id
          )
        `)
        .or(`nombre.ilike.%${term}%,keywords.ilike.%${term}%`)
        .eq('is_available', true);

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
        const providerLocationMap = new Map();
        const providerStatusMap = new Map();
        
        if (proveedoresData) {
          proveedoresData.forEach((p: any) => {
            providerLocationMap.set(p.id, p);
            const profile = profilesData?.find(prof => prof.user_id === p.user_id);
            providerStatusMap.set(p.id, profile?.estado || 'offline');
          });
        }

        const formattedResults: SearchResult[] = availableProductos.map((producto: any) => {
          const proveedorData = providerLocationMap.get(producto.proveedor_id);
          const providerStatus = providerStatusMap.get(producto.proveedor_id) || 'offline';
          return {
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
            provider_latitude: proveedorData?.latitude || 0,
            provider_longitude: proveedorData?.longitude || 0,
            provider_status: providerStatus,
          };
        });
        
        setResults(formattedResults);

        // Group products by provider for the map
        const providerMap = new Map<string, MapProvider>();
        
        formattedResults.forEach((result) => {
          if (result.provider_latitude && result.provider_longitude) {
            if (!providerMap.has(result.provider_id)) {
              providerMap.set(result.provider_id, {
                id: result.provider_id,
                business_name: result.provider_name,
                business_address: result.provider_address,
                business_phone: result.provider_phone || null,
                latitude: result.provider_latitude,
                longitude: result.provider_longitude,
                productos: []
              });
            }
            
            const provider = providerMap.get(result.provider_id)!;
            provider.productos.push({
              nombre: result.product_name,
              precio: result.price
            });
          }
        });

        const providersArray = Array.from(providerMap.values());
        console.log('📍 Proveedores para el mapa:', providersArray);
        setMapProviders(providersArray);
      } else {
        setResults([]);
        setMapProviders([]);
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
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-4 py-8">
        <div className="flex items-center gap-4 mb-6">
          <Button variant="ghost" onClick={() => navigate('/dashboard')}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Volver
          </Button>
          <h1 className="text-3xl font-bold">Buscar Productos y Servicios</h1>
        </div>
        
        <form onSubmit={handleSearch} className="mb-8">
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
              
              {mapProviders.length > 0 && (
                <div className="mb-6">
                  <h2 className="text-xl font-semibold mb-4">Ubicación de Proveedores</h2>
                  <ProvidersMap providers={mapProviders} />
                </div>
              )}
            </div>

            <div className="space-y-4">
              <h2 className="text-xl font-semibold">Detalles de Productos</h2>
              {results.map((result, index) => (
              <Card key={index}>
                <CardHeader>
                  <CardTitle className="flex items-start justify-between gap-4">
                    <span>{result.product_name}</span>
                    <span className="text-primary font-bold whitespace-nowrap">
                      ${result.price.toFixed(2)}{result.unit && `/${result.unit}`}
                    </span>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {result.product_description && (
                      <p className="text-muted-foreground">{result.product_description}</p>
                    )}
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Package className="w-4 h-4" />
                      <span>Stock disponible: {result.stock}</span>
                    </div>
                    <div className="border-t pt-3 mt-3">
                      <div className="flex items-center justify-between mb-2">
                        <h4 className="font-semibold text-sm">Proveedor</h4>
                        <Badge variant={result.provider_status === 'available' ? 'default' : 'secondary'}>
                          {result.provider_status === 'available' ? (
                            <>
                              <CheckCircle2 className="h-3 w-3 mr-1" />
                              Disponible
                            </>
                          ) : (
                            <>
                              Ocupado
                            </>
                          )}
                        </Badge>
                      </div>
                      <div className="space-y-1">
                        <p className="font-medium">{result.provider_name}</p>
                        {result.provider_phone && (
                          <div className="flex items-center gap-2 text-sm text-muted-foreground">
                            <Phone className="w-4 h-4" />
                            <span>{result.provider_phone}</span>
                          </div>
                        )}
                        {result.provider_postal_code && (
                          <div className="flex items-center gap-2 text-sm text-muted-foreground">
                            <MapPin className="w-4 h-4" />
                            <span>CP: {result.provider_postal_code}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default ProductSearch;
