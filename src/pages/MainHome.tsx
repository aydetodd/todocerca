import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Search, Gift, HelpCircle, Bus, Car } from 'lucide-react';
import { NavigationBar } from '@/components/NavigationBar';

export default function MainHome() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-background pb-20">
      {/* Header simple */}
      <header className="bg-primary/5 border-b border-border">
        <div className="container mx-auto px-4 py-4">
          <h1 className="text-2xl font-bold text-foreground text-center">TodoCerca</h1>
        </div>
      </header>

      <main className="container mx-auto px-4 py-6 space-y-6">
        {/* Botón de búsqueda */}
        <Button
          onClick={() => navigate('/search')}
          className="w-full h-14 text-lg rounded-full"
          size="lg"
        >
          <Search className="h-5 w-5 mr-2" />
          Búsqueda
        </Button>

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
            onClick={() => navigate('/mapa?type=taxi')}
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
              <div className="w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                <Gift className="h-7 w-7 text-primary" />
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
              <div className="w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                <HelpCircle className="h-7 w-7 text-primary" />
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
