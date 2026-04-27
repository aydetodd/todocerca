import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate, useLocation } from "react-router-dom";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import {
  Building2,
  Bus,
  Calendar,
  Car,
  Clock,
  CreditCard,
  LogOut,
  Map as MapIcon,
  MapPin,
  Package,
  ShoppingCart,
  User,
  Briefcase,
  Trash2,
} from "lucide-react";
import ProductManagement from "@/components/ProductManagement";
import PrivateRouteManagement from "@/components/PrivateRouteManagement";
import { StatusControl } from "@/components/StatusControl";
import QRCodeGenerator from "@/components/QRCodeGenerator";
import { OrdersManagement } from "@/components/OrdersManagement";
import { ScheduleConfiguration } from "@/components/ScheduleConfiguration";
import { ProviderAppointments } from "@/components/ProviderAppointments";
import TaxiDriverRequests from "@/components/TaxiDriverRequests";
import SubscriptionUpgrade from "@/components/SubscriptionUpgrade";
import { useDashboardBadges } from "@/hooks/useDashboardBadges";
import { Input } from "@/components/ui/input";
import { PhoneInput } from "@/components/ui/phone-input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

type DashboardSection =
  | "perfil"
  | "suscripcion"
  | "tracking"
  | "productos"
  | "rutas_privadas"
  | "apartados"
  | "citas"
  | "horarios"
  | "taxi"
  | "empresa";

const Dashboard = () => {
  const [profile, setProfile] = useState<any>(null);
  const [userSpecificData, setUserSpecificData] = useState<any>(null);
  const [subscriptionInfo, setSubscriptionInfo] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [showTaxiTab, setShowTaxiTab] = useState(false);
  const [upgrading, setUpgrading] = useState(false);
  const [empresaTransporte, setEmpresaTransporte] = useState<any>(null);
  const [registrandoEmpresa, setRegistrandoEmpresa] = useState(false);
  const [empresaForm, setEmpresaForm] = useState({ nombre: '', rfc: '', contacto_nombre: '', contacto_telefono: '', contacto_email: '' });
  const [registrandoConcesionario, setRegistrandoConcesionario] = useState(false);
  const [concesionarioForm, setConcesionarioForm] = useState({ nombre: '', telefono: '', direccion: '', descripcion: '' });
  const [activeSection, setActiveSection] = useState<DashboardSection>(() => {
    const params = new URLSearchParams(window.location.search);
    const section = params.get('section');
    if (section && ['perfil','suscripcion','tracking','productos','rutas_privadas','apartados','citas','horarios','taxi','empresa'].includes(section)) {
      return section as DashboardSection;
    }
    return 'perfil';
  });

  const navigate = useNavigate();
  const location = useLocation();

  // React to ?section= param changes from navigation bar
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const section = params.get('section');
    if (section && ['perfil','suscripcion','tracking','productos','rutas_privadas','apartados','citas','horarios','taxi','empresa'].includes(section)) {
      setActiveSection(section as DashboardSection);
      // Clean URL
      window.history.replaceState({}, '', '/dashboard');
    }
  }, [location.search]);
  const { toast } = useToast();
  const { user, loading: authLoading, signOut } = useAuth();

  // Format user ID with 6 digits and role suffix
  const formatUserId = (consecutiveNumber: number, role: string) => {
    const paddedNumber = String(consecutiveNumber).padStart(6, "0");
    const suffix = role === "proveedor" ? "p" : "c";
    return `${paddedNumber}${suffix}`;
  };

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      navigate("/auth", { replace: true });
      return;
    }
    getProfile();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, authLoading, navigate]);

  async function getProfile() {
    try {
      if (!user) return;

      // Obtener perfil
      const { data: profileData, error: profileError } = await supabase
        .from("profiles")
        .select("*")
        .eq("user_id", user.id)
        .maybeSingle();

      if (profileError) {
        console.error("Error obteniendo perfil:", profileError);
        throw profileError;
      }

      if (!profileData) {
        console.warn("No se encontró perfil para el usuario");
        setProfile(null);
        setLoading(false);
        return;
      }

      setProfile(profileData);

      // Mostrar pestaña Taxi si el proveedor es taxi o si ya tiene solicitudes asignadas
      if (profileData.role === "proveedor") {
        const isTaxiByProfile = profileData.provider_type === "taxi";

        if (isTaxiByProfile) {
          setShowTaxiTab(true);
        } else {
          const { data: anyTaxi, error: anyTaxiError } = await supabase
            .from("taxi_requests")
            .select("id")
            .eq("driver_id", user.id)
            .limit(1);

          setShowTaxiTab(!anyTaxiError && !!anyTaxi && anyTaxi.length > 0);
        }
      } else {
        setShowTaxiTab(false);
      }

      // Obtener datos específicos según el rol
      if (profileData.role === "cliente") {
        const { data: clienteData, error: clienteError } = await supabase
          .from("clientes")
          .select("*")
          .eq("user_id", user.id)
          .maybeSingle();

        if (clienteError) {
          console.error("Error obteniendo datos de cliente:", clienteError);
        } else {
          setUserSpecificData(clienteData);
        }
      } else if (profileData.role === "proveedor") {
        const { data: proveedorData, error: proveedorError } = await supabase
          .from("proveedores")
          .select("*")
          .eq("user_id", user.id)
          .maybeSingle();

        if (proveedorError) {
          console.error("Error obteniendo datos de proveedor:", proveedorError);
        } else {
          setUserSpecificData(proveedorData);
        }

        // Fetch subscription info for providers
        await fetchSubscriptionInfo();
      }

      // Check empresa de transporte for any user
      const { data: empresaData } = await supabase
        .from('empresas_transporte')
        .select('*')
        .eq('user_id', user.id)
        .eq('is_active', true)
        .maybeSingle();
      setEmpresaTransporte(empresaData);
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

  async function fetchSubscriptionInfo() {
    try {
      const { data, error } = await supabase.functions.invoke("check-subscription");
      if (error) {
        console.error("Error checking subscription:", error);
        return;
      }
      setSubscriptionInfo(data);
    } catch (error) {
      console.error("Error fetching subscription:", error);
    }
  }

  async function handleSignOut() {
    await signOut();
    navigate("/");
  }

  async function handleUpgradeToProvider() {
    try {
      setUpgrading(true);
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("No estás autenticado");

      const { data, error } = await supabase.functions.invoke("upgrade-to-provider", {
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
      });

      if (error) throw error;

      if (data?.url) {
        window.open(data.url, "_blank");
        toast({
          title: "Redirigiendo",
          description: "Completa el pago para activar tu suscripción",
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

  async function handleRegistrarEmpresa() {
    if (!empresaForm.nombre.trim()) {
      toast({ title: 'Error', description: 'El nombre de la empresa es obligatorio', variant: 'destructive' });
      return;
    }
    try {
      setRegistrandoEmpresa(true);
      const { data, error } = await supabase
        .from('empresas_transporte')
        .insert({
          user_id: user!.id,
          nombre: empresaForm.nombre.trim(),
          rfc: empresaForm.rfc.trim() || null,
          contacto_nombre: empresaForm.contacto_nombre.trim() || null,
          contacto_telefono: empresaForm.contacto_telefono.trim() || null,
          contacto_email: empresaForm.contacto_email.trim() || null,
        })
        .select()
        .single();
      if (error) throw error;
      setEmpresaTransporte(data);
      toast({ title: 'Empresa registrada', description: 'Tu empresa ha sido registrada exitosamente' });
    } catch (error: any) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    } finally {
      setRegistrandoEmpresa(false);
    }
  }

  async function handleRegistrarConcesionario() {
    if (!concesionarioForm.nombre.trim() || !concesionarioForm.telefono.trim()) {
      toast({ title: 'Error', description: 'Nombre y teléfono son obligatorios', variant: 'destructive' });
      return;
    }

    try {
      setRegistrandoConcesionario(true);
      const { data: existingProvider } = await supabase
        .from('proveedores')
        .select('id')
        .eq('user_id', user!.id)
        .maybeSingle();

      const providerPayload = {
        user_id: user!.id,
        nombre: concesionarioForm.nombre.trim(),
        email: user?.email || '',
        telefono: concesionarioForm.telefono.trim(),
        business_address: concesionarioForm.direccion.trim() || null,
        description: concesionarioForm.descripcion.trim() || 'Concesionario de transporte',
      };

      const { data: proveedorData, error: proveedorError } = existingProvider
        ? await supabase.from('proveedores').update(providerPayload).eq('user_id', user!.id).select().single()
        : await supabase.from('proveedores').insert(providerPayload).select().single();
      if (proveedorError) throw proveedorError;

      const { error: profileError } = await supabase
        .from('profiles')
        .update({ role: 'proveedor', provider_type: null, route_name: null })
        .eq('user_id', user!.id);
      if (profileError) throw profileError;

      setProfile((prev: any) => ({ ...prev, role: 'proveedor', provider_type: null, route_name: null }));
      setUserSpecificData(proveedorData);
      toast({ title: 'Concesionario registrado', description: 'Ya puedes registrar y suscribir tus unidades por $400 MXN al año.' });
      navigate('/panel-concesionario');
    } catch (error: any) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    } finally {
      setRegistrandoConcesionario(false);
    }
  }

  const isProvider = profile?.role === "proveedor";
  const showTaxi = isProvider && showTaxiTab;

  const badges = useDashboardBadges(
    userSpecificData?.id || null,
    user?.id || null,
    showTaxi
  );

  // Map section keys to badge counts
  const badgeMap: Record<string, number> = {
    apartados: badges.apartados,
    citas: badges.citas,
    taxi: badges.taxi,
  };
  const navItems = useMemo(
    () =>
      [
        { key: "perfil" as const, label: "Perfil", icon: User, visible: true },
        // Protocolo 1: Suscripción de bienes/servicios oculta (transportes tienen su propia suscripción)
        // {
        //   key: "suscripcion" as const,
        //   label: "Suscripción",
        //   icon: CreditCard,
        //   visible: isProvider,
        // },
        {
          key: "tracking" as const,
          label: "Tracking GPS",
          icon: MapIcon,
          visible: true,
        },
        // Protocolo 1: Productos ocultos
        // { key: "productos" as const, label: "Productos", icon: Package, visible: isProvider },
        {
          key: "rutas_privadas" as const,
          label: isProvider ? "Transporte" : "Registrarme como Concesionario",
          icon: Bus,
          visible: true,
        },
        {
          key: "empresa" as const,
          label: "Empresa Transporte",
          icon: Building2,
          visible: true,
        },
        // Protocolo 1: Apartados, Citas y Horarios ocultos
        // { key: "apartados" as const, label: "Apartados", icon: ShoppingCart, visible: isProvider },
        // { key: "citas" as const, label: "Citas", icon: Calendar, visible: isProvider },
        // { key: "horarios" as const, label: "Horarios", icon: Clock, visible: isProvider },
        // Protocolo 2: Taxi oculto
        // {
        //   key: "taxi" as const,
        //   label: "Taxista",
        //   icon: Car,
        //   visible: showTaxi,
        // },
      ].filter((i) => i.visible),
    [isProvider, showTaxi]
  );

  // Si el usuario cambia de rol (o se oculta Taxi), asegurar que la sección activa exista
  useEffect(() => {
    if (!navItems.some((i) => i.key === activeSection)) {
      setActiveSection(navItems[0]?.key ?? "perfil");
    }
  }, [navItems, activeSection]);

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-primary mx-auto" />
          <p className="mt-4 text-muted-foreground">Cargando...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div className="flex items-center space-x-2">
              <MapPin className="h-8 w-8 text-primary" />
              <h1 className="text-2xl font-bold text-foreground">TodoCerca</h1>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              {/* Semáforo arriba */}
              <StatusControl />

              <Badge variant={isProvider ? "default" : "secondary"}>
                {isProvider ? "Proveedor" : "Cliente"}
              </Badge>

              <Button variant="outline" size="sm" onClick={handleSignOut}>
                <LogOut className="h-4 w-4 mr-2" />
                Cerrar Sesión
              </Button>
            </div>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-6 pb-24">
        <div className="mb-4">
          <h2 className="text-3xl font-bold text-foreground mb-2">
            ¡Bienvenido, {profile?.nombre}!
          </h2>
          <p className="text-muted-foreground">
            {isProvider
              ? "Gestiona tu negocio desde el panel"
              : "Gestiona tu cuenta y tus herramientas"}
          </p>
        </div>

        <div className="flex gap-4">
          {/* Sidebar de iconos (siempre visible) */}
          <aside className="w-14 shrink-0">
            <nav className="sticky top-4 flex flex-col items-center gap-2">
              {navItems.map((item) => {
                const Icon = item.icon;
                const isActive = activeSection === item.key;
                const badgeCount = badgeMap[item.key] || 0;
                return (
                  <div key={item.key} className="relative">
                    <Button
                      size="icon"
                      variant={isActive ? "default" : "ghost"}
                      onClick={() => setActiveSection(item.key)}
                      aria-label={item.label}
                      title={item.label}
                      className="h-11 w-11"
                    >
                      <Icon className="h-5 w-5" />
                    </Button>
                    {badgeCount > 0 && (
                      <span className="absolute -top-1 -right-1 flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-destructive text-[10px] font-bold text-destructive-foreground px-1">
                        {badgeCount > 99 ? '99+' : badgeCount}
                      </span>
                    )}
                  </div>
                );
              })}
            </nav>
          </aside>

          {/* Contenido */}
          <section className="flex-1 min-w-0">
            {activeSection === "perfil" && (
              <Card>
                <CardHeader>
                  <CardTitle>Mi Perfil</CardTitle>
                  <CardDescription>Información de tu cuenta</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
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
                        <p className="text-sm text-muted-foreground">
                          {userSpecificData.telefono}
                        </p>
                      </div>
                    )}

                    {userSpecificData?.codigo_postal && (
                      <div>
                        <span className="text-sm font-medium">Código Postal:</span>
                        <p className="text-sm text-muted-foreground">
                          {userSpecificData.codigo_postal}
                        </p>
                      </div>
                    )}

                    {isProvider && userSpecificData?.id && (
                      <div className="pt-4">
                        <QRCodeGenerator
                          proveedorId={userSpecificData.id}
                          businessName={userSpecificData.nombre || profile.nombre}
                        />
                      </div>
                    )}

                    {/* Acciones de cuenta */}
                    <div className="pt-4 border-t space-y-3">
                      <Button
                        variant="ghost"
                        className="w-full text-destructive hover:text-destructive hover:bg-destructive/10"
                        onClick={() => navigate("/eliminar-cuenta")}
                      >
                        <Trash2 className="h-4 w-4 mr-2" />
                        Eliminar mi cuenta
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            {activeSection === "suscripcion" && isProvider && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <CreditCard className="h-5 w-5" />
                    Mi Suscripción
                  </CardTitle>
                  <CardDescription>
                    Administra tu plan y actualiza a un plan superior
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <SubscriptionUpgrade 
                    currentPlanType={subscriptionInfo?.plan_type || 'basico'}
                    onUpgradeComplete={() => fetchSubscriptionInfo()}
                  />
                </CardContent>
              </Card>
            )}

            {activeSection === "tracking" && (
              <Card>
                <CardHeader>
                  <CardTitle>Tracking GPS</CardTitle>
                  <CardDescription>
                    Administra tu grupo y ve ubicaciones en tiempo real
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  <Button onClick={() => navigate("/tracking-gps")}>Abrir Tracking GPS</Button>
                  <p className="text-sm text-muted-foreground">
                    (Se abre en una pantalla completa para ver el mapa y las opciones.)
                  </p>
                </CardContent>
              </Card>
            )}

            {activeSection === "productos" && (
              <div>
                {isProvider && userSpecificData?.id ? (
                  <ProductManagement proveedorId={userSpecificData.id} />
                ) : (
                  <Card>
                    <CardHeader>
                      <CardTitle>Productos</CardTitle>
                      <CardDescription>No se encontraron datos de proveedor.</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <Button onClick={() => getProfile()}>Recargar</Button>
                    </CardContent>
                  </Card>
                )}
              </div>
            )}

            {activeSection === "rutas_privadas" && (
              isProvider ? (
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Bus className="h-5 w-5" />
                      Transporte
                    </CardTitle>
                    <CardDescription>
                      Gestiona tus unidades, rutas y suscripciones ($400 MXN/año por unidad)
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    <Button onClick={() => navigate('/panel-concesionario')} className="w-full">
                      <Bus className="h-4 w-4 mr-2" />
                      Abrir Panel Concesionario
                    </Button>
                    <Button onClick={() => navigate('/mis-rutas')} variant="outline" className="w-full">
                      Gestión de Rutas
                    </Button>
                  </CardContent>
                </Card>
              ) : (
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Bus className="h-5 w-5 text-primary" />
                      Registrarme como Concesionario de Transporte
                    </CardTitle>
                    <CardDescription>
                      Registra tu concesionaria para dar de alta unidades. Cada unidad se suscribe por $400 MXN al año.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="concesionario-nombre">Nombre del concesionario *</Label>
                      <Input
                        id="concesionario-nombre"
                        placeholder="Ej: Transportes Villa"
                        value={concesionarioForm.nombre}
                        onChange={(e) => setConcesionarioForm(prev => ({ ...prev, nombre: e.target.value }))}
                      />
                    </div>
                    <div className="space-y-2">
                      <PhoneInput
                        id="concesionario-telefono"
                        label="Teléfono"
                        required
                        value={concesionarioForm.telefono}
                        onChange={(value) => setConcesionarioForm(prev => ({ ...prev, telefono: value }))}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="concesionario-direccion">Dirección</Label>
                      <Input
                        id="concesionario-direccion"
                        placeholder="Base, oficina o domicilio fiscal"
                        value={concesionarioForm.direccion}
                        onChange={(e) => setConcesionarioForm(prev => ({ ...prev, direccion: e.target.value }))}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="concesionario-descripcion">Descripción</Label>
                      <Textarea
                        id="concesionario-descripcion"
                        placeholder="Servicio urbano, foráneo o privado"
                        value={concesionarioForm.descripcion}
                        onChange={(e) => setConcesionarioForm(prev => ({ ...prev, descripcion: e.target.value }))}
                        rows={2}
                      />
                    </div>
                    <Button
                      onClick={handleRegistrarConcesionario}
                      disabled={registrandoConcesionario || !concesionarioForm.nombre.trim() || !concesionarioForm.telefono.trim()}
                      className="w-full"
                    >
                      <Bus className="h-4 w-4 mr-2" />
                      {registrandoConcesionario ? 'Registrando...' : 'Registrarme como Concesionario'}
                    </Button>
                  </CardContent>
                </Card>
              )
            )}

            {activeSection === "apartados" && (
              <div>
                {isProvider && userSpecificData?.id ? (
                  <OrdersManagement
                    proveedorId={userSpecificData.id}
                    proveedorNombre={userSpecificData.nombre || profile.nombre}
                  />
                ) : (
                  <Card>
                    <CardHeader>
                      <CardTitle>Apartados</CardTitle>
                      <CardDescription>No se encontraron datos de proveedor.</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <Button onClick={() => getProfile()}>Recargar</Button>
                    </CardContent>
                  </Card>
                )}
              </div>
            )}

            {activeSection === "citas" && (
              <div>
                {isProvider && userSpecificData?.id ? (
                  <ProviderAppointments proveedorId={userSpecificData.id} />
                ) : (
                  <Card>
                    <CardHeader>
                      <CardTitle>Citas</CardTitle>
                      <CardDescription>No se encontraron datos de proveedor.</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <Button onClick={() => getProfile()}>Recargar</Button>
                    </CardContent>
                  </Card>
                )}
              </div>
            )}

            {activeSection === "horarios" && (
              <div>
                {isProvider && userSpecificData?.id ? (
                  <ScheduleConfiguration proveedorId={userSpecificData.id} />
                ) : (
                  <Card>
                    <CardHeader>
                      <CardTitle>Horarios</CardTitle>
                      <CardDescription>No se encontraron datos de proveedor.</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <Button onClick={() => getProfile()}>Recargar</Button>
                    </CardContent>
                  </Card>
                )}
              </div>
            )}

            {activeSection === "taxi" && (
              <div>
                {showTaxi ? (
                  <TaxiDriverRequests />
                ) : (
                  <Card>
                    <CardHeader>
                      <CardTitle>Taxista</CardTitle>
                      <CardDescription>
                        Esta sección solo aparece para proveedores taxi.
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <Button onClick={() => getProfile()}>Recargar</Button>
                    </CardContent>
                  </Card>
                )}
              </div>
            )}

            {activeSection === "empresa" && (
              <div>
                {empresaTransporte ? (
                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2">
                        <Building2 className="h-5 w-5" />
                        {empresaTransporte.nombre}
                      </CardTitle>
                      <CardDescription>
                        Tu empresa está registrada. Gestiona empleados, contratos y reportes.
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <Button onClick={() => navigate('/panel-maquiladora')} className="w-full">
                        <Building2 className="h-4 w-4 mr-2" />
                        Abrir Panel Empresa
                      </Button>
                    </CardContent>
                  </Card>
                ) : (
                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2">
                        <Building2 className="h-5 w-5" />
                        Registrar Empresa de Transporte
                      </CardTitle>
                      <CardDescription>
                        Registra tu empresa o maquiladora para gestionar el transporte de personal con control por pasajero mediante QR.
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="space-y-2">
                        <Label htmlFor="empresa-nombre">Nombre de la empresa *</Label>
                        <Input
                          id="empresa-nombre"
                          placeholder="Ej: Maquiladora ABC S.A. de C.V."
                          value={empresaForm.nombre}
                          onChange={(e) => setEmpresaForm(prev => ({ ...prev, nombre: e.target.value }))}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="empresa-rfc">RFC (opcional)</Label>
                        <Input
                          id="empresa-rfc"
                          placeholder="Ej: MAB123456ABC"
                          value={empresaForm.rfc}
                          onChange={(e) => setEmpresaForm(prev => ({ ...prev, rfc: e.target.value }))}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="empresa-contacto">Nombre de contacto</Label>
                        <Input
                          id="empresa-contacto"
                          placeholder="Nombre del responsable"
                          value={empresaForm.contacto_nombre}
                          onChange={(e) => setEmpresaForm(prev => ({ ...prev, contacto_nombre: e.target.value }))}
                        />
                      </div>
                      <div className="space-y-2">
                        <PhoneInput
                          id="empresa-tel"
                          label="Teléfono de contacto"
                          value={empresaForm.contacto_telefono}
                          onChange={(value) => setEmpresaForm(prev => ({ ...prev, contacto_telefono: value }))}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="empresa-email">Email de contacto</Label>
                        <Input
                          id="empresa-email"
                          type="email"
                          placeholder="contacto@empresa.com"
                          value={empresaForm.contacto_email}
                          onChange={(e) => setEmpresaForm(prev => ({ ...prev, contacto_email: e.target.value }))}
                        />
                      </div>
                      <Button
                        onClick={handleRegistrarEmpresa}
                        disabled={registrandoEmpresa || !empresaForm.nombre.trim()}
                        className="w-full"
                      >
                        {registrandoEmpresa ? 'Registrando...' : 'Registrar Empresa'}
                      </Button>
                    </CardContent>
                  </Card>
                )}
              </div>
            )}
          </section>
        </div>
      </main>
    </div>
  );
};

export default Dashboard;
