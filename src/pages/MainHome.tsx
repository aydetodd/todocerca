import { useNavigate } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { Search, Gift, Bus, Car, HelpCircle, Vote, Ticket, BarChart3 } from 'lucide-react';
import { NavigationBar } from '@/components/NavigationBar';
import PassengerActiveTrip from '@/components/PassengerActiveTrip';
import { SOSButton } from '@/components/SOSButton';
import DriverProfilePanel from '@/components/DriverProfilePanel';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { useState, useEffect } from 'react';

export default function MainHome() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [isConcesionario, setIsConcesionario] = useState(false);

  useEffect(() => {
    if (!user) return;
    // Check if user is a provider with transport units
    const checkConcesionario = async () => {
      const { data: prov } = await supabase
        .from('proveedores')
        .select('id')
        .eq('user_id', user.id)
        .single();
      if (prov) {
        const { count } = await supabase
          .from('unidades_empresa')
          .select('*', { count: 'exact', head: true })
          .eq('proveedor_id', prov.id);
        setIsConcesionario((count ?? 0) > 0);
      }
    };
    checkConcesionario();
  }, [user]);

  return (
    <div className="min-h-screen bg-background pb-20">
      {/* Header simple */}
      <header className="bg-primary/5 border-b border-border">
        <div className="container mx-auto px-4 py-4">
          <h1 className="text-2xl font-bold text-foreground text-center">TodoCerca</h1>
        </div>
      </header>

      <main className="container mx-auto px-4 py-6 space-y-4">
        {/* Panel de perfil de chofer (visible siempre para choferes autorizados) */}
        <DriverProfilePanel />
        
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
          onClick={() => navigate('/search?category=taxi')}
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
          onClick={() => navigate('/wallet/qr-boletos')}
        >
          <CardContent className="p-5 flex items-center gap-4">
            <div className="w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
              <Ticket className="h-7 w-7 text-primary" />
            </div>
            <div className="flex-1">
              <h3 className="font-semibold text-lg">QR Boleto Digital</h3>
              <p className="text-sm text-muted-foreground">Compra y usa boletos de transporte</p>
            </div>
          </CardContent>
        </Card>

        {isConcesionario && (
          <Card 
            className="cursor-pointer hover:border-primary transition-all hover:shadow-lg border-green-500/30"
            onClick={() => navigate('/panel-concesionario')}
          >
            <CardContent className="p-5 flex items-center gap-4">
              <div className="w-14 h-14 rounded-full bg-green-500/10 flex items-center justify-center flex-shrink-0">
                <BarChart3 className="h-7 w-7 text-green-500" />
              </div>
              <div className="flex-1">
                <h3 className="font-semibold text-lg">Panel Concesionario</h3>
                <p className="text-sm text-muted-foreground">Ingresos, liquidaciones y gestión</p>
              </div>
            </CardContent>
          </Card>
        )}

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
