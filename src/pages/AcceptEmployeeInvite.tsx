import { useState, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { GlobalHeader } from '@/components/GlobalHeader';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Loader2, CheckCircle, XCircle, Building2, User } from 'lucide-react';

type Status = 'loading' | 'ready' | 'accepting' | 'success' | 'already' | 'error';

interface InviteInfo {
  nombre: string;
  companyName: string;
}

export default function AcceptEmployeeInvite() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const { toast } = useToast();

  const [status, setStatus] = useState<Status>('loading');
  const [info, setInfo] = useState<InviteInfo | null>(null);
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      localStorage.setItem('redirectAfterLogin', `/empleado-invitacion?token=${token}`);
      navigate('/auth', { replace: true });
      return;
    }
    if (token) verifyInvitation();
    else { setStatus('error'); setErrorMsg('No se encontró el token de invitación'); }
  }, [user, authLoading, token]);

  const verifyInvitation = async () => {
    try {
      setStatus('loading');
      const { data: emp, error } = await supabase
        .from('empleados_empresa')
        .select('id, nombre, user_id, is_active, empresa_id')
        .eq('invite_token', token!)
        .maybeSingle();

      if (error || !emp) { setStatus('error'); setErrorMsg('La invitación no es válida'); return; }
      if (!emp.is_active) { setStatus('error'); setErrorMsg('Esta invitación ya no está activa'); return; }

      const { data: empresa } = await supabase
        .from('empresas_transporte')
        .select('nombre')
        .eq('id', emp.empresa_id)
        .single();

      const inviteInfo: InviteInfo = {
        nombre: emp.nombre || 'Empleado',
        companyName: empresa?.nombre || 'Empresa',
      };
      setInfo(inviteInfo);

      if (emp.user_id === user!.id) { setStatus('already'); return; }
      if (emp.user_id && emp.user_id !== user!.id) { setStatus('error'); setErrorMsg('Esta invitación ya fue aceptada por otro usuario'); return; }

      setStatus('ready');
    } catch {
      setStatus('error');
      setErrorMsg('Error al verificar la invitación');
    }
  };

  const handleAccept = async () => {
    if (!user || !token) return;
    try {
      setStatus('accepting');
      const { data, error } = await supabase.functions.invoke('accept-employee-invitation', {
        body: { invite_token: token },
      });
      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || 'Error al aceptar');

      setStatus('success');
      toast({ title: '✅ ¡Vinculado!', description: data.message });
    } catch (error: any) {
      setStatus('error');
      setErrorMsg(error.message || 'Error al aceptar la invitación');
    }
  };

  const goToHome = () => navigate('/home', { replace: true });

  const renderContent = () => {
    switch (status) {
      case 'loading':
        return (
          <CardContent className="p-8 text-center">
            <Loader2 className="h-10 w-10 animate-spin mx-auto text-primary mb-4" />
            <p className="text-muted-foreground">Verificando invitación...</p>
          </CardContent>
        );
      case 'ready':
        return (
          <>
            <CardHeader className="text-center">
              <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-2">
                <Building2 className="h-8 w-8 text-primary" />
              </div>
              <CardTitle className="text-xl">¡Hola {info?.nombre}!</CardTitle>
              <CardDescription className="text-base">
                Has sido invitado como empleado de <strong>{info?.companyName}</strong>
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-muted-foreground text-center">
                Al aceptar, recibirás tu código QR de transporte directamente en la app.
              </p>
              <Button onClick={handleAccept} className="w-full" size="lg">
                <CheckCircle className="h-5 w-5 mr-2" /> Aceptar invitación
              </Button>
            </CardContent>
          </>
        );
      case 'accepting':
        return (
          <CardContent className="p-8 text-center">
            <Loader2 className="h-10 w-10 animate-spin mx-auto text-primary mb-4" />
            <p className="text-muted-foreground">Vinculando tu cuenta...</p>
          </CardContent>
        );
      case 'success':
        return (
          <CardContent className="p-8 text-center space-y-4">
            <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto">
              <CheckCircle className="h-8 w-8 text-primary" />
            </div>
            <div>
              <h3 className="text-lg font-semibold">¡Vinculación exitosa!</h3>
              <p className="text-sm text-muted-foreground mt-1">
                Ya eres empleado de <strong>{info?.companyName}</strong>. Recibirás tu QR de transporte en tus mensajes.
              </p>
            </div>
            <Button onClick={goToHome} className="w-full" size="lg">Ir al inicio</Button>
          </CardContent>
        );
      case 'already':
        return (
          <CardContent className="p-8 text-center space-y-4">
            <div className="w-16 h-16 rounded-full bg-secondary flex items-center justify-center mx-auto">
              <User className="h-8 w-8 text-secondary-foreground" />
            </div>
            <div>
              <h3 className="text-lg font-semibold">Ya estás vinculado</h3>
              <p className="text-sm text-muted-foreground mt-1">
                Ya eres empleado de <strong>{info?.companyName}</strong>.
              </p>
            </div>
            <Button onClick={goToHome} className="w-full" size="lg">Ir al inicio</Button>
          </CardContent>
        );
      case 'error':
        return (
          <CardContent className="p-8 text-center space-y-4">
            <div className="w-16 h-16 rounded-full bg-destructive/10 flex items-center justify-center mx-auto">
              <XCircle className="h-8 w-8 text-destructive" />
            </div>
            <div>
              <h3 className="text-lg font-semibold">Invitación no válida</h3>
              <p className="text-sm text-muted-foreground mt-1">{errorMsg}</p>
            </div>
            <Button onClick={goToHome} variant="outline" className="w-full">Ir al inicio</Button>
          </CardContent>
        );
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <GlobalHeader title="Invitación de Empleado" />
      <div className="flex-1 flex items-center justify-center p-4">
        <Card className="w-full max-w-md">{renderContent()}</Card>
      </div>
    </div>
  );
}
