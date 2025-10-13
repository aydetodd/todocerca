import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { MapPin, Phone, Mail, Package, ArrowLeft, ShoppingCart, Plus, Users } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useShoppingCart } from '@/hooks/useShoppingCart';
import { ShoppingCart as ShoppingCartComponent } from '@/components/ShoppingCart';
import { ProductPhotoGallery } from '@/components/ProductPhotoGallery';
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
}

const ProviderProfile = () => {
  const { proveedorId, consecutiveNumber } = useParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [provider, setProvider] = useState<ProviderData | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCheckoutDialog, setShowCheckoutDialog] = useState(false);
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [selectedPersonIndex, setSelectedPersonIndex] = useState(0);

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
    loadProviderData();
  }, [proveedorId, consecutiveNumber]);

  const loadProviderData = async () => {
    try {
      let actualProveedorId = proveedorId;

      // If consecutiveNumber is provided (business name slug), lookup by name
      if (consecutiveNumber) {
        // Convert slug back to searchable format (replace hyphens with spaces)
        const searchName = consecutiveNumber.replace(/-/g, ' ');

        // Search for provider by name (case-insensitive)
        const { data: proveedorData, error: proveedorError } = await supabase
          .from('proveedores')
          .select('id, nombre')
          .ilike('nombre', `%${searchName}%`)
          .limit(1)
          .single();

        if (proveedorError || !proveedorData) {
          console.error('Error buscando proveedor por nombre:', proveedorError);
          throw new Error('Proveedor no encontrado');
        }

        actualProveedorId = proveedorData.id;
      }

      if (!actualProveedorId) {
        throw new Error('ID de proveedor no válido');
      }

      // Cargar datos del proveedor
      const { data: providerData, error: providerError } = await supabase
        .from('proveedores')
        .select('*')
        .eq('id', actualProveedorId)
        .single();

      if (providerError) throw providerError;
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
    if (!customerName.trim() || !customerPhone.trim()) {
      toast({
        title: 'Datos incompletos',
        description: 'Por favor ingresa tu nombre y teléfono',
        variant: 'destructive',
      });
      return;
    }

    if (!provider) return;

    setIsSubmitting(true);

    try {
      // Crear el pedido en la base de datos
      const { data: pedido, error: pedidoError } = await supabase
        .from('pedidos')
        .insert({
          proveedor_id: provider.id,
          cliente_nombre: customerName.trim(),
          cliente_telefono: customerPhone.trim(),
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
      }));

      const { error: itemsError } = await supabase
        .from('items_pedido')
        .insert(itemsToInsert);

      if (itemsError) throw itemsError;

      // Formatear mensaje para WhatsApp
      const message = formatWhatsAppMessage(pedido.numero_orden);

      // Enviar por WhatsApp - Respetar el código de país del número registrado
      // Extraer solo dígitos del número de teléfono
      let phoneNumber = provider.business_phone.replace(/\D/g, '');
      
      // Si el número no tiene código de país (10 dígitos = número local)
      // asumimos que es México y agregamos +52
      if (phoneNumber.length === 10) {
        phoneNumber = `52${phoneNumber}`;
      }
      
      window.open(`https://wa.me/${phoneNumber}?text=${encodeURIComponent(message)}`, '_blank');

      // Limpiar carrito y cerrar diálogo
      clearCart();
      setShowCheckoutDialog(false);
      setCustomerName('');
      setCustomerPhone('');

      toast({
        title: '¡Pedido enviado!',
        description: `Tu pedido #${pedido.numero_orden} fue creado. Serás redirigido a WhatsApp.`,
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

  const formatWhatsAppMessage = (numeroOrden: number) => {
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

    let message = `🛒 *NUEVO PEDIDO #${numeroOrden}*\n\n`;
    message += `📅 *Fecha:* ${fecha}\n`;
    message += `🕐 *Hora:* ${hora}\n\n`;
    message += `👤 *Cliente:* ${customerName}\n`;
    message += `📱 *Teléfono:* ${customerPhone}\n`;
    message += `👥 *Personas en la mesa:* ${numPeople}\n\n`;

    // Agrupar items por persona
    for (let personIndex = 0; personIndex < numPeople; personIndex++) {
      const personItems = cart.filter(item => item.personIndex === personIndex);
      
      if (personItems.length > 0) {
        message += `👤 *Persona ${personIndex + 1}:*\n`;
        
        personItems.forEach((item) => {
          message += `  • ${item.nombre}\n`;
          message += `    ${item.cantidad} ${item.unit} × $${item.precio} = $${(item.precio * item.cantidad).toFixed(2)}\n`;
        });
        
        message += `\n`;
      }
    }

    message += `💰 *Total: $${getTotal().toFixed(2)}*\n\n`;
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
                          <h3 className="font-bold text-lg">Selecciona la persona</h3>
                          <p className="text-sm text-muted-foreground">Los productos se agregarán a la persona seleccionada</p>
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
                          Persona {i + 1}
                        </Button>
                      ))}
                      <Button
                        variant="outline"
                        size="lg"
                        onClick={handleAddPerson}
                        className="border-dashed border-2"
                      >
                        <Plus className="h-4 w-4 mr-2" />
                        Agregar persona
                      </Button>
                    </div>
                    <div className="bg-primary/10 rounded-lg p-3 border border-primary/20">
                      <p className="text-sm font-medium text-center">
                        📝 Actualmente agregando para: <span className="text-primary font-bold">Persona {selectedPersonIndex + 1}</span>
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Provider Info Card */}
            <Card>
            <CardHeader>
              <div className="flex items-start justify-between">
                <div>
                  <CardTitle className="text-3xl">{provider.nombre}</CardTitle>
                  {provider.description && (
                    <CardDescription className="text-base mt-2">
                      {provider.description}
                    </CardDescription>
                  )}
                </div>
                <Badge variant="default" className="text-lg px-4 py-2">
                  Proveedor
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {provider.business_address && (
                <div className="flex items-start gap-3">
                  <MapPin className="h-5 w-5 text-muted-foreground mt-0.5" />
                  <div>
                    <p className="font-medium">Dirección</p>
                    <p className="text-muted-foreground">{provider.business_address}</p>
                  </div>
                </div>
              )}
              {provider.business_phone && (
                <div className="flex items-start gap-3">
                  <Phone className="h-5 w-5 text-muted-foreground mt-0.5" />
                  <div>
                    <p className="font-medium">Teléfono del negocio</p>
                    <p className="text-muted-foreground">{provider.business_phone}</p>
                  </div>
                </div>
              )}
              {provider.email && (
                <div className="flex items-start gap-3">
                  <Mail className="h-5 w-5 text-muted-foreground mt-0.5" />
                  <div>
                    <p className="font-medium">Email</p>
                    <p className="text-muted-foreground">{provider.email}</p>
                  </div>
                </div>
              )}
              <div className="flex gap-2 pt-4">
                {provider.business_phone && (
                  <>
                    <Button 
                      onClick={() => handleCall(provider.business_phone)}
                      className="flex-1"
                    >
                      <Phone className="h-4 w-4 mr-2" />
                      Llamar
                    </Button>
                    <Button 
                      onClick={() => handleWhatsApp(provider.business_phone)}
                      variant="outline"
                      className="flex-1"
                    >
                      WhatsApp
                    </Button>
                  </>
                )}
              </div>
            </CardContent>
          </Card>

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
                          <div className="grid md:grid-cols-[300px,1fr] gap-4">
                            {/* Galería de fotos */}
                            <div>
                              <ProductPhotoGallery productoId={product.id} />
                            </div>

                            {/* Información del producto */}
                            <div className="space-y-4">
                              <div>
                                <h3 className="text-xl font-semibold">{product.nombre}</h3>
                                <p className="text-2xl font-bold text-primary mt-1">
                                  ${product.precio} / {product.unit}
                                </p>
                              </div>

                              {product.descripcion && (
                                <p className="text-muted-foreground">
                                  {product.descripcion}
                                </p>
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
                                    Agregar para Persona {selectedPersonIndex + 1}
                                  </Button>
                                )}
                              </div>
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
          <div className="lg:col-span-1">
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
          </div>
        </div>

        {/* Checkout Dialog */}
        <Dialog open={showCheckoutDialog} onOpenChange={setShowCheckoutDialog}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Confirmar Pedido</DialogTitle>
              <DialogDescription>
                Ingresa tus datos para enviar el pedido por WhatsApp
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="name">Nombre completo</Label>
                <Input
                  id="name"
                  placeholder="Juan Pérez"
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="phone">Teléfono (con código de país)</Label>
                <Input
                  id="phone"
                  type="tel"
                  placeholder="5215551234567"
                  value={customerPhone}
                  onChange={(e) => setCustomerPhone(e.target.value)}
                />
              </div>
              <div className="pt-4 border-t">
                <div className="flex justify-between text-lg font-bold">
                  <span>Total:</span>
                  <span>${getTotal().toFixed(2)}</span>
                </div>
              </div>
            </div>
            <DialogFooter>
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
            </DialogFooter>
          </DialogContent>
        </Dialog>
        </div>
      </main>
    </div>
  );
};

export default ProviderProfile;
