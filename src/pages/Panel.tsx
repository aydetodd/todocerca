import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { 
  User, 
  Navigation, 
  Package, 
  ClipboardList, 
  Calendar, 
  Clock,
  Car,
  LogOut,
  ArrowLeft,
  Briefcase,
  Trash2,
  FileText
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { StatusControl } from '@/components/StatusControl';
import QRCodeGenerator from '@/components/QRCodeGenerator';
import ProductManagement from '@/components/ProductManagement';
import { OrdersManagement } from '@/components/OrdersManagement';
import { ProviderAppointments } from '@/components/ProviderAppointments';
import { ScheduleConfiguration } from '@/components/ScheduleConfiguration';
import TaxiDriverRequests from '@/components/TaxiDriverRequests';
import { Link } from 'react-router-dom';
import UserRegistryReport from '@/components/UserRegistryReport';

type TabType = 'perfil' | 'tracking' | 'productos' | 'apartados' | 'citas' | 'horarios' | 'taxi';

export default function Panel() {
  const [profile, setProfile] = useState<any>(null);
  const [userSpecificData, setUserSpecificData] = useState<any>(null);
  const [isProvider, setIsProvider] = useState(false);
  const [showTaxiTab, setShowTaxiTab] = useState(false);
  const [loading, setLoading] = useState(true);
  const [upgrading, setUpgrading] = useState(false);
  const [activeTab, setActiveTab] = useState<TabType>('perfil');
  const [clickSequence, setClickSequence] = useState<string[]>([]);
  const [showReport, setShowReport] = useState(false);
  const navigate = useNavigate();
  const { user, loading: authLoading, signOut } = useAuth();
  const { toast } = useToast();

  // Format user ID with 6 digits and role suffix
  const formatUserId = (consecutiveNumber: number, role: string) => {
    const paddedNumber = String(consecutiveNumber).padStart(6, '0');
    const suffix = role === 'proveedor' ? 'p' : 'c';
    return `${paddedNumber}${suffix}`;
  };

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
      const { data: profileData, error: profileError } = await supabase
        .from('profiles')
        .select('*')
        .eq('user_id', user?.id)
        .maybeSingle();

      if (profileError) throw profileError;
      setProfile(profileData);
      setIsProvider(profileData?.role === 'proveedor');

      // Mostrar pestaña Taxi si el proveedor es taxi
      if (profileData?.role === 'proveedor') {
        const isTaxiByProfile = profileData.provider_type === 'taxi';
        if (isTaxiByProfile) {
          setShowTaxiTab(true);
        } else {
          const { data: anyTaxi, error: anyTaxiError } = await supabase
            .from('taxi_requests')
            .select('id')
            .eq('driver_id', user?.id)
            .limit(1);
          setShowTaxiTab(!anyTaxiError && !!anyTaxi && anyTaxi.length > 0);
        }

        // Obtener datos de proveedor
        const { data: proveedorData, error: proveedorError } = await supabase
          .from('proveedores')
          .select('*')
          .eq('user_id', user?.id)
          .maybeSingle();

        if (!proveedorError) {
          setUserSpecificData(proveedorData);
        }
      } else {
        // Cliente
        const { data: clienteData, error: clienteError } = await supabase
          .from('clientes')
          .select('*')
          .eq('user_id', user?.id)
          .maybeSingle();

        if (!clienteError) {
          setUserSpecificData(clienteData);
        }
      }
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

  async function handleUpgradeToProvider() {
    try {
      setUpgrading(true);
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        throw new Error('No estás autenticado');
      }

      const { data, error } = await supabase.functions.invoke('upgrade-to-provider', {
        headers: {
          Authorization: `Bearer ${session.access_token}`
        }
      });
      
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

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    );
  }

  // Define menu items
  const menuItems: { id: TabType; icon: any; title: string; providerOnly?: boolean; taxiOnly?: boolean }[] = [
    { id: 'perfil', icon: User, title: 'Perfil' },
    { id: 'tracking', icon: Navigation, title: 'GPS' },
    { id: 'productos', icon: Package, title: 'Productos', providerOnly: true },
    { id: 'apartados', icon: ClipboardList, title: 'Apartados', providerOnly: true },
    { id: 'citas', icon: Calendar, title: 'Citas', providerOnly: true },
    { id: 'horarios', icon: Clock, title: 'Horarios', providerOnly: true },
    { id: 'taxi', icon: Car, title: 'Taxi', taxiOnly: true },
  ];

  const filteredItems = menuItems.filter(item => {
    if (item.taxiOnly) return showTaxiTab;
    if (item.providerOnly) return isProvider;
    return true;
  });

  // Easter egg handler para "MPMP"
  const handleSecretClick = (letter: string) => {
    const newSequence = [...clickSequence, letter];
    
    if (newSequence.join('') === 'MPMP') {
      setShowReport(true);
      setClickSequence([]);
    } else if ('MPMP'.startsWith(newSequence.join(''))) {
      setClickSequence(newSequence);
    } else {
      setClickSequence([]);
    }
  };

  // Render content based on active tab
  const renderContent = () => {
    switch (activeTab) {
      case 'perfil':
        return (
          <div className="space-y-4">
            <h2 className="text-xl font-bold">
              <span onClick={() => handleSecretClick('M')} className="cursor-default">M</span>
              <span>i </span>
              <span onClick={() => handleSecretClick('P')} className="cursor-default">P</span>
              <span>erfil</span>
            </h2>
            <p className="text-sm text-muted-foreground">Información de tu cuenta y estado</p>
            
            <div className="space-y-3">
              {profile?.consecutive_number && (
                <div>
                  <span className="text-sm font-medium">ID Usuario:</span>
                  <p className="text-sm font-mono font-bold text-primary">
                    {formatUserId(profile.consecutive_number, profile.role)}
                  </p>
                </div>
              )}
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
                  <p className="text-xs text-muted-foreground text-center mt-1">
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
              
              {/* Account Actions */}
              <div className="pt-4 border-t space-y-3">
                {/* Botón admin para ver reporte de usuarios (solo ID 000001p) */}
                {profile?.consecutive_number === 1 && (
                  <Button
                    onClick={() => setShowReport(true)}
                    variant="outline"
                    className="w-full"
                  >
                    <FileText className="h-4 w-4 mr-2" />
                    Ver Reporte de Usuarios
                  </Button>
                )}
                
                <Button
                  onClick={handleSignOut}
                  variant="outline"
                  className="w-full"
                >
                  <LogOut className="h-4 w-4 mr-2" />
                  Cerrar Sesión
                </Button>
                
                <Link to="/eliminar-cuenta" className="block">
                  <Button
                    variant="ghost"
                    className="w-full text-destructive hover:text-destructive hover:bg-destructive/10"
                  >
                    <Trash2 className="h-4 w-4 mr-2" />
                    Eliminar mi cuenta
                  </Button>
                </Link>
              </div>
            </div>
          </div>
        );
      
      case 'tracking':
        return (
          <div className="space-y-4">
            <h2 className="text-xl font-bold">Tracking GPS</h2>
            <p className="text-sm text-muted-foreground">Rastreo familiar de dispositivos</p>
            <Button className="w-full" onClick={() => navigate('/tracking-gps')}>
              <Navigation className="h-4 w-4 mr-2" />
              Abrir Tracking GPS
            </Button>
          </div>
        );
      
      case 'productos':
        return userSpecificData?.id ? (
          <ProductManagement proveedorId={userSpecificData.id} />
        ) : (
          <p className="text-muted-foreground">Cargando productos...</p>
        );
      
      case 'apartados':
        return userSpecificData?.id ? (
          <OrdersManagement 
            proveedorId={userSpecificData.id} 
            proveedorNombre={userSpecificData.nombre || profile.nombre}
          />
        ) : (
          <p className="text-muted-foreground">Cargando apartados...</p>
        );
      
      case 'citas':
        return userSpecificData?.id ? (
          <ProviderAppointments proveedorId={userSpecificData.id} />
        ) : (
          <p className="text-muted-foreground">Cargando citas...</p>
        );
      
      case 'horarios':
        return userSpecificData?.id ? (
          <ScheduleConfiguration proveedorId={userSpecificData.id} />
        ) : (
          <p className="text-muted-foreground">Cargando horarios...</p>
        );
      
      case 'taxi':
        return <TaxiDriverRequests />;
      
      default:
        return null;
    }
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header con semáforo */}
      <header className="bg-card border-b border-border sticky top-0 z-10">
        <div className="px-4 py-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => navigate('/home')}
            >
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div>
              <h1 className="text-lg font-bold text-foreground">Panel</h1>
              <p className="text-xs text-muted-foreground">
                Hola, {profile?.nombre || 'Usuario'}
              </p>
            </div>
          </div>
          
          {/* Semáforo en header */}
          {isProvider && <StatusControl />}
        </div>
      </header>

      {/* Main Layout: Sidebar + Content */}
      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar de iconos vertical */}
        <aside className="w-16 bg-card border-r border-border flex flex-col items-center py-4 gap-2 overflow-y-auto">
          {filteredItems.map((item) => (
            <Button
              key={item.id}
              variant={activeTab === item.id ? 'default' : 'ghost'}
              size="icon"
              className={`w-12 h-12 flex-shrink-0 ${activeTab === item.id ? '' : 'hover:bg-muted'}`}
              onClick={() => setActiveTab(item.id)}
              title={item.title}
            >
              <item.icon className="h-5 w-5" />
            </Button>
          ))}
        </aside>

        {/* Contenido principal */}
        <main className="flex-1 overflow-y-auto p-4">
          {renderContent()}
        </main>
      </div>
      
      {/* Reporte de usuarios registrados (easter egg) */}
      <UserRegistryReport open={showReport} onOpenChange={setShowReport} />
    </div>
  );
}
