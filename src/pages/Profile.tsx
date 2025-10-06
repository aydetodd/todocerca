import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { MapPin, Search, Store, User, LogOut } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface ProfileData {
  nombre: string;
  apodo: string | null;
  telefono: string | null;
  email: string | null;
  role: string;
  consecutive_number: number;
  estado: string | null;
}

const Profile = () => {
  const navigate = useNavigate();
  const { user, signOut, loading: authLoading } = useAuth();
  const { toast } = useToast();
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!authLoading && !user) {
      navigate('/auth');
      return;
    }

    if (user) {
      loadProfile();
    }
  }, [user, authLoading, navigate]);

  const loadProfile = async () => {
    if (!user) return;

    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('nombre, apodo, telefono, email, role, consecutive_number, estado')
        .eq('user_id', user.id)
        .single();

      if (error) throw error;
      setProfile(data);
    } catch (error) {
      console.error('Error loading profile:', error);
      toast({
        title: 'Error',
        description: 'No se pudo cargar tu perfil',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleSignOut = async () => {
    await signOut();
    navigate('/auth');
  };

  if (loading || authLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <p className="text-muted-foreground">Cargando...</p>
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <p className="text-muted-foreground">No se pudo cargar el perfil</p>
      </div>
    );
  }

  const getInitials = () => {
    const name = profile.apodo || profile.nombre;
    return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-4 py-8 max-w-4xl">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center space-x-2">
            <MapPin className="h-8 w-8 text-primary" />
            <h1 className="text-2xl font-bold">TodoCerca</h1>
          </div>
          <Button variant="ghost" onClick={handleSignOut}>
            <LogOut className="h-4 w-4 mr-2" />
            Cerrar Sesión
          </Button>
        </div>

        {/* Profile Card */}
        <Card className="mb-8">
          <CardHeader>
            <div className="flex items-center space-x-4">
              <Avatar className="h-20 w-20">
                <AvatarFallback className="text-2xl">{getInitials()}</AvatarFallback>
              </Avatar>
              <div className="flex-1">
                <CardTitle className="text-2xl">{profile.apodo || profile.nombre}</CardTitle>
                <CardDescription className="text-base">
                  {profile.role === 'proveedor' ? 'Proveedor' : 'Cliente'}
                </CardDescription>
              </div>
              {profile.estado && (
                <div className={`px-3 py-1 rounded-full text-sm font-medium ${
                  profile.estado === 'available' 
                    ? 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300'
                    : profile.estado === 'busy'
                    ? 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300'
                    : 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300'
                }`}>
                  {profile.estado === 'available' ? 'Disponible' : profile.estado === 'busy' ? 'Ocupado' : 'Desconectado'}
                </div>
              )}
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <p className="text-sm text-muted-foreground">ID de Usuario</p>
                <p className="text-lg font-semibold text-primary">#{String(profile.consecutive_number).padStart(6, '0')}</p>
              </div>
              {profile.nombre !== profile.apodo && (
                <div>
                  <p className="text-sm text-muted-foreground">Nombre Completo</p>
                  <p className="text-lg font-medium">{profile.nombre}</p>
                </div>
              )}
              {profile.telefono && (
                <div>
                  <p className="text-sm text-muted-foreground">Teléfono</p>
                  <p className="text-lg font-medium">{profile.telefono}</p>
                </div>
              )}
              {profile.email && (
                <div>
                  <p className="text-sm text-muted-foreground">Email</p>
                  <p className="text-lg font-medium">{profile.email}</p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Actions */}
        <div className="space-y-4">
          <h2 className="text-xl font-semibold mb-4">¿Qué deseas hacer?</h2>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {profile.role === 'proveedor' && (
              <Card 
                className="cursor-pointer hover:shadow-lg transition-shadow"
                onClick={() => navigate('/dashboard-old')}
              >
                <CardHeader>
                  <div className="flex items-center space-x-3">
                    <div className="p-3 bg-primary/10 rounded-lg">
                      <Store className="h-6 w-6 text-primary" />
                    </div>
                    <div>
                      <CardTitle>Mi Negocio</CardTitle>
                      <CardDescription>Gestionar productos y servicios</CardDescription>
                    </div>
                  </div>
                </CardHeader>
              </Card>
            )}

            <Card 
              className="cursor-pointer hover:shadow-lg transition-shadow"
              onClick={() => navigate('/search')}
            >
              <CardHeader>
                <div className="flex items-center space-x-3">
                  <div className="p-3 bg-primary/10 rounded-lg">
                    <Search className="h-6 w-6 text-primary" />
                  </div>
                  <div>
                    <CardTitle>Buscar</CardTitle>
                    <CardDescription>Encontrar productos y servicios</CardDescription>
                  </div>
                </div>
              </CardHeader>
            </Card>

            {profile.role === 'cliente' && (
              <Card 
                className="cursor-pointer hover:shadow-lg transition-shadow"
                onClick={() => navigate('/dashboard')}
              >
                <CardHeader>
                  <div className="flex items-center space-x-3">
                    <div className="p-3 bg-primary/10 rounded-lg">
                      <User className="h-6 w-6 text-primary" />
                    </div>
                    <div>
                      <CardTitle>Mi Dashboard</CardTitle>
                      <CardDescription>Ver mi actividad</CardDescription>
                    </div>
                  </div>
                </CardHeader>
              </Card>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default Profile;
