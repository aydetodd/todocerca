import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Package, ArrowLeft, ShoppingCart, Plus, Users } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
import { useShoppingCart } from '@/hooks/useShoppingCart';
import { ShoppingCart as ShoppingCartComponent } from '@/components/ShoppingCart';
import { formatCurrency } from '@/lib/utils';
import { useRealtimeMessages } from '@/hooks/useRealtimeMessages';
import { NavigationBar } from '@/components/NavigationBar';
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

  // Verificar autenticación al cargar
  useEffect(() => {
    if (!authLoading && !user) {
      // Guardar la URL actual para redirigir después del login
      const currentPath = proveedorId ? `/proveedor/${proveedorId}` : window.location.pathname;
      localStorage.setItem('redirectAfterLogin', currentPath);
      toast({
        title: "Registro requerido",
        description: "Por favor regístrate o inicia sesión para hacer pedidos",
      });
      navigate('/auth');
    }
  }, [authLoading, user, navigate, toast, proveedorId]);

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
    // Solo cargar datos si hay usuario
    if (authLoading) {
      return;
    }
    
    if (!user) {
      return; // El useEffect anterior ya maneja la redirección
    }
    
    loadProviderData();
    loadUserProfile();
  }, [proveedorId, consecutiveNumber, user, authLoading]);

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
      
      setProvider(providerData);

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
        description: 'Agrega productos antes de enviar el pedido',
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
      // Extraer solo los dígitos y agregar código de país de México si no lo tiene
      const cleanPhone = phoneNumber.replace(/\D/g, '');
      const fullPhone = cleanPhone.startsWith('52') ? cleanPhone : `52${cleanPhone}`;
      const whatsappMessage = encodeURIComponent(message);
      const whatsappUrl = `https://wa.me/${fullPhone}?text=${whatsappMessage}`;
      window.open(whatsappUrl, '_blank');

      // Guardar número de orden y mantener diálogo abierto
      setOrderNumber(pedido.numero_orden);
      
      toast({
        title: `✅ Pedido #${pedido.numero_orden} enviado`,
        description: `Tu pedido fue enviado correctamente`,
        duration: 8000,
      });
    } catch (error: any) {
      console.error('Error creando pedido:', error);
      toast({
        title: 'Error',
        description: 'No se pudo crear el pedido. Intenta de nuevo.',
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

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border bg-card">
        <div className="container mx-auto px-4 py-4">
          <Button variant="ghost" onClick={() => navigate('/')}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Volver
          </Button>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-4 py-8">
        <div className="max-w-6xl mx-auto">
          <div className="grid lg:grid-cols-3 gap-6">
          {/* Columna principal - Productos */}
          <div className="lg:col-span-2 space-y-6">
            {/* Selector de persona */}
            {products.length > 0 && (
              <Card className="bg-gradient-to-r from-primary/10 to-primary/5 border-2 border-primary/30 shadow-lg">
                <CardContent className="p-6">
                  <div className="space-y-4">
                    <div className="flex items-center justify-between flex-wrap gap-3">
                      <div className="flex items-center gap-3">
                        <div className="p-2 bg-primary/20 rounded-full">
                          <Users className="h-6 w-6 text-primary" />
                        </div>
                        <div>
                          <h3 className="font-bold text-lg">Selecciona la orden</h3>
                          <p className="text-sm text-muted-foreground">Los productos se agregarán a la orden seleccionada</p>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 flex-wrap">
                      {Array.from({ length: numPeople }, (_, i) => (
                        <Button
                          key={i}
                          variant={selectedPersonIndex === i ? 'default' : 'outline'}
                          size="lg"
                          onClick={() => setSelectedPersonIndex(i)}
                          className={selectedPersonIndex === i ? 'shadow-md scale-105' : ''}
                        >
                          <Users className="h-4 w-4 mr-2" />
                          Orden {i + 1}
                        </Button>
                      ))}
                      <Button
                        variant="outline"
                        size="lg"
                        onClick={handleAddPerson}
                        className="border-dashed border-2"
                      >
                        <Plus className="h-4 w-4 mr-2" />
                        Agregar orden
                      </Button>
                    </div>
                    <div className="bg-primary/10 rounded-lg p-3 border border-primary/20">
                      <p className="text-sm font-medium text-center">
                        📝 Actualmente agregando para: <span className="text-primary font-bold">Orden {selectedPersonIndex + 1}</span>
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}


          {/* Products Section */}
          <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Package className="h-6 w-6" />
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
                  <div className="grid gap-6">
                    {products.map((product) => (
                      <Card key={product.id}>
                        <CardContent className="p-6">
                          <div className="space-y-4">
                            <div>
                              <h3 className="text-xl font-semibold">{product.nombre}</h3>
                              <p className="text-2xl font-bold text-primary mt-1">
                                {formatCurrency(product.precio)} / {product.unit}
                              </p>
                            </div>

                            {product.descripcion && (
                              <details className="group">
                                <summary className="cursor-pointer text-sm text-primary hover:underline list-none flex items-center gap-2">
                                  Ver más
                                  <span className="transition-transform group-open:rotate-180">▼</span>
                                </summary>
                                <p className="text-muted-foreground mt-2 text-sm">
                                  {product.descripcion}
                                </p>
                              </details>
                            )}

                            <div className="flex items-center gap-3">
                              <Badge variant={product.stock > 0 ? 'default' : 'secondary'}>
                                Stock: {product.stock}
                              </Badge>
                              {product.stock > 0 && (
                                <Button
                                  onClick={() => addToCart({
                                    id: product.id,
                                    nombre: product.nombre,
                                    precio: product.precio,
                                    unit: product.unit,
                                    personIndex: selectedPersonIndex,
                                  })}
                                  size="lg"
                                  className="flex-1"
                                >
                                  <Plus className="h-4 w-4 mr-2" />
                                  Agregar para Orden {selectedPersonIndex + 1}
                                </Button>
                              )}
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Sidebar - Carrito */}
          <div className="lg:col-span-1 space-y-4">
            <div className="space-y-4">
              <ShoppingCartComponent
                cart={cart}
                numPeople={numPeople}
                onUpdateQuantity={updateQuantity}
                onRemoveItem={removeFromCart}
                onClearCart={clearCart}
                onCheckout={handleCheckout}
                total={getTotal()}
                itemCount={getItemCount()}
              />
              
              {/* Botón para hacer otro pedido - sticky en la parte superior */}
              <Card className="sticky top-28 z-10 shadow-lg border-2 border-primary mt-4">
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
