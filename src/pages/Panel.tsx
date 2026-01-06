import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { 
  User, 
  Navigation, 
  Package, 
  ClipboardList, 
  Calendar, 
  LogOut,
  ChevronRight,
  ArrowLeft
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';

export default function Panel() {
  const [profile, setProfile] = useState<any>(null);
  const [isProvider, setIsProvider] = useState(false);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();
  const { user, loading: authLoading, signOut } = useAuth();
  const { toast } = useToast();

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      navigate('/auth', { replace: true });
      return;
    }
    fetchProfile();
  }, [user, authLoading, navigate]);

  const fetchProfile = async () => {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('user_id', user?.id)
        .maybeSingle();

      if (error) throw error;
      setProfile(data);
      setIsProvider(data?.role === 'proveedor');
    } catch (error: any) {
      console.error('Error:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSignOut = async () => {
    try {
      await signOut();
      toast({
        title: "Sesión cerrada",
        description: "Has cerrado sesión correctamente",
      });
      navigate('/auth', { replace: true });
    } catch (error) {
      toast({
        title: "Error",
        description: "No se pudo cerrar la sesión",
        variant: "destructive",
      });
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    );
  }

  const menuItems = [
    {
      icon: User,
      title: 'Mi Perfil',
      description: 'Ver y editar tu información',
      path: '/mi-perfil',
      always: true,
    },
    {
      icon: Navigation,
      title: 'Tracking GPS',
      description: 'Rastreo familiar de dispositivos',
      path: '/tracking-gps',
      always: true,
    },
    {
      icon: Package,
      title: 'Mis Productos',
      description: 'Gestiona tu catálogo',
      path: '/mis-productos',
      providerOnly: true,
    },
    {
      icon: ClipboardList,
      title: 'Mis Apartados',
      description: 'Administra los apartados',
      path: '/gestion-pedidos',
      providerOnly: true,
    },
    {
      icon: Calendar,
      title: 'Mis Citas',
      description: 'Gestiona tus citas',
      path: '/dashboard',
      providerOnly: true,
    },
  ];

  const filteredItems = menuItems.filter(item => 
    item.always || (item.providerOnly && isProvider)
  );

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="bg-primary/5 border-b border-border sticky top-0 z-10">
        <div className="container mx-auto px-4 py-4 flex items-center gap-4">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => navigate('/home')}
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <h1 className="text-xl font-bold text-foreground">Panel</h1>
        </div>
      </header>

      <main className="container mx-auto px-4 py-6 space-y-4">
        {/* Saludo al usuario */}
        <div className="mb-6">
          <h2 className="text-2xl font-bold text-foreground">
            Hola, {profile?.nombre || 'Usuario'}
          </h2>
          <p className="text-muted-foreground">
            {isProvider ? 'Gestiona tu negocio' : 'Tu cuenta personal'}
          </p>
        </div>

        {/* Menú de opciones */}
        <div className="space-y-3">
          {filteredItems.map((item) => (
            <Card 
              key={item.path}
              className="cursor-pointer hover:border-primary transition-all"
              onClick={() => navigate(item.path)}
            >
              <CardContent className="p-4 flex items-center gap-4">
                <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                  <item.icon className="h-6 w-6 text-primary" />
                </div>
                <div className="flex-1">
                  <h3 className="font-semibold">{item.title}</h3>
                  <p className="text-sm text-muted-foreground">{item.description}</p>
                </div>
                <ChevronRight className="h-5 w-5 text-muted-foreground" />
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Botón de cerrar sesión */}
        <div className="pt-8">
          <Button 
            variant="destructive" 
            className="w-full h-14 text-lg"
            onClick={handleSignOut}
          >
            <LogOut className="h-5 w-5 mr-2" />
            Cerrar Sesión
          </Button>
        </div>
      </main>
    </div>
  );
}
