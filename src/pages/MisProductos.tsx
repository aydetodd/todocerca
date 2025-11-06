import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { MapPin, LogOut, ArrowLeft, User, ClipboardList } from 'lucide-react';
import ProductManagement from '@/components/ProductManagement';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';

export default function MisProductos() {
  const [profile, setProfile] = useState<any>(null);
  const [proveedorData, setProveedorData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();
  const { toast } = useToast();
  const { user, loading: authLoading, signOut } = useAuth();

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

      if (profileError) throw profileError;

      if (!profileData || profileData.role !== 'proveedor') {
        toast({
          title: "Acceso denegado",
          description: "Solo los proveedores pueden acceder a esta sección",
          variant: "destructive",
        });
        navigate("/dashboard");
        return;
      }

      setProfile(profileData);

      // Obtener datos de proveedor
      const { data: provData, error: provError } = await supabase
        .from('proveedores')
        .select('*')
        .eq('user_id', user.id)
        .maybeSingle();

      if (provError) {
        console.error('Error obteniendo datos de proveedor:', provError);
      } else {
        setProveedorData(provData);
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

  if (!proveedorData) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <p className="text-muted-foreground">No se encontraron datos de proveedor</p>
          <Button className="mt-4" onClick={() => navigate("/dashboard")}>
            Volver al Dashboard
          </Button>
        </div>
      </div>
    );
  }

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
              <Badge variant="default">Proveedor</Badge>
              <Button variant="outline" size="sm" onClick={() => navigate('/dashboard')}>
                <ArrowLeft className="h-4 w-4 mr-2" />
                Dashboard
              </Button>
              <Button variant="outline" size="sm" onClick={() => navigate('/mi-perfil')}>
                <User className="h-4 w-4 mr-2" />
                Perfil
              </Button>
              <Button variant="outline" size="sm" onClick={() => navigate('/gestion-pedidos')}>
                <ClipboardList className="h-4 w-4 mr-2" />
                Pedidos
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
          <h2 className="text-3xl font-bold text-foreground mb-2">Mis Productos</h2>
          <p className="text-muted-foreground">
            Gestiona tu catálogo de productos
          </p>
        </div>

        <ProductManagement proveedorId={proveedorData.id} />
      </main>
    </div>
  );
}
