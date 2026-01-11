import React, { useState, useEffect } from 'react';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Plus, Trash2, Upload, ArrowLeft, ArrowRight } from 'lucide-react';
import { PhoneInput } from '@/components/ui/phone-input';
import { trackProviderRegistration, trackConversion } from '@/lib/analytics';

interface Product {
  id: string;
  nombre: string;
  descripcion: string;
  precio: number;
  unit: string;
  category_id: string;
  keywords: string;
}

interface Category {
  id: string;
  name: string;
  description: string;
}

interface ProviderRegistrationProps {
  onComplete: () => void;
  userData: {
    email: string;
    nombre: string;
    telefono: string;
    codigoPostal?: string;
  };
}

// Plan types and pricing
type PlanType = 'basico' | 'plan100' | 'plan500';

interface PlanInfo {
  id: PlanType;
  name: string;
  price: number;
  maxProducts: number;
  priceId: string;
  description: string;
}

const SUBSCRIPTION_PLANS: PlanInfo[] = [
  {
    id: 'basico',
    name: 'Plan Básico',
    price: 200,
    maxProducts: 10,
    priceId: 'price_1SDaOLGyH05pxWZzSeqEjiE1',
    description: 'Ideal para negocios pequeños (hasta 10 productos)'
  },
  {
    id: 'plan100',
    name: 'Plan 100',
    price: 300,
    maxProducts: 100,
    priceId: 'price_1SoDm6GyH05pxWZzEbLT9Ag8',
    description: 'Para negocios medianos (hasta 100 productos)'
  },
  {
    id: 'plan500',
    name: 'Plan 500',
    price: 400,
    maxProducts: 500,
    priceId: 'price_1SoDmZGyH05pxWZzIRwoID4Q',
    description: 'Para negocios grandes (hasta 500 productos)'
  }
];

// Taxi/Ruta categories get special treatment - max 2 products, $200
const TAXI_RUTA_MAX_PRODUCTS = 2;

export default function ProviderRegistration({ onComplete, userData }: ProviderRegistrationProps) {
  const [loading, setLoading] = useState(false);
  const [categories, setCategories] = useState<Category[]>([]);
  const [couponCode, setCouponCode] = useState('');
  const [apodo, setApodo] = useState('');
  const [providerType, setProviderType] = useState<'taxi' | 'ruta' | 'normal'>('normal');
  const [routeName, setRouteName] = useState('');
  const [selectedPlan, setSelectedPlan] = useState<PlanType>('basico');
  const { toast } = useToast();

  // Check if this is a taxi/ruta provider
  const isTaxiRuta = providerType === 'taxi' || providerType === 'ruta';

  // Get current plan info
  const currentPlan = SUBSCRIPTION_PLANS.find(p => p.id === selectedPlan) || SUBSCRIPTION_PLANS[0];
  
  // Max products depends on type
  const maxProducts = isTaxiRuta ? TAXI_RUTA_MAX_PRODUCTS : currentPlan.maxProducts;
  
  // Price for taxi/ruta is always $200
  const currentPrice = isTaxiRuta ? 200 : currentPlan.price;
  
  // Price ID for taxi/ruta is always the basic plan
  const currentPriceId = isTaxiRuta ? 'price_1SDaOLGyH05pxWZzSeqEjiE1' : currentPlan.priceId;

  // Provider data - simplified
  const [providerData, setProviderData] = useState({
    nombre: '',  // Nombre del negocio (opcional)
    telefono: userData.telefono,
    business_address: '',  // Dirección (opcional)
    description: '',       // Descripción (opcional)
    latitude: null as number | null,
    longitude: null as number | null,
  });

  // Products data
  const [products, setProducts] = useState<Product[]>([{
    id: '1',
    nombre: '',
    descripcion: '',
    precio: 0,
    unit: 'kg',
    category_id: '',
    keywords: '',
  }]);

  useEffect(() => {
    fetchCategories();
    getCurrentLocation();
  }, []);

  const getCurrentLocation = () => {
    // NO obtener ubicación GPS automáticamente
    // La ubicación debe derivarse de la dirección del negocio ingresada
    console.log('📍 Ubicación del negocio debe ingresarse como dirección');
  };

  const fetchCategories = async () => {
    try {
      const { data, error } = await supabase
        .from('product_categories')
        .select('*')
        .order('name');

      if (error) throw error;
      setCategories(data || []);
    } catch (error) {
      console.error('Error fetching categories:', error);
      toast({
        title: "Error",
        description: "No se pudieron cargar las categorías",
        variant: "destructive",
      });
    }
  };

  const addProduct = () => {
    if (products.length >= maxProducts) {
      toast({
        title: "Límite alcanzado",
        description: isTaxiRuta 
          ? `Taxi y Rutas permite máximo ${TAXI_RUTA_MAX_PRODUCTS} productos`
          : `Tu plan permite máximo ${maxProducts} productos. Selecciona un plan superior para más.`,
        variant: "destructive",
      });
      return;
    }

    const newProduct: Product = {
      id: Date.now().toString(),
      nombre: '',
      descripcion: '',
      precio: 0,
      unit: 'kg',
      category_id: '',
      keywords: '',
    };
    setProducts([...products, newProduct]);
  };

  const removeProduct = (id: string) => {
    if (products.length <= 1) {
      toast({
        title: "Error",
        description: "Debes tener al menos un producto",
        variant: "destructive",
      });
      return;
    }
    setProducts(products.filter(p => p.id !== id));
  };

  const updateProduct = (id: string, field: keyof Product, value: any) => {
    setProducts(products.map(p => 
      p.id === id ? { ...p, [field]: value } : p
    ));
  };

  const validateForm = () => {
    // Solo apodo y teléfono son obligatorios
    if (!apodo || !providerData.telefono) {
      return false;
    }
    // Validar productos
    return products.every(p => 
      p.nombre && p.descripcion && p.precio > 0 && p.category_id
    );
  };

  const handleSubmit = async () => {
    console.log('🚀 Starting handleSubmit...');
    trackProviderRegistration('started');
    
    if (!validateForm()) {
      console.log('❌ Validation failed');
      toast({
        title: "Error",
        description: "Por favor completa los campos obligatorios (apodo, teléfono) y la información de los productos",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);
    try {
      // 1. Get current user
      console.log('👤 Getting current user...');
      const { data: { user: currentUser }, error: userError } = await supabase.auth.getUser();
      console.log('👤 Current user result:', { user: currentUser, error: userError });
      
      if (userError) {
        console.error('❌ User fetch error:', userError);
        throw new Error(`Error al obtener usuario: ${userError.message}`);
      }
      
      if (!currentUser) {
        console.error('❌ No current user found');
        throw new Error('Usuario no autenticado. Por favor inicia sesión nuevamente.');
      }

      // 2. Actualizar perfil con apodo, tipo de proveedor, ruta y cambiar rol a proveedor
      console.log('👤 Updating profile with apodo, provider_type and changing role to proveedor...');
      const { error: profileUpdateError } = await supabase
        .from('profiles')
        .update({ 
          apodo,
          role: 'proveedor',
          provider_type: isTaxiRuta ? providerType as 'taxi' | 'ruta' : null,
          route_name: providerType === 'ruta' ? routeName : null
        })
        .eq('user_id', currentUser.id);
      
      if (profileUpdateError) {
        console.error('⚠️ Profile update error:', profileUpdateError);
        throw new Error(`Error al actualizar perfil: ${profileUpdateError.message}`);
      }

      // 3. Create provider record - Check if exists first
      console.log('🏢 Checking if provider record already exists...');
      const { data: existingProvider, error: checkError } = await supabase
        .from('proveedores')
        .select('id')
        .eq('user_id', currentUser.id)
        .maybeSingle();
      
      console.log('🏢 Existing provider check:', { data: existingProvider, error: checkError });
      
      let providerRecord;
      
      if (existingProvider) {
        console.log('🏢 Provider record already exists, updating...');
        const providerDataWithUserId = {
          nombre: providerData.nombre || apodo,
          email: userData.email,
          telefono: providerData.telefono,
          business_address: providerData.business_address,
          description: providerData.description,
          latitude: providerData.latitude,
          longitude: providerData.longitude,
        };
        
        const { data: updatedProvider, error: updateError } = await supabase
          .from('proveedores')
          .update(providerDataWithUserId)
          .eq('user_id', currentUser.id)
          .select()
          .single();
        
        if (updateError) {
          console.error('❌ Provider update error:', updateError);
          throw new Error(`Error al actualizar proveedor: ${updateError.message}`);
        }
        
        providerRecord = updatedProvider;
        console.log('✅ Provider updated successfully:', providerRecord);
      } else {
        console.log('🏢 Creating new provider record...');
        const providerDataWithUserId = {
          nombre: providerData.nombre || apodo,
          email: userData.email,
          telefono: providerData.telefono,
          business_address: providerData.business_address,
          description: providerData.description,
          latitude: providerData.latitude,
          longitude: providerData.longitude,
          user_id: currentUser.id
        };
        console.log('🏢 Provider data with user ID:', JSON.stringify(providerDataWithUserId, null, 2));

        const { data: newProvider, error: providerError } = await supabase
          .from('proveedores')
          .insert(providerDataWithUserId)
          .select()
          .single();

        console.log('🏢 Provider insert result:', { data: newProvider, error: providerError });

        if (providerError) {
          console.error('❌ Provider insert error details:', {
            message: providerError.message,
            details: providerError.details,
            hint: providerError.hint,
            code: providerError.code
          });
          throw new Error(`Error al crear proveedor: ${providerError.message}`);
        }

        providerRecord = newProvider;
        console.log('✅ Provider created successfully:', providerRecord);
      }

      if (!providerRecord) {
        console.error('❌ No provider record returned');
        throw new Error('No se pudo crear el registro de proveedor');
      }

      // 4. Create products
      console.log('🛍️ Creating products...');
      for (let i = 0; i < products.length; i++) {
        const product = products[i];
        console.log(`📦 Processing product ${i + 1}/${products.length}:`, product);
        
        const productData = {
          nombre: product.nombre,
          descripcion: product.descripcion,
          precio: product.precio,
          unit: product.unit,
          category_id: product.category_id,
          keywords: product.keywords,
          proveedor_id: providerRecord.id,
          stock: 0,
          is_available: true,
        };
        console.log('📦 Product data to insert:', productData);

        const { data: productRecord, error: productError } = await supabase
          .from('productos')
          .insert(productData)
          .select()
          .single();

        if (productError) {
          console.error('❌ Product error:', productError);
          throw productError;
        }

        console.log('✅ Product created:', productRecord);
      }

      console.log('🎉 All products processed successfully');
      
      // 5. Refresh session to update JWT token with new role
      console.log('🔄 Refreshing session to update token...');
      const { data: refreshData, error: refreshError } = await supabase.auth.refreshSession();
      if (refreshError) {
        console.error('⚠️ Session refresh error:', refreshError);
      } else {
        console.log('✅ Session refreshed successfully');
      }
      
      // Redirect to payment
      console.log('💳 Calling create-checkout edge function...');
      const checkoutBody: { couponCode?: string; priceId: string; planType: string } = {
        priceId: currentPriceId,
        planType: isTaxiRuta ? 'taxi_ruta' : selectedPlan
      };
      if (couponCode) {
        checkoutBody.couponCode = couponCode;
      }
      console.log('💳 Checkout body:', checkoutBody);
      
      const { data: checkoutData, error: checkoutError } = await supabase.functions.invoke('create-checkout', {
        body: checkoutBody
      });
      
      console.log('💳 Checkout response:', { data: checkoutData, error: checkoutError });
      
      if (checkoutError) {
        console.error('❌ Checkout error details:', JSON.stringify(checkoutError, null, 2));
        throw new Error(`Error al crear sesión de pago: ${JSON.stringify(checkoutError)}`);
      }

      if (checkoutData?.url) {
        // Get first product category for tracking
        const firstCategory = products[0]?.category_id;
        trackProviderRegistration('completed', firstCategory);
        trackConversion('provider_upgrade', 400);
        
        toast({
          title: "¡Registro exitoso!",
          description: `Se registraron ${products.length} productos. Redirigiendo al pago...`,
        });
        
        // Open Stripe checkout in new tab
        window.open(checkoutData.url, '_blank');
        
        // Call onComplete to update UI
        onComplete();
      } else {
        throw new Error('No se pudo obtener la URL de pago');
      }
    } catch (error: any) {
      console.error('💥 Registration error:', error);
      console.error('💥 Error stack:', error.stack);
      const errorMessage = error.message || 'Error desconocido';
      const errorDetails = JSON.stringify(error, null, 2);
      console.error('💥 Full error object:', errorDetails);
      
      toast({
        title: "Error en el registro",
        description: errorMessage,
        variant: "destructive",
      });
    } finally {
      console.log('🏁 Setting loading to false');
      setLoading(false);
    }
  };

  const renderProviderInfo = () => (
    <div className="space-y-4">
      {/* Tipo de proveedor */}
      <div>
        <Label>Tipo de Servicio *</Label>
        <Select
          value={providerType}
          onValueChange={(value: 'taxi' | 'ruta' | 'normal') => {
            setProviderType(value);
            // Reset products if switching to taxi/ruta (limit to 2)
            if ((value === 'taxi' || value === 'ruta') && products.length > TAXI_RUTA_MAX_PRODUCTS) {
              setProducts(products.slice(0, TAXI_RUTA_MAX_PRODUCTS));
            }
          }}
        >
          <SelectTrigger>
            <SelectValue placeholder="Selecciona tipo de servicio" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="normal">🏪 Negocio / Tienda / Servicios</SelectItem>
            <SelectItem value="taxi">🚕 Taxi</SelectItem>
            <SelectItem value="ruta">🚌 Ruta de Transporte Público</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Selector de plan (solo para negocios normales) */}
      {!isTaxiRuta && (
        <div className="space-y-3">
          <Label>Plan de Suscripción *</Label>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {SUBSCRIPTION_PLANS.map((plan) => (
              <Card 
                key={plan.id}
                className={`p-4 cursor-pointer transition-all ${
                  selectedPlan === plan.id 
                    ? 'border-primary ring-2 ring-primary bg-primary/5' 
                    : 'hover:border-primary/50'
                }`}
                onClick={() => {
                  setSelectedPlan(plan.id);
                  // Trim products if exceeding new plan limit
                  if (products.length > plan.maxProducts) {
                    setProducts(products.slice(0, plan.maxProducts));
                  }
                }}
              >
                <div className="text-center space-y-2">
                  <h4 className="font-semibold">{plan.name}</h4>
                  <div className="text-2xl font-bold text-primary">${plan.price} MXN</div>
                  <p className="text-xs text-muted-foreground">/año</p>
                  <Badge variant="secondary">{plan.maxProducts} productos</Badge>
                  <p className="text-xs text-muted-foreground">{plan.description}</p>
                </div>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* Info especial para taxi/ruta */}
      {isTaxiRuta && (
        <Card className="p-4 bg-blue-50 dark:bg-blue-950 border-blue-200 dark:border-blue-800">
          <div className="text-center space-y-2">
            <h4 className="font-semibold">Plan Taxi / Transporte</h4>
            <div className="text-2xl font-bold text-primary">$200 MXN</div>
            <p className="text-xs text-muted-foreground">/año</p>
            <Badge variant="secondary">Máximo 2 servicios</Badge>
            <p className="text-xs text-muted-foreground">Ideal para taxistas y rutas de transporte</p>
          </div>
        </Card>
      )}
      
      {/* Nombre de ruta (solo para transporte público) */}
      {providerType === 'ruta' && (
        <div>
          <Label htmlFor="routeName">Nombre de la Ruta *</Label>
          <Input
            id="routeName"
            value={routeName}
            onChange={(e) => setRouteName(e.target.value)}
            placeholder="Ej: Ruta 1, Línea Centro-Norte"
            required
          />
        </div>
      )}
      
      <div>
        <Label htmlFor="apodo">Alias / Nombre de Usuario *</Label>
        <Input
          id="apodo"
          value={apodo}
          onChange={(e) => setApodo(e.target.value)}
          required
        />
      </div>
      <div>
        <Label htmlFor="nombre">Nombre del Negocio (opcional)</Label>
        <Input
          id="nombre"
          value={providerData.nombre}
          onChange={(e) => setProviderData({...providerData, nombre: e.target.value})}
        />
      </div>
      <PhoneInput
        id="telefono"
        value={providerData.telefono}
        onChange={(value) => setProviderData({...providerData, telefono: value})}
        label="Teléfono *"
        required
      />
      <div>
        <Label htmlFor="business_address">Dirección del Negocio (opcional)</Label>
        <Textarea
          id="business_address"
          value={providerData.business_address}
          onChange={(e) => setProviderData({...providerData, business_address: e.target.value})}
          rows={2}
        />
      </div>
      <div>
        <Label htmlFor="description">Descripción del Negocio (opcional)</Label>
        <Textarea
          id="description"
          value={providerData.description}
          onChange={(e) => setProviderData({...providerData, description: e.target.value})}
          rows={2}
        />
      </div>
      <div className="space-y-2">
        <p className="text-xs text-muted-foreground">
          💡 Tu ubicación en el mapa se mostrará según la dirección del negocio que ingreses
        </p>
        <p className="text-xs text-muted-foreground">
          📍 Si vendes productos móviles (vendedor ambulante), marca la casilla correspondiente al registrar cada producto
        </p>
      </div>
    </div>
  );

  const renderProducts = () => (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h3 className="text-lg font-medium">
          {isTaxiRuta ? 'Servicios' : 'Productos'} ({products.length}/{maxProducts})
        </h3>
        <Button onClick={addProduct} disabled={products.length >= maxProducts}>
          <Plus className="w-4 h-4 mr-2" />
          Agregar {isTaxiRuta ? 'Servicio' : 'Producto'}
        </Button>
      </div>

      <div className="space-y-6 max-h-96 overflow-y-auto">
        {products.map((product, index) => (
          <Card key={product.id} className="p-4">
            <div className="flex justify-between items-start mb-4">
              <Badge variant="outline">Producto {index + 1}</Badge>
              {products.length > 1 && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => removeProduct(product.id)}
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label>Nombre del Producto *</Label>
                <Input
                  value={product.nombre}
                  onChange={(e) => updateProduct(product.id, 'nombre', e.target.value)}
                  placeholder="Ej: Tomate rojo"
                />
              </div>

              <div>
                <Label>Categoría *</Label>
                <Select
                  value={product.category_id}
                  onValueChange={(value) => updateProduct(product.id, 'category_id', value)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecciona categoría" />
                  </SelectTrigger>
                  <SelectContent>
                    {categories.map((category) => (
                      <SelectItem key={category.id} value={category.id}>
                        {category.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label>Precio *</Label>
                <div className="flex gap-2">
                  <Input
                    type="number"
                    value={product.precio}
                    onChange={(e) => updateProduct(product.id, 'precio', parseFloat(e.target.value) || 0)}
                    placeholder="0.00"
                    min="0"
                    step="0.01"
                  />
                  <Select
                    value={product.unit}
                    onValueChange={(value) => updateProduct(product.id, 'unit', value)}
                  >
                    <SelectTrigger className="w-20">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="kg">kg</SelectItem>
                      <SelectItem value="g">g</SelectItem>
                      <SelectItem value="l">l</SelectItem>
                      <SelectItem value="ml">ml</SelectItem>
                      <SelectItem value="pz">pz</SelectItem>
                      <SelectItem value="caja">caja</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="md:col-span-2">
                <Label>Descripción *</Label>
                <Textarea
                  value={product.descripcion}
                  onChange={(e) => updateProduct(product.id, 'descripcion', e.target.value)}
                  placeholder="Describe tu producto..."
                  rows={2}
                />
              </div>

              <div className="md:col-span-2">
                <Label>Palabras clave (opcional)</Label>
                <Input
                  value={product.keywords}
                  onChange={(e) => updateProduct(product.id, 'keywords', e.target.value)}
                  placeholder="Ej: fresco, orgánico, temporada"
                />
              </div>
            </div>
          </Card>
        ))}
      </div>

      <Card className="p-4 mt-6 bg-muted/30">
        <div className="space-y-2">
          <Label htmlFor="coupon">Clave del Punto de Venta (Opcional)</Label>
          <Input
            id="coupon"
            value={couponCode}
            onChange={(e) => setCouponCode(e.target.value.trim())}
            placeholder="Ingresa la clave del punto de venta"
          />
          <p className="text-sm text-muted-foreground">
            Si pagas en efectivo en un punto de venta, ingresa la clave que te proporcionen
          </p>
        </div>
      </Card>
    </div>
  );

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Registro de Proveedor</CardTitle>
          <p className="text-sm text-muted-foreground">
            Completa tu información y registra al menos un producto. Luego procederás al pago para activar tu cuenta.
          </p>
        </CardHeader>

        <CardContent className="space-y-8">
          {/* Información del Proveedor */}
          <div>
            <h3 className="text-lg font-semibold mb-4">Información del Proveedor</h3>
            {renderProviderInfo()}
          </div>

          {/* Productos */}
          <div>
            <h3 className="text-lg font-semibold mb-4">Productos</h3>
            {renderProducts()}
          </div>

          {/* Clave del Punto de Venta */}
          <div>
            <Label htmlFor="coupon">Clave del Punto de Venta (opcional)</Label>
            <Input
              id="coupon"
              value={couponCode}
              onChange={(e) => setCouponCode(e.target.value)}
              placeholder="Ingresa la clave del punto de venta"
            />
          </div>

          {/* Botón de envío */}
          <div className="flex justify-end">
            <Button
              onClick={handleSubmit}
              disabled={loading || !validateForm()}
              size="lg"
            >
              {loading ? 'Procesando...' : `Continuar al Pago ($${currentPrice} MXN/año)`}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}