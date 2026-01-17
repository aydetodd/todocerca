import { useNavigate } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { Search, Gift, Bus, Car, HelpCircle, Vote } from 'lucide-react';
import { NavigationBar } from '@/components/NavigationBar';
import PassengerActiveTrip from '@/components/PassengerActiveTrip';
import { SOSButton } from '@/components/SOSButton';

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

      <main className="container mx-auto px-4 py-6 space-y-4">
        {/* Viaje activo del pasajero */}
        <PassengerActiveTrip />
        
        {/* Todos los botones del mismo tamaño */}
        <Card
          className="cursor-pointer hover:border-primary transition-all hover:shadow-lg"
          onClick={() => navigate('/search')}
        >
          <CardContent className="p-5 flex items-center gap-4">
            <div className="w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
              <Search className="h-7 w-7 text-primary" />
            </div>
            <div className="flex-1">
              <h3 className="font-semibold text-lg">Búsqueda</h3>
              <p className="text-sm text-muted-foreground">Encuentra productos y servicios</p>
            </div>
          </CardContent>
        </Card>

        <Card 
          className="cursor-pointer hover:border-primary transition-all hover:shadow-lg"
          onClick={() => navigate('/mapa?type=taxi')}
        >
          <CardContent className="p-5 flex items-center gap-4">
            <div className="w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
              <Car className="h-7 w-7 text-primary" />
            </div>
            <div className="flex-1">
              <h3 className="font-semibold text-lg">Taxis</h3>
              <p className="text-sm text-muted-foreground">Ver taxis disponibles en el mapa</p>
            </div>
          </CardContent>
        </Card>

        <Card 
          className="cursor-pointer hover:border-primary transition-all hover:shadow-lg"
          onClick={() => navigate('/search?category=rutas')}
        >
          <CardContent className="p-5 flex items-center gap-4">
            <div className="w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
              <Bus className="h-7 w-7 text-primary" />
            </div>
            <div className="flex-1">
              <h3 className="font-semibold text-lg">Rutas de Transporte</h3>
              <p className="text-sm text-muted-foreground">Buscar rutas de transporte público</p>
            </div>
          </CardContent>
        </Card>

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

        <Card 
          className="cursor-pointer hover:border-primary transition-all hover:shadow-lg"
          onClick={() => navigate('/votaciones')}
        >
          <CardContent className="p-5 flex items-center gap-4">
            <div className="w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
              <Vote className="h-7 w-7 text-primary" />
            </div>
            <div className="flex-1">
              <h3 className="font-semibold text-lg">Votaciones</h3>
              <p className="text-sm text-muted-foreground">Crea o participa en votaciones comunitarias</p>
            </div>
          </CardContent>
        </Card>

      </main>

      {/* Botón SOS flotante */}
      <SOSButton />

      <NavigationBar />
    </div>
  );
}
