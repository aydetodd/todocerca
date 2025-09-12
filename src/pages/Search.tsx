import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Search as SearchIcon, MapPin, Phone, Mail } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface Product {
  id: string;
  nombre: string;
  descripcion: string;
  precio: number;
  unit: string;
  keywords: string;
  category_name: string;
  proveedor_nombre: string;
  proveedor_email: string;
  proveedor_telefono: string;
  proveedor_codigo_postal: string;
  photo_url?: string;
}

interface Category {
  id: string;
  name: string;
}

export default function Search() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [searchTerm, setSearchTerm] = useState(searchParams.get('q') || '');
  const [selectedCategory, setSelectedCategory] = useState(searchParams.get('category') || 'all');
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    fetchCategories();
    if (searchParams.get('q')) {
      performSearch();
    }
  }, []);

  const fetchCategories = async () => {
    try {
      const { data, error } = await supabase
        .from('product_categories')
        .select('id, name')
        .order('name');

      if (error) throw error;
      setCategories(data || []);
    } catch (error) {
      console.error('Error fetching categories:', error);
    }
  };

  const performSearch = async () => {
    setLoading(true);
    try {
      let query = supabase
        .from('productos')
        .select(`
          id,
          nombre,
          descripcion,
          precio,
          unit,
          keywords,
          product_categories!inner(name),
          proveedores!inner(
            nombre,
            email,
            telefono,
            codigo_postal
          ),
          fotos_productos(url, es_principal)
        `)
        .eq('is_available', true);

      // Add search term filter
      if (searchTerm.trim()) {
        query = query.or(`nombre.ilike.%${searchTerm}%,descripcion.ilike.%${searchTerm}%,keywords.ilike.%${searchTerm}%`);
      }

      // Add category filter
      if (selectedCategory && selectedCategory !== 'all') {
        query = query.eq('category_id', selectedCategory);
      }

      const { data, error } = await query.order('nombre');

      if (error) throw error;

      const formattedProducts: Product[] = (data || []).map((item: any) => ({
        id: item.id,
        nombre: item.nombre,
        descripcion: item.descripcion,
        precio: item.precio,
        unit: item.unit,
        keywords: item.keywords,
        category_name: item.product_categories?.name || 'Sin categoría',
        proveedor_nombre: item.proveedores?.nombre || '',
        proveedor_email: item.proveedores?.email || '',
        proveedor_telefono: item.proveedores?.telefono || '',
        proveedor_codigo_postal: item.proveedores?.codigo_postal || '',
        photo_url: item.fotos_productos?.find((f: any) => f.es_principal)?.url || 
                  item.fotos_productos?.[0]?.url,
      }));

      setProducts(formattedProducts);

      // Update URL params
      const params = new URLSearchParams();
      if (searchTerm.trim()) params.set('q', searchTerm.trim());
      if (selectedCategory && selectedCategory !== 'all') params.set('category', selectedCategory);
      setSearchParams(params);

    } catch (error) {
      console.error('Search error:', error);
      toast({
        title: "Error en la búsqueda",
        description: "No se pudo realizar la búsqueda. Intenta de nuevo.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    performSearch();
  };

  const clearFilters = () => {
    setSearchTerm('');
    setSelectedCategory('all');
    setProducts([]);
    setSearchParams({});
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-4 py-8">
        <div className="max-w-4xl mx-auto">
          {/* Search Header */}
          <div className="mb-8">
            <h1 className="text-3xl font-bold mb-6">Buscar Productos</h1>
            
            <form onSubmit={handleSearch} className="space-y-4">
              <div className="flex gap-4">
                <div className="flex-1">
                  <Input
                    type="text"
                    placeholder="Buscar productos... (ej: tomate, frutas, lácteos)"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="h-12"
                  />
                </div>
                <Select value={selectedCategory} onValueChange={setSelectedCategory}>
                  <SelectTrigger className="w-48 h-12">
                    <SelectValue placeholder="Categoría" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todas las categorías</SelectItem>
                    {categories.map((category) => (
                      <SelectItem key={category.id} value={category.id}>
                        {category.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              
              <div className="flex gap-2">
                <Button type="submit" disabled={loading} className="h-12">
                  <SearchIcon className="w-4 h-4 mr-2" />
                  {loading ? 'Buscando...' : 'Buscar'}
                </Button>
                <Button type="button" variant="outline" onClick={clearFilters} className="h-12">
                  Limpiar
                </Button>
              </div>
            </form>
          </div>

          {/* Results */}
          <div className="space-y-6">
            {products.length > 0 && (
              <div className="flex justify-between items-center">
                <h2 className="text-xl font-semibold">
                  {products.length} resultado{products.length !== 1 ? 's' : ''} encontrado{products.length !== 1 ? 's' : ''}
                </h2>
              </div>
            )}

            {products.length === 0 && searchTerm && !loading && (
              <Card>
                <CardContent className="text-center py-12">
                  <SearchIcon className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
                  <h3 className="text-lg font-medium mb-2">No se encontraron productos</h3>
                  <p className="text-muted-foreground">
                    Intenta con otros términos de búsqueda o explora diferentes categorías.
                  </p>
                </CardContent>
              </Card>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {products.map((product) => (
                <Card key={product.id} className="overflow-hidden hover:shadow-lg transition-shadow">
                  {product.photo_url && (
                    <div className="aspect-video overflow-hidden">
                      <img
                        src={product.photo_url}
                        alt={product.nombre}
                        className="w-full h-full object-cover"
                      />
                    </div>
                  )}
                  
                  <CardHeader className="pb-3">
                    <div className="flex justify-between items-start">
                      <CardTitle className="text-lg line-clamp-2">{product.nombre}</CardTitle>
                      <Badge variant="secondary">{product.category_name}</Badge>
                    </div>
                    <p className="text-2xl font-bold text-primary">
                      ${product.precio.toFixed(2)} <span className="text-sm text-muted-foreground">/ {product.unit}</span>
                    </p>
                  </CardHeader>

                  <CardContent className="space-y-4">
                    <p className="text-sm text-muted-foreground line-clamp-2">
                      {product.descripcion}
                    </p>

                    {product.keywords && (
                      <div className="flex flex-wrap gap-1">
                        {product.keywords.split(',').slice(0, 3).map((keyword, index) => (
                          <Badge key={index} variant="outline" className="text-xs">
                            {keyword.trim()}
                          </Badge>
                        ))}
                      </div>
                    )}

                    <div className="border-t pt-4 space-y-2">
                      <h4 className="font-medium text-sm">Proveedor:</h4>
                      <p className="font-medium">{product.proveedor_nombre}</p>
                      
                      <div className="space-y-1 text-sm text-muted-foreground">
                        {product.proveedor_telefono && (
                          <div className="flex items-center gap-2">
                            <Phone className="w-3 h-3" />
                            <span>{product.proveedor_telefono}</span>
                          </div>
                        )}
                        {product.proveedor_email && (
                          <div className="flex items-center gap-2">
                            <Mail className="w-3 h-3" />
                            <span>{product.proveedor_email}</span>
                          </div>
                        )}
                        {product.proveedor_codigo_postal && (
                          <div className="flex items-center gap-2">
                            <MapPin className="w-3 h-3" />
                            <span>CP: {product.proveedor_codigo_postal}</span>
                          </div>
                        )}
                      </div>

                      <Button className="w-full mt-4">
                        Contactar Proveedor
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}