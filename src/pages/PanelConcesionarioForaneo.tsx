import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { GlobalHeader } from '@/components/GlobalHeader';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ArrowLeft, Loader2, Truck, Route, Settings, DollarSign } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { ReporteViajes } from '@/components/ReporteViajes';
import PrivateRouteManagement from '@/components/PrivateRouteManagement';
import RutasMaestrasManager from '@/components/RutasMaestrasManager';
import ForaneoTarifasManager from '@/components/ForaneoTarifasManager';
import ForaneoTrazadoOverlay from '@/components/ForaneoTrazadoOverlay';

export default function PanelConcesionarioForaneo() {
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
          <div className="w-12 h-12 rounded-xl bg-emerald-100 flex items-center justify-center">
            <Truck className="h-6 w-6 text-emerald-600" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">Concesionario Foráneo</h1>
            <p className="text-sm text-muted-foreground">
              Rutas foráneas con GPS público. Viajes contados por geocercas A y B.
            </p>
          </div>
        </div>

        <Tabs defaultValue="reportes" className="w-full">
          <div className="overflow-x-auto -mx-4 px-4">
            <TabsList className="inline-flex w-auto min-w-full">
              <TabsTrigger value="reportes" className="text-xs">
                <Route className="h-3 w-3 mr-1" /> Reportes por Viaje
              </TabsTrigger>
              <TabsTrigger value="catalogo" className="text-xs">
                <Truck className="h-3 w-3 mr-1" /> Catálogo Maestro
              </TabsTrigger>
              <TabsTrigger value="tarifas" className="text-xs">
                <DollarSign className="h-3 w-3 mr-1" /> Tarifas QR
              </TabsTrigger>
              <TabsTrigger value="gestion" className="text-xs">
                <Settings className="h-3 w-3 mr-1" /> Unidades / Choferes / Rutas
              </TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value="reportes" className="space-y-3 mt-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <Route className="h-4 w-4" /> Viajes foráneos
                </CardTitle>
                <CardDescription className="text-xs">
                  Viajes contados automáticamente cuando la unidad entra a la geocerca de origen y llega a la de destino.
                </CardDescription>
              </CardHeader>
              <CardContent className="px-2 sm:px-6">
                <ReporteViajes proveedorId={proveedor.id} routeFilterType="foranea" />
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="catalogo" className="space-y-3 mt-4">
            <RutasMaestrasManager proveedorId={proveedor.id} />
          </TabsContent>

          <TabsContent value="tarifas" className="space-y-3 mt-4">
            <ForaneoTarifasManager proveedorId={proveedor.id} />
          </TabsContent>

          <TabsContent value="gestion" className="space-y-3 mt-4">
            <PrivateRouteManagement
              proveedorId={proveedor.id}
              businessName={proveedor.nombre || profile?.apodo || profile?.nombre || 'Mi Empresa'}
              transportType="foraneo"
            />
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}
