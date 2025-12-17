// ProductSearch - Functional version without problematic hook
import { useState, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Search as SearchIcon, MapPin } from 'lucide-react';
import { GlobalHeader } from '@/components/GlobalHeader';
import { NavigationBar } from '@/components/NavigationBar';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

// Estados de México con algunos municipios principales
const ESTADOS_MEXICO = [
  'Aguascalientes', 'Baja California', 'Baja California Sur', 'Campeche', 'Chiapas',
  'Chihuahua', 'Ciudad de México', 'Coahuila', 'Colima', 'Durango', 'Guanajuato',
  'Guerrero', 'Hidalgo', 'Jalisco', 'México', 'Michoacán', 'Morelos', 'Nayarit',
  'Nuevo León', 'Oaxaca', 'Puebla', 'Querétaro', 'Quintana Roo', 'San Luis Potosí',
  'Sinaloa', 'Sonora', 'Tabasco', 'Tamaulipas', 'Tlaxcala', 'Veracruz', 'Yucatán', 'Zacatecas'
];

const MUNICIPIOS: Record<string, string[]> = {
  'Sonora': ['Ciudad Obregón', 'Hermosillo', 'Nogales', 'Guaymas', 'Navojoa', 'San Luis Río Colorado'],
  'Sinaloa': ['Culiacán', 'Mazatlán', 'Los Mochis', 'Guasave', 'Ahome'],
  'Chihuahua': ['Chihuahua', 'Ciudad Juárez', 'Delicias', 'Cuauhtémoc', 'Parral'],
  'Baja California': ['Tijuana', 'Mexicali', 'Ensenada', 'Tecate', 'Rosarito'],
  'Jalisco': ['Guadalajara', 'Puerto Vallarta', 'Zapopan', 'Tlaquepaque', 'Tonalá'],
  'Nuevo León': ['Monterrey', 'San Pedro Garza García', 'Guadalupe', 'San Nicolás', 'Apodaca'],
  'Ciudad de México': ['Benito Juárez', 'Coyoacán', 'Miguel Hidalgo', 'Cuauhtémoc', 'Álvaro Obregón'],
};

const ProductSearch = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [searchTerm, setSearchTerm] = useState(searchParams.get('q') || '');
  const [loading, setLoading] = useState(false);
  const [searchEstado, setSearchEstado] = useState<string>('Sonora');
  const ALL_MUNICIPIOS_VALUE = '__ALL__';
  const [searchCiudad, setSearchCiudad] = useState<string>('Ciudad Obregón');
  const [results, setResults] = useState<any[]>([]);
  const [hasSearched, setHasSearched] = useState(false);

  const ciudadesDisponibles = MUNICIPIOS[searchEstado] || [];

  const handleSearch = async (e: React.FormEvent | null) => {
    if (e) e.preventDefault();
    setLoading(true);
    setHasSearched(true);
    
    try {
      let query = supabase
        .from('productos')
        .select(`
          id, nombre, descripcion, precio, stock, unit, proveedor_id,
          proveedores (id, nombre, telefono, business_address)
        `)
        .eq('is_available', true)
        .gte('stock', 1);
      
      if (searchEstado) query = query.eq('estado', searchEstado);
      if (searchCiudad && searchCiudad !== ALL_MUNICIPIOS_VALUE) {
        query = query.eq('ciudad', searchCiudad);
      }
      if (searchTerm.trim()) {
        query = query.or(`nombre.ilike.%${searchTerm}%,keywords.ilike.%${searchTerm}%`);
      }
      
      const { data, error } = await query.limit(50);
      
      if (error) {
        console.error('Error searching:', error);
        setResults([]);
      } else {
        setResults(data || []);
      }
    } catch (err) {
      console.error('Error:', err);
      setResults([]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <GlobalHeader />
      
      <div className="container mx-auto px-4 py-8 pb-24">
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
        
        <div className="mb-4 p-4 bg-muted/50 rounded-lg border border-border">
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="flex-1">
              <span className="text-sm text-muted-foreground mb-1 block">Estado:</span>
              <Select value={searchEstado} onValueChange={(v) => { setSearchEstado(v); setSearchCiudad(ALL_MUNICIPIOS_VALUE); }}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Selecciona estado" />
                </SelectTrigger>
                <SelectContent className="max-h-60">
                  {ESTADOS_MEXICO.map(estado => (
                    <SelectItem key={estado} value={estado}>{estado}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            
            <div className="flex-1">
              <span className="text-sm text-muted-foreground mb-1 block">Municipio:</span>
              <Select value={searchCiudad} onValueChange={setSearchCiudad}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Selecciona municipio" />
                </SelectTrigger>
                <SelectContent className="max-h-60">
                  <SelectItem value={ALL_MUNICIPIOS_VALUE}>Todos</SelectItem>
                  {ciudadesDisponibles.map(ciudad => (
                    <SelectItem key={ciudad} value={ciudad}>{ciudad}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>
        
        {hasSearched && (
          <div className="space-y-4">
            {results.length === 0 ? (
              <Card>
                <CardContent className="p-6 text-center">
                  <p className="text-muted-foreground">No se encontraron resultados.</p>
                </CardContent>
              </Card>
            ) : (
              results.map((producto) => (
                <Card key={producto.id}>
                  <CardContent className="p-4">
                    <h3 className="font-semibold text-lg">{producto.nombre}</h3>
                    <p className="text-muted-foreground text-sm">{producto.descripcion}</p>
                    <div className="flex items-center gap-2 mt-2">
                      <Badge variant="secondary">${producto.precio}</Badge>
                      <Badge variant="outline">Stock: {producto.stock}</Badge>
                    </div>
                    {producto.proveedores && (
                      <p className="text-sm text-muted-foreground mt-2">
                        <MapPin className="w-3 h-3 inline mr-1" />
                        {producto.proveedores.nombre}
                      </p>
                    )}
                  </CardContent>
                </Card>
              ))
            )}
          </div>
        )}
      </div>
      
      <NavigationBar />
    </div>
  );
};

export default ProductSearch;
