import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { GlobalHeader } from '@/components/GlobalHeader';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
import { Bus, CarFront, Truck, ArrowLeft, Loader2 } from 'lucide-react';
import PrivateRouteManagement from '@/components/PrivateRouteManagement';

type TransportType = 'publico' | 'foraneo' | 'privado';

const TRANSPORT_CONFIG: Record<TransportType, {
  label: string;
  description: string;
  icon: typeof Bus;
  color: string;
  bgColor: string;
  price: string;
}> = {
  publico: {
    label: 'Transporte Público',
    description: 'Rutas urbanas de transporte público (UNE, etc.)',
    icon: Bus,
    color: 'text-blue-600',
    bgColor: 'bg-blue-100',
    price: '$300 MXN/unidad/año',
  },
  foraneo: {
    label: 'Transporte Foráneo',
    description: 'Rutas interurbanas y foráneas entre ciudades',
    icon: Truck,
    color: 'text-emerald-600',
    bgColor: 'bg-emerald-100',
    price: '$350 MXN/unidad/año',
  },
  privado: {
    label: 'Transporte Privado',
    description: 'Rutas privadas de personal, escolar u otros',
    icon: CarFront,
    color: 'text-amber-600',
    bgColor: 'bg-amber-100',
    price: '$400 MXN/unidad/año',
  },
};

export default function MisRutas() {
  const [profile, setProfile] = useState<any>(null);
  const [proveedorData, setProveedorData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [searchParams, setSearchParams] = useSearchParams();
  const activeType = searchParams.get('tipo') as TransportType | null;

  const navigate = useNavigate();
  const { toast } = useToast();
  const { user, loading: authLoading } = useAuth();

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      navigate('/auth', { replace: true });
      return;
    }
    getProfile();
  }, [user, authLoading, navigate]);

  async function getProfile() {
    try {
      if (!user) return;

      const { data: profileData, error: profileError } = await supabase
        .from('profiles')
        .select('*')
        .eq('user_id', user.id)
        .maybeSingle();

      if (profileError) throw profileError;

      if (!profileData || profileData.role !== 'proveedor') {
        toast({
          title: 'Acceso denegado',
          description: 'Solo los proveedores pueden acceder a esta sección',
          variant: 'destructive',
        });
        navigate('/dashboard');
        return;
      }

      setProfile(profileData);

      const { data: provData, error: provError } = await supabase
        .from('proveedores')
        .select('*')
        .eq('user_id', user.id)
        .maybeSingle();

      if (provError) {
        console.error('Error obteniendo datos de proveedor:', provError);
      } else {
        setProveedorData(provData);
      }
    } catch (error: any) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="h-10 w-10 animate-spin text-primary" />
      </div>
    );
  }

  if (!proveedorData) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <p className="text-muted-foreground">No se encontraron datos de proveedor</p>
          <Button className="mt-4" onClick={() => navigate('/dashboard')}>
            Volver al Dashboard
          </Button>
        </div>
      </div>
    );
  }

  // If a transport type is selected, show management view
  if (activeType && TRANSPORT_CONFIG[activeType]) {
    const config = TRANSPORT_CONFIG[activeType];
    const Icon = config.icon;

    return (
      <div className="min-h-screen bg-background">
        <GlobalHeader />
        <main className="container mx-auto px-4 py-6 pb-40">
          {/* Header with back button */}
          <div className="mb-6">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setSearchParams({})}
              className="mb-3"
            >
              <ArrowLeft className="h-4 w-4 mr-1" />
              Volver
            </Button>
            <div className="flex items-center gap-3">
              <div className={`w-12 h-12 rounded-xl ${config.bgColor} flex items-center justify-center`}>
                <Icon className={`h-6 w-6 ${config.color}`} />
              </div>
              <div>
                <h2 className="text-2xl font-bold text-foreground">{config.label}</h2>
                <p className="text-sm text-muted-foreground">{config.description}</p>
              </div>
            </div>
          </div>

          {/* Reuse PrivateRouteManagement with transport type context */}
          <PrivateRouteManagement
            proveedorId={proveedorData.id}
            businessName={proveedorData.nombre || profile?.apodo || profile?.nombre || 'Mi Empresa'}
          />
        </main>
      </div>
    );
  }

  // Main view: 3 transport type cards
  return (
    <div className="min-h-screen bg-background">
      <GlobalHeader />
      <main className="container mx-auto px-4 py-6 pb-40">
        <div className="mb-6">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate('/dashboard')}
            className="mb-3"
          >
            <ArrowLeft className="h-4 w-4 mr-1" />
            Dashboard
          </Button>
          <h2 className="text-3xl font-bold text-foreground mb-1">Mis Rutas de Transporte</h2>
          <p className="text-muted-foreground">
            Gestiona tus unidades, choferes y rutas por tipo de transporte
          </p>
        </div>

        <div className="grid gap-4">
          {(Object.entries(TRANSPORT_CONFIG) as [TransportType, typeof TRANSPORT_CONFIG[TransportType]][]).map(([type, config]) => {
            const Icon = config.icon;
            return (
              <Card
                key={type}
                className="cursor-pointer hover:border-primary/50 transition-colors"
                onClick={() => setSearchParams({ tipo: type })}
              >
                <CardContent className="p-5">
                  <div className="flex items-center gap-4">
                    <div className={`w-14 h-14 rounded-xl ${config.bgColor} flex items-center justify-center shrink-0`}>
                      <Icon className={`h-7 w-7 ${config.color}`} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="font-bold text-lg text-foreground">{config.label}</h3>
                      <p className="text-sm text-muted-foreground">{config.description}</p>
                      <Badge variant="outline" className="mt-1 text-xs">
                        {config.price}
                      </Badge>
                    </div>
                    <ArrowLeft className="h-5 w-5 text-muted-foreground rotate-180 shrink-0" />
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </main>
    </div>
  );
}
