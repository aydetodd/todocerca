import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { MapPin, LogOut, Package, Users, ShoppingCart, Search } from "lucide-react";
import ProductManagement from "@/components/ProductManagement";
import { StatusControl } from "@/components/StatusControl";
import QRCodeGenerator from "@/components/QRCodeGenerator";
import { OrdersManagement } from "@/components/OrdersManagement";

const Dashboard = () => {
  const [profile, setProfile] = useState<any>(null);
  const [userSpecificData, setUserSpecificData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
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
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <MapPin className="h-8 w-8 text-primary" />
            <h1 className="text-2xl font-bold text-foreground">TodoCerca</h1>
          </div>
          <div className="flex items-center space-x-4">
            <Badge variant={isProvider ? "default" : "secondary"}>
              {isProvider ? "Proveedor" : "Cliente"}
            </Badge>
            <Button variant="outline" onClick={handleSignOut}>
              <LogOut className="h-4 w-4 mr-2" />
              Cerrar Sesión
            </Button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-4 py-8">
        <div className="mb-8 flex items-center justify-between">
          <div>
            <h2 className="text-3xl font-bold text-foreground mb-2">
              ¡Bienvenido, {profile?.nombre}!
            </h2>
            <p className="text-muted-foreground">
              {isProvider ? "Gestiona tu negocio y productos" : "Explora productos y servicios cerca de ti"}
            </p>
          </div>
          <Button size="lg" onClick={() => navigate("/search")}>
            <Search className="h-4 w-4 mr-2" />
            Buscar Productos
          </Button>
        </div>

        <div className="grid gap-6 md:grid-cols-2">
          {/* Explorar - Available for all users */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <Search className="h-5 w-5" />
                <span>Buscar</span>
              </CardTitle>
              <CardDescription>Encuentra productos y servicios cerca de ti</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                <Button className="w-full" onClick={() => navigate("/search")}>
                  <Search className="h-4 w-4 mr-2" />
                  Buscar Productos
                </Button>
                <Button variant="outline" className="w-full" onClick={() => navigate("/search?category=servicios")}>
                  Buscar Servicios
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Mi Perfil */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <Users className="h-5 w-5" />
                <span>Mi Perfil</span>
              </CardTitle>
              <CardDescription>Información de tu cuenta y estado</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex items-start gap-4">
                <div className="flex-1 space-y-2">
                  {profile?.consecutive_number && (
                    <div>
                      <span className="text-sm font-medium">ID Usuario:</span>
                      <p className="text-sm font-mono font-bold text-primary">
                        {formatUserId(profile.consecutive_number, profile.role)}
                      </p>
                    </div>
                  )}
                  <div>
                    <span className="text-sm font-medium">Email:</span>
                    <p className="text-sm text-muted-foreground">{user?.email}</p>
                  </div>
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
                  
                  {/* QR Code Generator for Providers */}
                  {isProvider && userSpecificData?.id && (
                    <div className="pt-4">
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
        </div>

        {/* Product Management for Providers */}
        {isProvider && userSpecificData?.id && (
          <div className="mt-8 space-y-8">
            <ProductManagement proveedorId={userSpecificData.id} />
            <OrdersManagement proveedorId={userSpecificData.id} />
          </div>
        )}
      </main>
    </div>
  );
};

export default Dashboard;