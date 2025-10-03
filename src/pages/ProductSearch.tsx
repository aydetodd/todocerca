import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Search as SearchIcon } from 'lucide-react';

const ProductSearch = () => {
  const [searchParams] = useSearchParams();
  const [searchTerm, setSearchTerm] = useState(searchParams.get('q') || '');
  const [loading, setLoading] = useState(false);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    console.log('Searching for:', searchTerm);
    setTimeout(() => setLoading(false), 1000);
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-4 py-8">
        <h1 className="text-3xl font-bold mb-6">Buscar Productos</h1>
        
        <form onSubmit={handleSearch} className="mb-8">
          <div className="flex gap-4">
            <Input
              type="text"
              placeholder="Buscar productos..."
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

        <Card>
          <CardContent className="text-center py-12">
            <p>Ingresa un término de búsqueda para ver resultados</p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default ProductSearch;
