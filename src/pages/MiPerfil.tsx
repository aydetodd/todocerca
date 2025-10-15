import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { MapPin, LogOut, Search, Users, Map, ArrowLeft, Package, ClipboardList, Briefcase } from 'lucide-react';
import { StatusControl } from '@/components/StatusControl';
import QRCodeGenerator from '@/components/QRCodeGenerator';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';

export default function MiPerfil() {
  const [profile, setProfile] = useState<any>(null);
  const [userSpecificData, setUserSpecificData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [upgrading, setUpgrading] = useState(false);
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

  async function handleUpgradeToProvider() {
    try {
      setUpgrading(true);
      const { data, error } = await supabase.functions.invoke('upgrade-to-provider');
      
      if (error) throw error;
      
      if (data.url) {
        window.open(data.url, '_blank');
        toast({
          title: "Redirigiendo a pago",
          description: "Completa el pago para convertirte en proveedor",
        });
      }
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setUpgrading(false);
    }
  }

  // Verificar si el upgrade fue exitoso
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('upgrade') === 'success') {
      toast({
        title: "¡Pago exitoso!",
        description: "Contacta al administrador para activar tu cuenta de proveedor",
      });
      // Limpiar el parámetro de la URL
      window.history.replaceState({}, '', '/mi-perfil');
    }
  }, []);

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
      {/* Header */}
      <header className="border-b border-border bg-card">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div className="flex items-center space-x-2">
              <MapPin className="h-8 w-8 text-primary" />
              <h1 className="text-2xl font-bold text-foreground">TodoCerca</h1>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <Badge variant={isProvider ? "default" : "secondary"}>
                {isProvider ? "Proveedor" : "Cliente"}
              </Badge>
              <Button variant="outline" size="sm" onClick={() => navigate('/dashboard')}>
                <ArrowLeft className="h-4 w-4 mr-2" />
                Dashboard
              </Button>
              {isProvider && (
                <>
                  <Button variant="outline" size="sm" onClick={() => navigate('/mis-productos')}>
                    <Package className="h-4 w-4 mr-2" />
                    Productos
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => navigate('/gestion-pedidos')}>
                    <ClipboardList className="h-4 w-4 mr-2" />
                    Pedidos
                  </Button>
                </>
              )}
              <Button variant="outline" size="sm" onClick={() => navigate('/mapa')}>
                <Map className="h-4 w-4 mr-2" />
                Mapa
              </Button>
              <Button variant="outline" size="sm" onClick={handleSignOut}>
                <LogOut className="h-4 w-4 mr-2" />
                Cerrar Sesión
              </Button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-4 py-8">
        <div className="mb-8">
          <h2 className="text-3xl font-bold text-foreground mb-2">Mi Perfil</h2>
          <p className="text-muted-foreground">
            Información de tu cuenta y estado
          </p>
        </div>

        <Card className="max-w-2xl">
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <Users className="h-5 w-5" />
              <span>Información Personal</span>
            </CardTitle>
            <CardDescription>Tus datos de usuario</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-start gap-4">
              <div className="flex-1 space-y-4">
                {profile?.consecutive_number && (
                  <div>
                    <span className="text-sm font-medium">ID Usuario:</span>
                    <p className="text-sm font-mono font-bold text-primary">
                      {formatUserId(profile.consecutive_number, profile.role)}
                    </p>
                  </div>
                )}
                <div>
                  <span className="text-sm font-medium">Nombre:</span>
                  <p className="text-sm text-muted-foreground">{profile?.nombre}</p>
                </div>
                {user?.email && !user.email.endsWith('@todocerca.app') && (
                  <div>
                    <span className="text-sm font-medium">Email:</span>
                    <p className="text-sm text-muted-foreground">{user.email}</p>
                  </div>
                )}
                <div>
                  <span className="text-sm font-medium">Rol:</span>
                  <p className="text-sm text-muted-foreground">
                    {isProvider ? "Proveedor" : "Cliente"}
                  </p>
                </div>
                {userSpecificData?.telefono && (
                  <div>
                    <span className="text-sm font-medium">Teléfono:</span>
                    <p className="text-sm text-muted-foreground">{userSpecificData.telefono}</p>
                  </div>
                )}
                {userSpecificData?.codigo_postal && (
                  <div>
                    <span className="text-sm font-medium">Código Postal:</span>
                    <p className="text-sm text-muted-foreground">{userSpecificData.codigo_postal}</p>
                  </div>
                )}
                
                {/* Botón para convertirse en proveedor si es cliente */}
                {profile?.role === 'cliente' && (
                  <div className="pt-4 border-t">
                    <Button 
                      onClick={handleUpgradeToProvider}
                      disabled={upgrading}
                      className="w-full"
                    >
                      <Briefcase className="h-4 w-4 mr-2" />
                      {upgrading ? 'Procesando...' : 'Convertirme en Proveedor ($200 MXN/año)'}
                    </Button>
                    <p className="text-xs text-muted-foreground mt-2 text-center">
                      Publica hasta 500 productos y servicios
                    </p>
                  </div>
                )}
                
                {/* QR Code Generator for Providers */}
                {isProvider && userSpecificData?.id && (
                  <div className="pt-4 border-t">
                    <QRCodeGenerator 
                      proveedorId={userSpecificData.id} 
                      businessName={userSpecificData.nombre || profile.nombre}
                    />
                  </div>
                )}
              </div>
              
              {/* Status Control - Traffic Light */}
              <div className="flex-shrink-0">
                <StatusControl />
              </div>
            </div>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
