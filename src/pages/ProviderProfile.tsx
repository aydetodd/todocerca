import { useEffect, useState } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Package, ArrowLeft, Plus, Users, ShoppingCart, X, CalendarCheck } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
import { useShoppingCart } from '@/hooks/useShoppingCart';
import { ShoppingCart as ShoppingCartComponent } from '@/components/ShoppingCart';
import { formatCurrency } from '@/lib/utils';
import { useRealtimeMessages } from '@/hooks/useRealtimeMessages';
import { ProductCard } from '@/components/ProductCard';
import { NavigationBar } from '@/components/NavigationBar';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { Badge } from '@/components/ui/badge';
import { AppointmentBooking } from '@/components/AppointmentBooking';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';

interface Product {
  id: string;
  nombre: string;
  precio: number;
  descripcion: string;
  unit: string;
  stock: number;
  is_available: boolean;
}

interface ProviderData {
  id: string;
  nombre: string;
  email: string;
  telefono: string;
  business_phone: string;
  business_address: string;
  description: string;
  latitude: number;
  longitude: number;
  user_id: string;
}

const ProviderProfile = () => {
  const { proveedorId, consecutiveNumber } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { user, loading: authLoading } = useAuth();
  const { sendMessage } = useRealtimeMessages();
  const [provider, setProvider] = useState<ProviderData | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCheckoutDialog, setShowCheckoutDialog] = useState(false);
  const [customerName, setCustomerName] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [userProfile, setUserProfile] = useState<any>(null);
  const [selectedPersonIndex, setSelectedPersonIndex] = useState(0);
  const [orderNumber, setOrderNumber] = useState<number | null>(null);
  const [invalidRoute, setInvalidRoute] = useState(false);
  const [isCartOpen, setIsCartOpen] = useState(false);
  
  // Get action from URL params (pedido or cita)
  const actionParam = searchParams.get('action');
  const [activeTab, setActiveTab] = useState<string>(actionParam === 'cita' ? 'cita' : 'pedido');

  // Lista de rutas reservadas que no deben ser tratadas como slugs de proveedor
  const reservedRoutes = [
    'home', 'panel', 'auth', 'landing', 'dashboard', 'mi-perfil', 'mis-productos',
    'gestion-pedidos', 'mapa', 'tracking-gps', 'join-group', 'gps-reports',
    'search', 'mensajes', 'agregar-contacto', 'favoritos', 'donar', 'extraviados',
    'privacidad', 'eliminar-cuenta', 'proveedor', 'gps', 'transporte'
  ];

  // Verificar si es una ruta reservada
  useEffect(() => {
    if (consecutiveNumber && reservedRoutes.includes(consecutiveNumber.toLowerCase())) {
      console.log('Ruta reservada detectada:', consecutiveNumber);
      setInvalidRoute(true);
      setLoading(false);
      // Redirigir a la ruta correcta
      navigate(`/${consecutiveNumber}`, { replace: true });
      return;
    }
  }, [consecutiveNumber, navigate]);

  // Verificar autenticación al cargar
  useEffect(() => {
    if (invalidRoute) return;
    
    if (!authLoading && !user) {
      // Guardar la URL actual para redirigir después del login
      const currentPath = proveedorId ? `/proveedor/${proveedorId}` : window.location.pathname;
      localStorage.setItem('redirectAfterLogin', currentPath);
      toast({
        title: "Registro requerido",
        description: "Por favor regístrate o inicia sesión para hacer apartados",
      });
      navigate('/auth');
    }
  }, [authLoading, user, navigate, toast, proveedorId, invalidRoute]);

  const {
    cart,
    numPeople,
    addToCart,
    removeFromCart,
    updateQuantity,
    clearCart,
    getTotal,
    getItemCount,
    addPerson,
    removePerson,
  } = useShoppingCart();

  const handleAddPerson = () => {
    addPerson();
    setSelectedPersonIndex(numPeople); // Cambiar a la nueva persona
  };

  useEffect(() => {
    // No cargar si es ruta reservada
    if (invalidRoute) {
      return;
    }
    
    // Solo cargar datos si hay usuario
    if (authLoading) {
      return;
    }
    
    if (!user) {
      return; // El useEffect anterior ya maneja la redirección
    }
    
    loadProviderData();
    loadUserProfile();
  }, [proveedorId, consecutiveNumber, user, authLoading, invalidRoute]);

  const loadUserProfile = async () => {
    if (!user) return;
    
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('telefono')
        .eq('user_id', user.id)
        .maybeSingle();
      
      if (error) throw error;
      setUserProfile(data);
    } catch (error) {
      console.error('Error cargando perfil de usuario:', error);
    }
  };

  const loadProviderData = async () => {
    try {
      console.log('Params:', { proveedorId, consecutiveNumber });
      let actualProveedorId = proveedorId;

      // If consecutiveNumber is provided (business name slug), lookup by name
      if (consecutiveNumber) {
        console.log('Buscando por consecutiveNumber:', consecutiveNumber);
        
        // Función para crear slug (igual que en QRCodeGenerator)
        const createSlug = (name: string) => {
          return name
            .toLowerCase()
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .replace(/[^a-z0-9\s-]/g, '')
            .trim()
            .replace(/\s+/g, '-');
        };

        // Obtener todos los proveedores y buscar el que coincida con el slug
        const { data: proveedores, error: proveedorError } = await supabase
          .from('proveedores')
          .select('id, nombre');

        console.log('Proveedores encontrados:', proveedores);

        if (proveedorError || !proveedores) {
          console.error('Error buscando proveedores:', proveedorError);
          throw new Error('Proveedor no encontrado');
        }

        // Buscar el proveedor cuyo slug coincida
        const proveedorEncontrado = proveedores.find(
          p => createSlug(p.nombre) === consecutiveNumber
        );

        console.log('Proveedor encontrado:', proveedorEncontrado);

        if (!proveedorEncontrado) {
          throw new Error('Proveedor no encontrado');
        }

        actualProveedorId = proveedorEncontrado.id;
      }

      if (!actualProveedorId) {
        throw new Error('ID de proveedor no válido');
      }

      console.log('ID final del proveedor:', actualProveedorId);

      // Cargar datos del proveedor
      const { data: providerData, error: providerError } = await supabase
        .from('proveedores')
        .select('*')
        .eq('id', actualProveedorId)
        .maybeSingle();

      if (providerError) {
        console.error('Error cargando proveedor:', providerError);
        throw providerError;
      }
      
      if (!providerData) {
        throw new Error('Proveedor no encontrado');
      }
      
      // Si el proveedor no tiene teléfono, buscar en profiles como fallback
      let finalProviderData = { ...providerData };
      if (!providerData.telefono && !providerData.business_phone && providerData.user_id) {
        const { data: profileData } = await supabase
          .from('profiles')
          .select('telefono')
          .eq('user_id', providerData.user_id)
          .single();
        
        if (profileData?.telefono) {
          console.log('📱 Teléfono encontrado en profiles:', profileData.telefono);
          finalProviderData.telefono = profileData.telefono;
        }
      }
      
      setProvider(finalProviderData);

      // Cargar productos del proveedor
      const { data: productsData, error: productsError } = await supabase
        .from('productos')
        .select('*')
        .eq('proveedor_id', actualProveedorId)
        .eq('is_available', true)
        .order('nombre');

      if (productsError) throw productsError;
      setProducts(productsData || []);

    } catch (error: any) {
      console.error('Error cargando perfil:', error);
      toast({
        title: 'Error',
        description: 'No se pudo cargar el perfil del proveedor',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleCall = (phone: string) => {
    window.location.href = `tel:${phone}`;
  };

  const handleWhatsApp = (phone: string) => {
    const cleanPhone = phone.replace(/\D/g, '');
    window.open(`https://wa.me/${cleanPhone}`, '_blank');
  };

  const handleCheckout = () => {
    if (cart.length === 0) {
      toast({
        title: 'Carrito vacío',
        description: 'Agrega productos antes de enviar el apartado',
        variant: 'destructive',
      });
      return;
    }
    setShowCheckoutDialog(true);
  };

  const handleSubmitOrder = async () => {
    if (!customerName.trim()) {
      toast({
        title: 'Datos incompletos',
        description: 'Por favor ingresa tu nombre',
        variant: 'destructive',
      });
      return;
    }

    if (!provider) return;

    // Obtener el teléfono del perfil del usuario
    const customerPhone = userProfile?.telefono || '';

    setIsSubmitting(true);

    try {
      // Obtener el user_id del cliente si está autenticado
      const { data: { user } } = await supabase.auth.getUser();
      
      // Crear el pedido en la base de datos
      const { data: pedido, error: pedidoError } = await supabase
        .from('pedidos')
        .insert({
          proveedor_id: provider.id,
          cliente_nombre: customerName.trim(),
          cliente_telefono: customerPhone.trim(),
          cliente_user_id: user?.id || null,
          total: getTotal(),
          estado: 'pendiente',
        })
        .select()
        .single();

      if (pedidoError) throw pedidoError;

      // Crear los items del pedido
      const itemsToInsert = cart.map((item) => ({
        pedido_id: pedido.id,
        producto_id: item.id,
        cantidad: item.cantidad,
        precio_unitario: item.precio,
        subtotal: item.precio * item.cantidad,
        person_index: item.personIndex,
      }));

      const { error: itemsError } = await supabase
        .from('items_pedido')
        .insert(itemsToInsert);

      if (itemsError) throw itemsError;

      // Formatear mensaje del pedido para WhatsApp
      const message = formatOrderMessage(pedido.numero_orden);

      // Enviar por WhatsApp al proveedor
      const phoneNumber = provider.business_phone || provider.telefono;
      
      // DEBUG: Log para diagnosticar problema de WhatsApp
      console.log('📱 WhatsApp Debug:', {
        business_phone: provider.business_phone,
        telefono: provider.telefono,
        phoneNumber_selected: phoneNumber,
      });
      
      if (!phoneNumber) {
        console.error('❌ No hay número de teléfono del proveedor');
        toast({
          title: 'Error',
          description: 'El proveedor no tiene número de teléfono configurado',
          variant: 'destructive',
        });
        return;
      }
      
      // Limpiar número y asegurar prefijo 52 para México (misma lógica que citas)
      let cleanPhone = phoneNumber.replace(/\D/g, '');
      if (cleanPhone.length === 10) {
        cleanPhone = '52' + cleanPhone;
      } else if (cleanPhone.startsWith('1') && cleanPhone.length === 11) {
        // Algunos números vienen como 1XXXXXXXXXX
        cleanPhone = '52' + cleanPhone.slice(1);
      } else if (!cleanPhone.startsWith('52') && cleanPhone.length === 12) {
        // Si tiene 12 dígitos pero no empieza con 52, asumimos que falta
        cleanPhone = '52' + cleanPhone.slice(2);
      }
      
      const whatsappMessage = encodeURIComponent(message);
      const whatsappUrl = `https://wa.me/${cleanPhone}?text=${whatsappMessage}`;
      
      console.log('📱 WhatsApp URL:', {
        originalPhone: phoneNumber,
        cleanPhone,
        whatsappUrl: whatsappUrl.substring(0, 100) + '...',
      });
      
      // Intentar abrir WhatsApp
      const whatsappWindow = window.open(whatsappUrl, '_blank');
      console.log('📱 window.open result:', whatsappWindow ? 'opened' : 'blocked/failed');

      // Guardar número de orden y mantener diálogo abierto
      setOrderNumber(pedido.numero_orden);
      
      toast({
        title: `✅ Apartado #${pedido.numero_orden} enviado`,
        description: `Tu apartado fue enviado correctamente`,
        duration: 8000,
      });
    } catch (error: any) {
      console.error('Error creando apartado:', error);
      toast({
        title: 'Error',
        description: 'No se pudo crear el apartado. Intenta de nuevo.',
        variant: 'destructive',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const formatOrderMessage = (numeroOrden: number) => {
    const now = new Date();
    const fecha = now.toLocaleDateString('es-MX', { 
      weekday: 'long', 
      year: 'numeric', 
      month: 'long', 
      day: 'numeric' 
    });
    const hora = now.toLocaleTimeString('es-MX', { 
      hour: '2-digit', 
      minute: '2-digit' 
    });

    const customerPhone = userProfile?.telefono || '';

    let message = `🛒 NUEVO PEDIDO #${numeroOrden}\n\n`;
    message += `📅 Fecha: ${fecha}\n`;
    message += `🕐 Hora: ${hora}\n\n`;
    message += `👤 Cliente: ${customerName}\n`;
    message += `📱 Teléfono: ${customerPhone}\n\n`;

    // Agrupar items por orden
    for (let personIndex = 0; personIndex < numPeople; personIndex++) {
      const personItems = cart.filter(item => item.personIndex === personIndex);
      
      if (personItems.length > 0) {
        message += `📦 Orden ${personIndex + 1}:\n`;
        
        personItems.forEach((item) => {
          message += `  • ${item.nombre}\n`;
          message += `    ${item.cantidad} ${item.unit} × ${formatCurrency(item.precio)} = ${formatCurrency(item.precio * item.cantidad)}\n`;
        });
        
        message += `\n`;
      }
    }

    message += `💰 Total: ${formatCurrency(getTotal())}\n\n`;
    message += `¡Gracias por tu pedido! 🙏`;

    return message;
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-primary mx-auto"></div>
          <p className="mt-4 text-muted-foreground">Cargando perfil...</p>
        </div>
      </div>
    );
  }

  if (!provider) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle>Perfil no encontrado</CardTitle>
            <CardDescription>El proveedor que buscas no existe</CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={() => navigate('/')} className="w-full">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Volver al inicio
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const itemCount = getItemCount();

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border bg-card">
        <div className="container mx-auto px-4 py-4 flex justify-end items-center">
          {/* Navigation handled by phone back keys */}
          
          {/* Floating Cart Button for Mobile */}
          <Sheet open={isCartOpen} onOpenChange={setIsCartOpen}>
            <SheetTrigger asChild>
              <Button variant="default" className="lg:hidden relative">
                <ShoppingCart className="h-5 w-5" />
                {itemCount > 0 && (
                  <Badge 
                    variant="destructive" 
                    className="absolute -top-2 -right-2 h-5 w-5 flex items-center justify-center p-0 text-xs"
                  >
                    {itemCount}
                  </Badge>
                )}
              </Button>
            </SheetTrigger>
            <SheetContent side="right" className="w-full sm:max-w-md p-0">
              <SheetHeader className="p-4 border-b">
                <SheetTitle className="flex items-center gap-2">
                  <ShoppingCart className="h-5 w-5" />
                  Mi Carrito
                </SheetTitle>
              </SheetHeader>
              <div className="p-4 overflow-y-auto max-h-[calc(100vh-100px)]">
                <ShoppingCartComponent
                  cart={cart}
                  numPeople={numPeople}
                  onUpdateQuantity={updateQuantity}
                  onRemoveItem={removeFromCart}
                  onClearCart={clearCart}
                  onCheckout={() => {
                    setIsCartOpen(false);
                    handleCheckout();
                  }}
                  total={getTotal()}
                  itemCount={itemCount}
                />
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-4 py-8">
        <div className="max-w-6xl mx-auto">
          {/* Tabs for switching between Pedido and Cita */}
          <Tabs value={activeTab} onValueChange={setActiveTab} className="mb-6">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="pedido" className="flex items-center gap-2">
                <ShoppingCart className="h-4 w-4" />
                Hacer Pedido
              </TabsTrigger>
              <TabsTrigger value="cita" className="flex items-center gap-2">
                <CalendarCheck className="h-4 w-4" />
                Agendar Cita
              </TabsTrigger>
            </TabsList>
            
            <TabsContent value="pedido" className="mt-4">
              {/* Selector de órdenes - Sticky */}
              {products.length > 0 && (
                <div className="sticky top-0 z-10 bg-background pb-3">
                  <Card className="bg-card border border-border shadow-md">
                    <CardContent className="p-3">
                      <div className="flex items-center gap-3 flex-wrap">
                        <div className="flex items-center gap-2 flex-1 min-w-0 flex-wrap">
                          {Array.from({ length: numPeople }, (_, i) => (
                            <Button
                              key={i}
                              variant={selectedPersonIndex === i ? 'default' : 'outline'}
                              size="sm"
                              onClick={() => setSelectedPersonIndex(i)}
                              className={`${selectedPersonIndex === i ? 'shadow-sm' : ''}`}
                            >
                              <Users className="h-3 w-3 mr-1" />
                              Orden {i + 1}
                            </Button>
                          ))}
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={handleAddPerson}
                            className="border-dashed border"
                          >
                            <Plus className="h-3 w-3 mr-1" />
                            Agregar
                          </Button>
                        </div>
                        <Badge variant="secondary" className="text-xs whitespace-nowrap">
                          📝 Orden {selectedPersonIndex + 1}
                        </Badge>
                      </div>
                    </CardContent>
                  </Card>
                </div>
              )}

              <div className="grid lg:grid-cols-3 gap-6">
                {/* Columna principal - Productos */}
                <div className="lg:col-span-2 space-y-4">
                  {/* Products Section */}
                  <Card>
                    <CardHeader className="pb-3">
                      <CardTitle className="flex items-center gap-2 text-lg">
                        <Package className="h-5 w-5" />
                        Productos Disponibles
                      </CardTitle>
                      <CardDescription>
                        {products.length} {products.length === 1 ? 'producto disponible' : 'productos disponibles'}
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      {products.length === 0 ? (
                        <p className="text-center text-muted-foreground py-8">
                          No hay productos disponibles en este momento
                        </p>
                      ) : (
                        <div className="grid gap-4">
                          {products.map((product) => (
                            <ProductCard
                              key={product.id}
                              product={product}
                              selectedPersonIndex={selectedPersonIndex}
                              onAddToCart={addToCart}
                            />
                          ))}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </div>

          {/* Sidebar - Carrito (Desktop only) */}
          <div className="hidden lg:block lg:col-span-1 space-y-4">
            <div className="space-y-4 sticky top-4">
              <ShoppingCartComponent
                cart={cart}
                numPeople={numPeople}
                onUpdateQuantity={updateQuantity}
                onRemoveItem={removeFromCart}
                onClearCart={clearCart}
                onCheckout={handleCheckout}
                total={getTotal()}
                itemCount={itemCount}
              />
              
              {/* Botón para hacer otro pedido - sticky en la parte superior */}
              <Card className="shadow-lg border-2 border-primary">
                <CardContent className="p-4">
                  <Button
                    onClick={async () => {
                      clearCart();
                      setCustomerName('');
                      setOrderNumber(null);
                      
                      // Borrar todas las órdenes y reiniciar el número de orden
                      if (provider?.id) {
                        try {
                          await supabase
                            .from('pedidos')
                            .delete()
                            .eq('proveedor_id', provider.id);
                          
                          await supabase.rpc('reset_order_sequence');
                          
                          toast({
                            title: 'Nuevo pedido iniciado',
                            description: 'Carrito limpiado y órdenes borradas',
                          });
                        } catch (error) {
                          console.error('Error al limpiar órdenes:', error);
                          toast({
                            title: 'Carrito limpiado',
                            description: 'Puedes hacer un nuevo pedido',
                          });
                        }
                      } else {
                        toast({
                          title: 'Carrito limpiado',
                          description: 'Puedes hacer un nuevo pedido',
                        });
                      }
                    }}
                    variant="default"
                    className="w-full"
                  >
                    🔄 Hacer otro pedido
                  </Button>
                </CardContent>
              </Card>
            </div>
          </div>
              </div>
            </TabsContent>
            
            <TabsContent value="cita" className="mt-6">
              {provider && (
                <AppointmentBooking
                  proveedorId={provider.id}
                  proveedorNombre={provider.nombre}
                  proveedorTelefono={provider.telefono || provider.business_phone}
                />
              )}
            </TabsContent>
          </Tabs>

        {/* Checkout Dialog */}
        <Dialog open={showCheckoutDialog} onOpenChange={setShowCheckoutDialog}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>
                {orderNumber ? `✅ Pedido #${orderNumber} Confirmado` : 'Confirmar Pedido'}
              </DialogTitle>
              <DialogDescription>
                {orderNumber 
                  ? 'Tu pedido ha sido enviado exitosamente por WhatsApp'
                  : 'Ingresa tu nombre para enviar el pedido'
                }
              </DialogDescription>
            </DialogHeader>
            
            {orderNumber ? (
              <div className="space-y-4 py-4">
                <div className="bg-green-50 border border-green-200 rounded-lg p-4 text-center">
                  <p className="text-green-800 font-medium">
                    Pedido #{orderNumber} enviado correctamente
                  </p>
                </div>
              </div>
            ) : (
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label htmlFor="name">Nombre</Label>
                  <Input
                    id="name"
                    placeholder="Juan Pérez"
                    value={customerName}
                    onChange={(e) => setCustomerName(e.target.value)}
                    disabled={isSubmitting}
                  />
                </div>
                <div className="pt-4 border-t">
                  <div className="flex justify-between text-lg font-bold">
                    <span>Total:</span>
                    <span>${getTotal().toFixed(2)}</span>
                  </div>
                </div>
              </div>
            )}
            
            <DialogFooter className="gap-2">
              {orderNumber ? (
                <Button
                  onClick={() => {
                    setShowCheckoutDialog(false);
                    setOrderNumber(null);
                    setCustomerName('');
                  }}
                  className="w-full"
                >
                  Cerrar
                </Button>
              ) : (
                <>
                  <Button
                    variant="outline"
                    onClick={() => setShowCheckoutDialog(false)}
                    disabled={isSubmitting}
                  >
                    Cancelar
                  </Button>
                  <Button onClick={handleSubmitOrder} disabled={isSubmitting}>
                    {isSubmitting ? 'Enviando...' : 'Enviar Pedido'}
                  </Button>
                </>
              )}
            </DialogFooter>
          </DialogContent>
        </Dialog>
        </div>
      </main>
      <NavigationBar />
    </div>
  );
};

export default ProviderProfile;
