import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { GlobalHeader } from '@/components/GlobalHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Loader2, ShieldCheck, GraduationCap, Building2, Route, GitPullRequest } from 'lucide-react';
import AdminVerificaciones from '@/components/AdminVerificaciones';
import AdminDescuentos from '@/components/AdminDescuentos';
import AdminRutasMaestras from '@/components/AdminRutasMaestras';
import AdminSolicitudesCambioRutas from '@/components/AdminSolicitudesCambioRutas';
import AdminSolicitudesMoral from '@/components/qard/AdminSolicitudesMoral';
import { AdminPinGate } from '@/components/AdminPinGate';

type Seccion = 'descuentos' | 'comerciantes' | 'verificaciones' | 'rutas' | 'cambios' | null;

const ATAJOS: { id: Exclude<Seccion, null>; titulo: string; texto: string; Icon: any }[] = [
  { id: 'descuentos', titulo: 'Descuentos', texto: 'Estudiante y tercera edad', Icon: GraduationCap },
  { id: 'comerciantes', titulo: 'Comerciantes', texto: 'Usuario que quiere cobrar', Icon: Building2 },
  { id: 'verificaciones', titulo: 'Verificaciones', texto: 'Documentos de concesionarios', Icon: ShieldCheck },
  { id: 'rutas', titulo: 'Rutas maestras', texto: 'Altas de rutas foráneas', Icon: Route },
  { id: 'cambios', titulo: 'Cambios de ruta', texto: 'Solicitudes de ajuste', Icon: GitPullRequest },
];

export default function AdminQuickAccess() {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [esAdmin, setEsAdmin] = useState<boolean | null>(null);
  const [seccion, setSeccion] = useState<Seccion>(null);

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      navigate('/auth', { replace: true });
      return;
    }
    (async () => {
      const { data } = await supabase
        .from('profiles')
        .select('consecutive_number')
        .eq('user_id', user.id)
        .maybeSingle();
      setEsAdmin(data?.consecutive_number === 1);
    })();
  }, [user, authLoading, navigate]);

  if (authLoading || esAdmin === null) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!esAdmin) {
    return (
      <div className="min-h-screen bg-background">
        <GlobalHeader title="Administración" />
        <div className="container mx-auto px-4 py-10 pb-40">
          <p className="text-sm text-muted-foreground">Esta sección es solo para el administrador.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <GlobalHeader title="Administración" />
      <AdminPinGate>
      <main className="container mx-auto px-4 py-4 pb-40 space-y-4">
        <h1 className="text-xl font-bold">Autorizaciones rápidas</h1>

        <div className="grid grid-cols-2 gap-3">
          {ATAJOS.map(({ id, titulo, texto, Icon }) => (
            <Card
              key={id}
              onClick={() => setSeccion(seccion === id ? null : id)}
              className={`cursor-pointer transition-colors ${seccion === id ? 'border-primary bg-primary/5' : ''}`}
            >
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-sm">
                  <Icon className="h-4 w-4 text-primary" />
                  {titulo}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-xs text-muted-foreground">{texto}</p>
              </CardContent>
            </Card>
          ))}
        </div>

        {seccion === 'descuentos' && <AdminDescuentos />}
        {seccion === 'comerciantes' && <AdminSolicitudesMoral />}
        {seccion === 'verificaciones' && <AdminVerificaciones />}
        {seccion === 'rutas' && <AdminRutasMaestras />}
        {seccion === 'cambios' && <AdminSolicitudesCambioRutas />}

        {!seccion && (
          <p className="text-sm text-muted-foreground">Toca una tarjeta para abrir sus solicitudes pendientes.</p>
        )}

        <Button variant="outline" className="w-full" onClick={() => navigate('/panel')}>
          Ir al panel completo
        </Button>
      </main>
      </AdminPinGate>
    </div>
  );
}
