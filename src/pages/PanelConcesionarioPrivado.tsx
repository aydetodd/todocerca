import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { GlobalHeader } from '@/components/GlobalHeader';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ArrowLeft, Loader2, CarFront, Route, Users } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { ReporteViajes } from '@/components/ReporteViajes';
import ConcesionarioReportes from '@/components/ConcesionarioReportes';
import PrivateRouteManagement from '@/components/PrivateRouteManagement';

export default function PanelConcesionarioPrivado() {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [proveedor, setProveedor] = useState<any>(null);
  const [profile, setProfile] = useState<any>(null);

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      navigate('/auth', { replace: true });
      return;
    }
    (async () => {
      try {
        const { data: prof } = await supabase
          .from('profiles')
          .select('*')
          .eq('user_id', user.id)
          .maybeSingle();

        if (!prof || prof.role !== 'proveedor') {
          toast({
            title: 'Acceso denegado',
            description: 'Solo los concesionarios pueden acceder a este panel.',
            variant: 'destructive',
          });
          navigate('/dashboard');
          return;
        }
        setProfile(prof);

        const { data: prov } = await supabase
          .from('proveedores')
          .select('*')
          .eq('user_id', user.id)
          .maybeSingle();

        setProveedor(prov);
      } catch (e: any) {
        toast({ title: 'Error', description: e.message, variant: 'destructive' });
      } finally {
        setLoading(false);
      }
    })();
  }, [user, authLoading, navigate, toast]);

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="h-10 w-10 animate-spin text-primary" />
      </div>
    );
  }

  if (!proveedor) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <p className="text-muted-foreground">No se encontraron datos de concesionario.</p>
          <Button className="mt-4" onClick={() => navigate('/panel-concesionario')}>
            Volver
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <GlobalHeader />
      <main className="container mx-auto px-4 py-6 pb-40 max-w-5xl">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => navigate('/panel-concesionario')}
          className="mb-3"
        >
          <ArrowLeft className="h-4 w-4 mr-1" /> Panel de Concesionario
        </Button>

        <div className="flex items-center gap-3 mb-6">
          <div className="w-12 h-12 rounded-xl bg-amber-100 flex items-center justify-center">
            <CarFront className="h-6 w-6 text-amber-600" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">Concesionario Privado</h1>
            <p className="text-sm text-muted-foreground">
              Operación de transporte privado: por viaje, por pasajeros y reportes.
            </p>
          </div>
        </div>

        <Tabs defaultValue="por_viaje" className="w-full">
          <div className="overflow-x-auto -mx-4 px-4">
            <TabsList className="inline-flex w-auto min-w-full">
              <TabsTrigger value="por_viaje" className="text-xs">
                <Route className="h-3 w-3 mr-1" /> Por Viaje
              </TabsTrigger>
              <TabsTrigger value="por_pasajeros" className="text-xs">
                <Users className="h-3 w-3 mr-1" /> Por Pasajeros
              </TabsTrigger>
              <TabsTrigger value="reportes" className="text-xs">
                <BarChart3 className="h-3 w-3 mr-1" /> Reportes
              </TabsTrigger>
            </TabsList>
          </div>

          {/* POR VIAJE: viajes contados por geocercas (modelo por_viaje) */}
          <TabsContent value="por_viaje" className="space-y-3 mt-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <Route className="h-4 w-4" /> Servicios por viaje
                </CardTitle>
                <CardDescription className="text-xs">
                  Conteo de viajes completados por unidad y chofer (sin QR de pasajero).
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ReporteViajes proveedorId={proveedor.id} />
              </CardContent>
            </Card>
          </TabsContent>

          {/* POR PASAJEROS: validaciones QR (boletos personales/empresa) */}
          <TabsContent value="por_pasajeros" className="space-y-3 mt-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <Users className="h-4 w-4" /> Servicios por pasajeros
                </CardTitle>
                <CardDescription className="text-xs">
                  Boletos QR validados por unidad, chofer y ruta.
                </CardDescription>
              </CardHeader>
              <CardContent className="px-2 sm:px-6">
                <ConcesionarioReportes proveedorId={proveedor.id} />
              </CardContent>
            </Card>
          </TabsContent>

          {/* REPORTES consolidados */}
          <TabsContent value="reportes" className="space-y-3 mt-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <BarChart3 className="h-4 w-4" /> Reportes consolidados
                </CardTitle>
                <CardDescription className="text-xs">
                  Filtra por periodo, unidad, chofer o ruta y exporta a CSV.
                </CardDescription>
              </CardHeader>
              <CardContent className="px-2 sm:px-6">
                <ConcesionarioReportes proveedorId={proveedor.id} />
              </CardContent>
            </Card>
          </TabsContent>

        </Tabs>
      </main>
    </div>
  );
}
