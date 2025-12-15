import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Search, Users, Package, ClipboardList, Navigation } from 'lucide-react';
import { GlobalHeader } from '@/components/GlobalHeader';
import ProviderRegistration from '@/components/ProviderRegistration';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';

export default function DashboardMain() {
  const [profile, setProfile] = useState<any>(null);
  const [userSpecificData, setUserSpecificData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [showProviderRegistration, setShowProviderRegistration] = useState(false);
  const navigate = useNavigate();
  const { toast } = useToast();
  const { user, loading: authLoading, signOut } = useAuth();

  // Format user ID with 6 digits and role suffix
  const formatUserId = (consecutiveNumber: number, role: string) => {
    const paddedNumber = String(consecutiveNumber).padStart(6, '0');
    const suffix = role === 'proveedor' ? 'p' : 'c';
    return `${paddedNumber}${suffix}`;
  };

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      navigate("/auth", { replace: true });
      return;
    }
    getProfile();
  }, [user, authLoading, navigate]);

  async function getProfile() {
    try {
      if (!user) return;

      // Obtener perfil
      const { data: profileData, error: profileError } = await supabase
        .from('profiles')
        .select('*')
        .eq('user_id', user.id)
        .maybeSingle();

      if (profileError) {
        console.error('Error obteniendo perfil:', profileError);
        throw profileError;
      }

      if (!profileData) {
        console.warn('No se encontró perfil para el usuario');
        setProfile(null);
        setLoading(false);
        return;
      }

      setProfile(profileData);

      // Obtener datos específicos según el rol
      if (profileData.role === 'cliente') {
        const { data: clienteData, error: clienteError } = await supabase
          .from('clientes')
          .select('*')
          .eq('user_id', user.id)
          .maybeSingle();

        if (clienteError) {
          console.error('Error obteniendo datos de cliente:', clienteError);
        } else {
          setUserSpecificData(clienteData);
        }
      } else if (profileData.role === 'proveedor') {
        const { data: proveedorData, error: proveedorError } = await supabase
          .from('proveedores')
          .select('*')
          .eq('user_id', user.id)
          .maybeSingle();

        if (proveedorError) {
          console.error('Error obteniendo datos de proveedor:', proveedorError);
        } else {
          setUserSpecificData(proveedorData);
          
          // Check if provider registration is incomplete
          if (!proveedorData) {
            setShowProviderRegistration(true);
            toast({
              title: "Completa tu perfil",
              description: "Necesitas completar tu registro de proveedor",
            });
          }
        }
      }
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }

  async function handleSignOut() {
    await signOut();
    navigate("/");
  }

  const handleProviderRegistrationComplete = () => {
    setShowProviderRegistration(false);
    getProfile(); // Refresh status
    toast({
      title: "¡Registro completado!",
      description: "Tu perfil de proveedor está listo",
    });
  };

  // Show ProviderRegistration if provider hasn't completed profile
  if (showProviderRegistration && profile) {
    return (
      <ProviderRegistration
        onComplete={handleProviderRegistrationComplete}
        userData={{
          email: profile.user_id ? `${profile.telefono?.replace(/\+/g, '')}@todocerca.app` : '',
          nombre: profile.nombre || '',
          telefono: profile.telefono || '',
          codigoPostal: profile.codigo_postal || '',
        }}
      />
    );
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-primary mx-auto"></div>
          <p className="mt-4 text-muted-foreground">Cargando...</p>
        </div>
      </div>
    );
  }

  const isProvider = profile?.role === 'proveedor';

  return (
    <div className="min-h-screen bg-background">
      <GlobalHeader />

      {/* Main Content */}
      <main className="container mx-auto px-4 py-8">
        <div className="mb-8">
          <h2 className="text-3xl font-bold text-foreground mb-2">
            ¡Bienvenido, {profile?.nombre}!
          </h2>
          <p className="text-muted-foreground">
            {isProvider ? "Gestiona tu negocio y productos" : "Explora productos y servicios cerca de ti"}
          </p>
        </div>

        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {/* Buscar - Available for all users */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <Search className="h-5 w-5" />
                <span>Buscar</span>
              </CardTitle>
              <CardDescription>Encuentra productos y servicios cerca de ti</CardDescription>
            </CardHeader>
            <CardContent>
              <Button className="w-full" onClick={() => navigate("/search")}>
                <Search className="h-4 w-4 mr-2" />
                Buscar Productos
              </Button>
            </CardContent>
          </Card>

          {/* Mi Perfil */}
          <Card className="cursor-pointer hover:border-primary transition-colors" onClick={() => navigate('/mi-perfil')}>
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <Users className="h-5 w-5" />
                <span>Mi Perfil</span>
              </CardTitle>
              <CardDescription>Ver información de tu cuenta</CardDescription>
            </CardHeader>
            <CardContent>
              <Button className="w-full">
                <Users className="h-4 w-4 mr-2" />
                Ver Perfil
              </Button>
            </CardContent>
          </Card>

          {/* Tracking GPS Familiar */}
          <Card className="cursor-pointer hover:border-primary transition-colors" onClick={() => navigate('/tracking-gps')}>
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <Navigation className="h-5 w-5" />
                <span>Tracking GPS</span>
              </CardTitle>
              <CardDescription>Rastreo familiar de hasta 5 dispositivos</CardDescription>
            </CardHeader>
            <CardContent>
              <Button className="w-full">
                <Navigation className="h-4 w-4 mr-2" />
                Gestionar Grupo
              </Button>
            </CardContent>
          </Card>

          {/* Mis Productos - Solo para proveedores */}
          {isProvider && (
            <Card className="cursor-pointer hover:border-primary transition-colors" onClick={() => navigate('/mis-productos')}>
              <CardHeader>
                <CardTitle className="flex items-center space-x-2">
                  <Package className="h-5 w-5" />
                  <span>Mis Productos</span>
                </CardTitle>
                <CardDescription>Gestiona tu catálogo de productos</CardDescription>
              </CardHeader>
              <CardContent>
                <Button className="w-full">
                  <Package className="h-4 w-4 mr-2" />
                  Gestionar Productos
                </Button>
              </CardContent>
            </Card>
          )}

          {/* Gestión de Pedidos - Solo para proveedores */}
          {isProvider && (
            <Card className="cursor-pointer hover:border-primary transition-colors" onClick={() => navigate('/gestion-pedidos')}>
              <CardHeader>
                <CardTitle className="flex items-center space-x-2">
                  <ClipboardList className="h-5 w-5" />
                  <span>Mis Pedidos</span>
                </CardTitle>
                <CardDescription>Administra los pedidos de clientes</CardDescription>
              </CardHeader>
              <CardContent>
                <Button className="w-full">
                  <ClipboardList className="h-4 w-4 mr-2" />
                  Ver Pedidos
                </Button>
              </CardContent>
            </Card>
          )}
        </div>
      </main>
    </div>
  );
}