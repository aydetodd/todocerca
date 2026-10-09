import { useState, useEffect, useRef } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { GlobalHeader } from '@/components/GlobalHeader';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Loader2, CheckCircle, XCircle, Bus, User } from 'lucide-react';

export default function AcceptDriverInvite() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const { toast } = useToast();

  const [status, setStatus] = useState<'loading' | 'ready' | 'accepting' | 'success' | 'already' | 'error'>('loading');
  const [driverInfo, setDriverInfo] = useState<{
    nombre: string;
    businessName: string;
    vehicleNames: string[];
  } | null>(null);
  const [errorMsg, setErrorMsg] = useState('');

  const verifiedFor = useRef<string | null>(null);

  useEffect(() => {
    if (authLoading) return;

    if (!user) {
      // Save redirect URL in localStorage (Auth page reads it after login)
      const returnUrl = `/chofer-invitacion?token=${token}`;
      localStorage.setItem('redirectAfterLogin', returnUrl);
      navigate('/auth', { replace: true });
      return;
    }

    if (token) {
      // Verificar solo una vez por usuario+token (evita bucles de "Verificando...")
      const key = `${user.id}:${token}`;
      if (verifiedFor.current === key) return;
      verifiedFor.current = key;
      verifyInvitation();
    } else {
      setStatus('error');
      setErrorMsg('No se encontró el token de invitación');
    }
  }, [user?.id, authLoading, token]);

  const withTimeout = <T,>(p: PromiseLike<T>, ms = 12000): Promise<T> =>
    Promise.race([
      Promise.resolve(p),
      new Promise<T>((_, rej) => setTimeout(() => rej(new Error('timeout')), ms)),
    ]);

  const verifyInvitation = async () => {
    try {
      setStatus('loading');

      // Lectura por función segura (el invitado aún no tiene permiso de leer la tabla)
      const { data: rows, error: driverError } = await withTimeout(
        (supabase as any).rpc('get_chofer_by_invite_token', { p_token: token })
      ) as any;
      const driver = Array.isArray(rows) ? rows[0] : rows;

      if (driverError || !driver) {
        setStatus('error');
        setErrorMsg('La invitación no es válida o ha expirado');
        return;
      }

      if (!driver.is_active) {
        setStatus('error');
        setErrorMsg('Esta invitación ya no está activa');
        return;
      }

      const { data: proveedor } = await withTimeout(
        supabase.from('proveedores').select('nombre').eq('id', driver.proveedor_id).maybeSingle()
      ) as any;

      const { data: vehicles } = { data: [] as { nombre: string }[] };

      setDriverInfo({
        nombre: driver.nombre || 'Chofer',
        businessName: proveedor?.nombre || 'Empresa',
        vehicleNames: (vehicles || []).map(v => v.nombre),
      });

      setStatus('ready');
    } catch (error) {
      console.error('[AcceptDriverInvite] Error:', error);
      setStatus('error');
      setErrorMsg('Error al verificar la invitación');
    }
  };

  const handleAccept = async () => {
    if (!user || !token) return;

    try {
      setStatus('accepting');

      // Use edge function to link user_id (bypasses RLS)
      const { data, error } = await supabase.functions.invoke('accept-driver-invitation', {
        body: { invite_token: token },
      });

      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || 'Error al aceptar');

      setStatus('success');
      toast({
        title: '✅ ¡Bienvenido!',
        description: data.message || `Te has registrado como chofer de ${driverInfo?.businessName}`,
      });
    } catch (error: any) {
      console.error('[AcceptDriverInvite] Error accepting:', error);
      setStatus('error');
      setErrorMsg(error.message || 'Error al aceptar la invitación');
    }
  };

  const goToHome = () => {
    navigate('/home', { replace: true });
  };

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <GlobalHeader title="Invitación de Chofer" />

      <div className="flex-1 flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          {status === 'loading' && (
            <CardContent className="p-8 text-center">
              <Loader2 className="h-10 w-10 animate-spin mx-auto text-primary mb-4" />
              <p className="text-muted-foreground">Verificando invitación...</p>
            </CardContent>
          )}

          {status === 'ready' && driverInfo && (
            <>
              <CardHeader className="text-center">
                <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-2">
                  <Bus className="h-8 w-8 text-primary" />
                </div>
                <CardTitle className="text-xl">
                  ¡Hola {driverInfo.nombre}!
                </CardTitle>
                <CardDescription className="text-base">
                  Has sido invitado como chofer de <strong>{driverInfo.businessName}</strong>
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {driverInfo.vehicleNames.length > 0 && (
                  <div className="bg-muted/30 rounded-lg p-3">
                    <p className="text-sm font-medium mb-2">Rutas disponibles:</p>
                    <div className="flex flex-wrap gap-1.5">
                      {driverInfo.vehicleNames.map((name, i) => (
                        <Badge key={i} variant="secondary" className="text-xs">
                          🚌 {name}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}

                <p className="text-sm text-muted-foreground text-center">
                  Al aceptar, podrás seleccionar tu ruta diaria y compartir tu ubicación en tiempo real.
                </p>

                <Button
                  onClick={handleAccept}
                  className="w-full"
                  size="lg"
                >
                  <CheckCircle className="h-5 w-5 mr-2" />
                  Aceptar invitación
                </Button>
              </CardContent>
            </>
          )}

          {status === 'accepting' && (
            <CardContent className="p-8 text-center">
              <Loader2 className="h-10 w-10 animate-spin mx-auto text-primary mb-4" />
              <p className="text-muted-foreground">Registrándote como chofer...</p>
            </CardContent>
          )}

          {status === 'success' && driverInfo && (
            <CardContent className="p-8 text-center space-y-4">
              <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto">
                <CheckCircle className="h-8 w-8 text-primary" />
              </div>
              <div>
                <h3 className="text-lg font-semibold">¡Registro exitoso!</h3>
                <p className="text-sm text-muted-foreground mt-1">
                  Ya eres chofer autorizado de <strong>{driverInfo.businessName}</strong>.
                  Al iniciar la app, selecciona la ruta que cubrirás.
                </p>
              </div>
              <Button onClick={goToHome} className="w-full" size="lg">
                Ir al inicio
              </Button>
            </CardContent>
          )}

          {status === 'already' && driverInfo && (
            <CardContent className="p-8 text-center space-y-4">
              <div className="w-16 h-16 rounded-full bg-secondary flex items-center justify-center mx-auto">
                <User className="h-8 w-8 text-secondary-foreground" />
              </div>
              <div>
                <h3 className="text-lg font-semibold">Ya estás registrado</h3>
                <p className="text-sm text-muted-foreground mt-1">
                  Ya eres chofer de <strong>{driverInfo.businessName}</strong>.
                  Al iniciar la app, selecciona la ruta que cubrirás.
                </p>
              </div>
              <Button onClick={goToHome} className="w-full" size="lg">
                Ir al inicio
              </Button>
            </CardContent>
          )}

          {status === 'error' && (
            <CardContent className="p-8 text-center space-y-4">
              <div className="w-16 h-16 rounded-full bg-destructive/10 flex items-center justify-center mx-auto">
                <XCircle className="h-8 w-8 text-destructive" />
              </div>
              <div>
                <h3 className="text-lg font-semibold">Invitación no válida</h3>
                <p className="text-sm text-muted-foreground mt-1">{errorMsg}</p>
              </div>
              <Button onClick={goToHome} variant="outline" className="w-full">
                Ir al inicio
              </Button>
            </CardContent>
          )}
        </Card>
      </div>
    </div>
  );
}
