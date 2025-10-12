import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { MapPin, Phone, Mail, Package, ArrowLeft } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

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
  const { proveedorId } = useParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [provider, setProvider] = useState<ProviderData | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadProviderData();
  }, [proveedorId]);

  const loadProviderData = async () => {
    try {
      if (!proveedorId) return;

      // Cargar datos del proveedor
      const { data: providerData, error: providerError } = await supabase
        .from('proveedores')
        .select('*')
        .eq('id', proveedorId)
        .single();

      if (providerError) throw providerError;
      setProvider(providerData);

      // Cargar productos del proveedor
      const { data: productsData, error: productsError } = await supabase
        .from('productos')
        .select('*')
        .eq('proveedor_id', proveedorId)
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
        <div className="max-w-4xl mx-auto space-y-6">
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
                <div className="grid gap-4 md:grid-cols-2">
                  {products.map((product) => (
                    <Card key={product.id}>
                      <CardHeader>
                        <CardTitle className="text-lg">{product.nombre}</CardTitle>
                        <CardDescription>
                          ${product.precio} / {product.unit}
                        </CardDescription>
                      </CardHeader>
                      <CardContent>
                        {product.descripcion && (
                          <p className="text-sm text-muted-foreground mb-2">
                            {product.descripcion}
                          </p>
                        )}
                        <div className="flex items-center justify-between">
                          <Badge variant={product.stock > 0 ? 'default' : 'secondary'}>
                            Stock: {product.stock}
                          </Badge>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
};

export default ProviderProfile;
