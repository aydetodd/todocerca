import { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { CheckCircle, Store, XCircle } from 'lucide-react';

export default function TerminalInvitacion() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const [errorMsg, setErrorMsg] = useState('');
  const verifiedFor = useRef<string | null>(null);

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      if (token) localStorage.setItem('redirectAfterLogin', `/terminal-invitacion?token=${token}`);
      navigate('/auth', { replace: true });
      return;
    }
    if (!token) { setStatus('error'); setErrorMsg('No se encontró la invitación'); return; }
    const key = `${user.id}:${token}`;
    if (verifiedFor.current === key) return;
    verifiedFor.current = key;
    (async () => {
      const { error } = await supabase.rpc('terminal_accept_invite', { _token: token });
      if (error) { setStatus('error'); setErrorMsg(error.message || 'La invitación no es válida'); return; }
      setStatus('success');
    })();
  }, [user?.id, authLoading, token, navigate]);

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center">
            <Store className="h-8 w-8 text-primary" />
          </div>
          <CardTitle>Invitación de terminal</CardTitle>
          <CardDescription>Terminal digital de cobro y recargas</CardDescription>
        </CardHeader>
        <CardContent className="text-center space-y-4">
          {status === 'loading' && <p className="text-muted-foreground">Verificando invitación…</p>}
          {status === 'success' && (
            <>
              <div className="mx-auto w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center">
                <CheckCircle className="h-8 w-8 text-primary" />
              </div>
              <p className="text-sm text-muted-foreground">
                Listo: tu teléfono quedó conectado a la terminal del negocio. La encontrarás en «Mi perfil».
              </p>
              <Button className="w-full" onClick={() => navigate('/mi-perfil', { replace: true })}>Ir a mi perfil</Button>
            </>
          )}
          {status === 'error' && (
            <>
              <div className="mx-auto w-14 h-14 rounded-full bg-destructive/10 flex items-center justify-center">
                <XCircle className="h-8 w-8 text-destructive" />
              </div>
              <p className="text-sm text-destructive">{errorMsg}</p>
              <Button variant="outline" className="w-full" onClick={() => navigate('/', { replace: true })}>Ir al inicio</Button>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
