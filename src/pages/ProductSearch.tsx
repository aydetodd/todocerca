import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Search as SearchIcon, MapPin, Phone, Package } from 'lucide-react';

interface SearchResult {
  product_name: string;
  product_description: string;
  price: number;
  stock: number;
  unit: string;
  provider_name: string;
  provider_phone: string;
  provider_postal_code: string;
}

const ProductSearch = () => {
  const [searchParams] = useSearchParams();
  const [searchTerm, setSearchTerm] = useState(searchParams.get('q') || '');
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<SearchResult[]>([]);
  const [hasSearched, setHasSearched] = useState(false);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchTerm.trim()) return;
    
    setLoading(true);
    setHasSearched(true);
    
    try {
      // Search in productos table by name or keywords
      const { data: productos, error } = await supabase
        .from('productos')
        .select(`
          nombre,
          descripcion,
          precio,
          stock,
          unit,
          proveedores (
            nombre,
            telefono,
            codigo_postal
          )
        `)
        .or(`nombre.ilike.%${searchTerm}%,keywords.ilike.%${searchTerm}%`)
        .eq('is_available', true);

      if (error) {
        console.error('Error searching:', error);
        setResults([]);
        return;
      }

      if (productos && productos.length > 0) {
        const formattedResults: SearchResult[] = productos.map((producto: any) => ({
          product_name: producto.nombre || '',
          product_description: producto.descripcion || '',
          price: producto.precio || 0,
          stock: producto.stock || 0,
          unit: producto.unit || '',
          provider_name: producto.proveedores?.nombre || '',
          provider_phone: producto.proveedores?.telefono || '',
          provider_postal_code: producto.proveedores?.codigo_postal || ''
        }));
        
        setResults(formattedResults);
      } else {
        setResults([]);
      }
    } catch (error) {
      console.error('Error searching:', error);
      setResults([]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-4 py-8">
        <h1 className="text-3xl font-bold mb-6">Buscar Productos y Servicios</h1>
        
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
              <p className="text-muted-foreground">No se encontraron resultados para "{searchTerm}"</p>
            </CardContent>
          </Card>
        )}

        {results.length > 0 && (
          <div className="space-y-4">
            <p className="text-muted-foreground mb-4">
              {results.length} resultado{results.length !== 1 ? 's' : ''} encontrado{results.length !== 1 ? 's' : ''}
            </p>
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
                      <h4 className="font-semibold text-sm mb-2">Proveedor</h4>
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
        )}
      </div>
    </div>
  );
};

export default ProductSearch;
