import { useNavigate } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { Bus, Ticket, Building2, Radio } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { useState, useEffect } from 'react';
import DriverProfilePanel from '@/components/DriverProfilePanel';

export default function MainHome() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [isEmpresaTransporte, setIsEmpresaTransporte] = useState(false);

  useEffect(() => {
    if (!user) {
      return;
    }
    const checkEmpresaTransporte = async () => {
      const { count } = await supabase
        .from('empresas_transporte')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .eq('is_active', true);
      setIsEmpresaTransporte((count ?? 0) > 0);
    };
    checkEmpresaTransporte();
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
        {/* Panel de chofer (auto-oculto si el usuario no es chofer activo) */}
        <DriverProfilePanel />

        {/* === Protocolo 1: Solo movilidad === */}
        {/* Protocolo 2: Taxi oculto */}
        {/* <Card 
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
        </Card> */}

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

        <Card
          className="cursor-pointer hover:border-primary transition-all hover:shadow-lg border-amber-500/40"
          onClick={() => navigate('/tv')}
        >
          <CardContent className="p-5 flex items-center gap-4">
            <div className="w-14 h-14 rounded-full bg-gradient-to-br from-amber-500/20 to-primary/20 flex items-center justify-center flex-shrink-0">
              <Radio className="h-7 w-7 text-amber-600" />
            </div>
            <div className="flex-1">
              <h3 className="font-semibold text-lg flex items-center gap-2">
                TodoCerca TV
                <span className="text-[10px] font-bold bg-destructive text-destructive-foreground px-1.5 py-0.5 rounded animate-pulse">EN VIVO</span>
              </h3>
              <p className="text-sm text-muted-foreground">Guía de programación comunitaria</p>
            </div>
          </CardContent>
        </Card>

        {isEmpresaTransporte && (
          <Card 
            className="cursor-pointer hover:border-primary transition-all hover:shadow-lg border-orange-500/30"
            onClick={() => navigate('/panel-maquiladora')}
          >
            <CardContent className="p-5 flex items-center gap-4">
              <div className="w-14 h-14 rounded-full bg-orange-500/10 flex items-center justify-center flex-shrink-0">
                <Building2 className="h-7 w-7 text-orange-500" />
              </div>
              <div className="flex-1">
                <h3 className="font-semibold text-lg">Panel Empresa</h3>
                <p className="text-sm text-muted-foreground">Transporte de personal y reportes</p>
              </div>
            </CardContent>
          </Card>
        )}

      </main>

      {/* SOS oculto - Protocolo 1 */}

    </div>
  );
}
