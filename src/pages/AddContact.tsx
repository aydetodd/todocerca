import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Loader2, UserPlus, CheckCircle, AlertCircle } from 'lucide-react';

const AddContact = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const token = searchParams.get('token');
  
  const [loading, setLoading] = useState(true);
  const [contactProfile, setContactProfile] = useState<any>(null);
  const [nickname, setNickname] = useState('');
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    const fetchContact = async () => {
      if (!token) {
        setError('Enlace inválido');
        setLoading(false);
        return;
      }

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        // Guardar el token para después del login
        localStorage.setItem('pending_contact_token', token);
        navigate('/auth');
        return;
      }

      // Buscar el perfil por token
      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('user_id, apodo, nombre')
        .eq('contact_token', token)
        .single();

      if (profileError || !profile) {
        setError('Contacto no encontrado');
        setLoading(false);
        return;
      }

      // Verificar que no sea uno mismo
      if (profile.user_id === user.id) {
        setError('No puedes agregarte a ti mismo como contacto');
        setLoading(false);
        return;
      }

      // Verificar si ya es contacto
      const { data: existing } = await supabase
        .from('user_contacts')
        .select('id')
        .eq('user_id', user.id)
        .eq('contact_user_id', profile.user_id)
        .single();

      if (existing) {
        setError('Este usuario ya está en tus contactos');
        setLoading(false);
        return;
      }

      setContactProfile(profile);
      setNickname(profile.apodo || profile.nombre || '');
      setLoading(false);
    };

    fetchContact();
  }, [token, navigate]);

  const handleAddContact = async () => {
    if (!contactProfile) return;
    
    setAdding(true);
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) {
      toast({ title: 'Error', description: 'Debes iniciar sesión', variant: 'destructive' });
      setAdding(false);
      return;
    }

    // Agregar contacto bidireccional usando función de base de datos
    const { error: fnError } = await supabase.rpc('add_bidirectional_contact', {
      p_contact_user_id: contactProfile.user_id,
      p_nickname: nickname || null
    });

    if (fnError) {
      toast({ title: 'Error', description: 'No se pudo agregar el contacto', variant: 'destructive' });
      setAdding(false);
      return;
    }

    setSuccess(true);
    setAdding(false);
    
    toast({ title: 'Contacto agregado', description: `${nickname || contactProfile.apodo} ahora está en tus contactos` });
    
    setTimeout(() => {
      navigate('/mensajes');
    }, 2000);
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
          <CardContent className="pt-6 text-center">
            <AlertCircle className="h-16 w-16 text-destructive mx-auto mb-4" />
            <h2 className="text-xl font-semibold mb-2">Error</h2>
            <p className="text-muted-foreground mb-4">{error}</p>
            <Button onClick={() => navigate('/')}>Volver al inicio</Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (success) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Card className="w-full max-w-md">
          <CardContent className="pt-6 text-center">
            <CheckCircle className="h-16 w-16 text-green-500 mx-auto mb-4" />
            <h2 className="text-xl font-semibold mb-2">¡Contacto agregado!</h2>
            <p className="text-muted-foreground">Redirigiendo a mensajes...</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <UserPlus className="h-12 w-12 text-primary mx-auto mb-2" />
          <CardTitle>Agregar contacto</CardTitle>
          <CardDescription>
            {contactProfile?.apodo || contactProfile?.nombre} quiere conectar contigo
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <label className="text-sm font-medium">Nombre del contacto (opcional)</label>
            <Input
              value={nickname}
              onChange={(e) => setNickname(e.target.value)}
              placeholder="¿Cómo quieres llamar a este contacto?"
            />
          </div>
          
          <Button 
            className="w-full" 
            onClick={handleAddContact}
            disabled={adding}
          >
            {adding ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Agregando...
              </>
            ) : (
              <>
                <UserPlus className="mr-2 h-4 w-4" />
                Agregar a mis contactos
              </>
            )}
          </Button>
          
          <Button 
            variant="outline" 
            className="w-full"
            onClick={() => navigate('/')}
          >
            Cancelar
          </Button>
        </CardContent>
      </Card>
    </div>
  );
};

export default AddContact;
