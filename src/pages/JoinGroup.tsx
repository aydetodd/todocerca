import { useEffect, useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { Loader2, MapPin, Users, CheckCircle, XCircle } from 'lucide-react';

const JoinGroup = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  
  const [loading, setLoading] = useState(true);
  const [joining, setJoining] = useState(false);
  const [nickname, setNickname] = useState('');
  const [invitation, setInvitation] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  const token = searchParams.get('token');

  useEffect(() => {
    const checkAuthAndInvitation = async () => {
      if (!token) {
        setError('Link de invitación inválido');
        setLoading(false);
        return;
      }

      // Check if user is authenticated
      const { data: { user } } = await supabase.auth.getUser();
      setIsAuthenticated(!!user);

      // Fetch invitation details
      const { data: invite, error: inviteError } = await supabase
        .from('tracking_invitations')
        .select('*, tracking_groups(name)')
        .eq('invite_token', token)
        .eq('status', 'pending')
        .single();

      if (inviteError || !invite) {
        setError('Invitación no válida o ya fue utilizada');
        setLoading(false);
        return;
      }

      // Check if expired
      if (invite.expires_at && new Date(invite.expires_at) < new Date()) {
        setError('Esta invitación ha expirado');
        setLoading(false);
        return;
      }

      setInvitation(invite);
      setNickname(invite.nickname || '');
      setLoading(false);
    };

    checkAuthAndInvitation();
  }, [token]);

  const handleJoin = async () => {
    if (!isAuthenticated) {
      // Redirect to auth with return URL
      const returnUrl = `/join-group?token=${token}`;
      navigate(`/auth?returnTo=${encodeURIComponent(returnUrl)}`);
      return;
    }

    setJoining(true);

    try {
      const { data, error } = await supabase.functions.invoke('accept-link-invitation', {
        body: { invite_token: token, nickname: nickname.trim() || undefined }
      });

      if (error || !data.success) {
        throw new Error(data?.error || error?.message || 'Error al unirse');
      }

      setSuccess(true);
      toast({
        title: '¡Te has unido!',
        description: data.message,
      });

      // Redirect to tracking page after 2 seconds
      setTimeout(() => {
        navigate('/tracking-gps');
      }, 2000);

    } catch (err: any) {
      toast({
        title: 'Error',
        description: err.message,
        variant: 'destructive',
      });
    } finally {
      setJoining(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <XCircle className="h-16 w-16 text-destructive mx-auto mb-4" />
            <CardTitle>Invitación Inválida</CardTitle>
            <CardDescription>{error}</CardDescription>
          </CardHeader>
          <CardContent>
            <Button 
              className="w-full" 
              variant="outline"
              onClick={() => navigate('/')}
            >
              Ir al Inicio
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (success) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <CheckCircle className="h-16 w-16 text-green-500 mx-auto mb-4" />
            <CardTitle>¡Bienvenido!</CardTitle>
            <CardDescription>
              Te has unido exitosamente al grupo "{invitation?.tracking_groups?.name}"
            </CardDescription>
          </CardHeader>
          <CardContent className="text-center text-muted-foreground">
            Redirigiendo al mapa...
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="flex justify-center mb-4">
            <div className="p-4 bg-primary/10 rounded-full">
              <Users className="h-12 w-12 text-primary" />
            </div>
          </div>
          <CardTitle>Únete al Grupo</CardTitle>
          <CardDescription>
            Has sido invitado a unirte al grupo de rastreo
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="bg-muted/50 rounded-lg p-4 text-center">
            <div className="flex items-center justify-center gap-2 text-lg font-semibold">
              <MapPin className="h-5 w-5 text-primary" />
              {invitation?.tracking_groups?.name}
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="nickname">Tu nombre en el grupo</Label>
            <Input
              id="nickname"
              value={nickname}
              onChange={(e) => setNickname(e.target.value)}
              placeholder="Ej: Mamá, Papá, Juan..."
            />
          </div>

          {!isAuthenticated && (
            <p className="text-sm text-muted-foreground text-center">
              Necesitas iniciar sesión para unirte al grupo
            </p>
          )}

          <Button
            className="w-full"
            onClick={handleJoin}
            disabled={joining}
          >
            {joining ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Uniéndose...
              </>
            ) : isAuthenticated ? (
              'Unirme al Grupo'
            ) : (
              'Iniciar Sesión y Unirme'
            )}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
};

export default JoinGroup;
