import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Search, Gift, HelpCircle, Bus, Car } from 'lucide-react';
import { NavigationBar } from '@/components/NavigationBar';

export default function MainHome() {
  const [searchQuery, setSearchQuery] = useState('');
  const navigate = useNavigate();

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      navigate(`/search?q=${encodeURIComponent(searchQuery.trim())}`);
    } else {
      navigate('/search');
    }
  };

  return (
    <div className="min-h-screen bg-background pb-20">
      {/* Header simple */}
      <header className="bg-primary/5 border-b border-border">
        <div className="container mx-auto px-4 py-4">
          <h1 className="text-2xl font-bold text-foreground text-center">TodoCerca</h1>
        </div>
      </header>

      <main className="container mx-auto px-4 py-6 space-y-6">
        {/* Barra de búsqueda */}
        <form onSubmit={handleSearch} className="relative">
          <Input
            type="text"
            placeholder="¿Qué estás buscando?"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full h-14 pl-5 pr-14 text-lg rounded-full border-2 border-primary/20 focus:border-primary"
          />
          <Button
            type="submit"
            size="icon"
            className="absolute right-2 top-1/2 -translate-y-1/2 h-10 w-10 rounded-full"
          >
            <Search className="h-5 w-5" />
          </Button>
        </form>

        {/* Categorías rápidas: Rutas y Taxis */}
        <div className="grid grid-cols-2 gap-4">
          <Card 
            className="cursor-pointer hover:border-primary transition-all hover:shadow-lg group"
            onClick={() => navigate('/search?category=rutas')}
          >
            <CardContent className="p-6 flex flex-col items-center justify-center text-center">
              <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mb-3 group-hover:bg-primary/20 transition-colors">
                <Bus className="h-8 w-8 text-primary" />
              </div>
              <h3 className="font-semibold text-lg">Rutas</h3>
              <p className="text-sm text-muted-foreground">Transporte público</p>
            </CardContent>
          </Card>

          <Card 
            className="cursor-pointer hover:border-primary transition-all hover:shadow-lg group"
            onClick={() => navigate('/search?category=taxis')}
          >
            <CardContent className="p-6 flex flex-col items-center justify-center text-center">
              <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mb-3 group-hover:bg-primary/20 transition-colors">
                <Car className="h-8 w-8 text-primary" />
              </div>
              <h3 className="font-semibold text-lg">Taxis</h3>
              <p className="text-sm text-muted-foreground">Servicio de taxi</p>
            </CardContent>
          </Card>
        </div>

        {/* Secciones principales */}
        <div className="space-y-4">
          <Card 
            className="cursor-pointer hover:border-primary transition-all hover:shadow-lg"
            onClick={() => navigate('/donar')}
          >
            <CardContent className="p-5 flex items-center gap-4">
              <div className="w-14 h-14 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center flex-shrink-0">
                <Gift className="h-7 w-7 text-green-600 dark:text-green-400" />
              </div>
              <div className="flex-1">
                <h3 className="font-semibold text-lg">Cosas Regaladas</h3>
                <p className="text-sm text-muted-foreground">Encuentra o regala cosas gratis</p>
              </div>
            </CardContent>
          </Card>

          <Card 
            className="cursor-pointer hover:border-primary transition-all hover:shadow-lg"
            onClick={() => navigate('/extraviados')}
          >
            <CardContent className="p-5 flex items-center gap-4">
              <div className="w-14 h-14 rounded-full bg-orange-100 dark:bg-orange-900/30 flex items-center justify-center flex-shrink-0">
                <HelpCircle className="h-7 w-7 text-orange-600 dark:text-orange-400" />
              </div>
              <div className="flex-1">
                <h3 className="font-semibold text-lg">Cosas Extraviadas</h3>
                <p className="text-sm text-muted-foreground">Reporta o encuentra objetos perdidos</p>
              </div>
            </CardContent>
          </Card>
        </div>
      </main>

      <NavigationBar />
    </div>
  );
}
