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

interface Product {
  id: string;
  nombre: string;
  descripcion: string;
  precio: number;
  unit: string;
  category_id: string;
  keywords: string;
  photo?: File;
  photoPreview?: string;
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
    codigoPostal: string;
  };
}

export default function ProviderRegistration({ onComplete, userData }: ProviderRegistrationProps) {
  const [currentStep, setCurrentStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [categories, setCategories] = useState<Category[]>([]);
  const { toast } = useToast();

  // Provider data
  const [providerData, setProviderData] = useState({
    nombre: userData.nombre,
    email: userData.email,
    telefono: userData.telefono,
    codigo_postal: userData.codigoPostal,
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
  }, []);

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
    if (products.length >= 50) {
      toast({
        title: "Límite alcanzado",
        description: "No puedes registrar más de 50 productos",
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

  const handlePhotoUpload = (id: string, file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      updateProduct(id, 'photo', file);
      updateProduct(id, 'photoPreview', e.target?.result as string);
    };
    reader.readAsDataURL(file);
  };

  const validateStep1 = () => {
    return providerData.nombre && providerData.email && providerData.telefono;
  };

  const validateStep2 = () => {
    return products.every(p => 
      p.nombre && p.descripcion && p.precio > 0 && p.category_id
    );
  };

  const handleSubmit = async () => {
    console.log('🚀 Starting handleSubmit...');
    console.log('📝 Step 1 validation:', validateStep1());
    console.log('📝 Step 2 validation:', validateStep2());
    console.log('📦 Provider data before processing:', JSON.stringify(providerData, null, 2));
    console.log('🛍️ Products data before processing:', JSON.stringify(products, null, 2));
    
    if (!validateStep1()) {
      console.log('❌ Step 1 validation failed');
      console.log('Required fields - nombre:', !!providerData.nombre, 'email:', !!providerData.email, 'telefono:', !!providerData.telefono);
      toast({
        title: "Error",
        description: "Por favor completa todos los campos de información del proveedor",
        variant: "destructive",
      });
      return;
    }
    
    if (!validateStep2()) {
      console.log('❌ Step 2 validation failed');
      products.forEach((p, i) => {
        console.log(`Product ${i + 1}:`, {
          nombre: !!p.nombre,
          descripcion: !!p.descripcion,
          precio: p.precio > 0,
          category_id: !!p.category_id
        });
      });
      toast({
        title: "Error",
        description: "Por favor completa todos los campos de los productos",
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

      // 2. Create provider record
      console.log('🏢 Creating provider record...');
      const providerDataWithUserId = {
        ...providerData,
        user_id: currentUser.id
      };
      console.log('🏢 Provider data with user ID:', JSON.stringify(providerDataWithUserId, null, 2));

      const { data: providerRecord, error: providerError } = await supabase
        .from('proveedores')
        .insert(providerDataWithUserId)
        .select()
        .single();

      console.log('🏢 Provider insert result:', { data: providerRecord, error: providerError });

      if (providerError) {
        console.error('❌ Provider insert error details:', {
          message: providerError.message,
          details: providerError.details,
          hint: providerError.hint,
          code: providerError.code
        });
        throw new Error(`Error al crear proveedor: ${providerError.message}`);
      }

      if (!providerRecord) {
        console.error('❌ No provider record returned');
        throw new Error('No se pudo crear el registro de proveedor');
      }

      console.log('✅ Provider created successfully:', providerRecord);

      // 2. Create products
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

        // 3. Upload photo if exists
        if (product.photo) {
          console.log('📸 Uploading photo for product:', productRecord.id);
          const fileExt = product.photo.name.split('.').pop();
          const fileName = `${productRecord.id}.${fileExt}`;
          const filePath = `${providerRecord.user_id}/${fileName}`;

          console.log('📸 Photo upload path:', filePath);
          const { error: uploadError } = await supabase.storage
            .from('product-photos')
            .upload(filePath, product.photo);

          if (uploadError) {
            console.error('❌ Photo upload error:', uploadError);
          } else {
            console.log('✅ Photo uploaded successfully');
            const { data: { publicUrl } } = supabase.storage
              .from('product-photos')
              .getPublicUrl(filePath);

            console.log('📸 Public URL:', publicUrl);
            // Save photo record
            const { error: photoRecordError } = await supabase
              .from('fotos_productos')
              .insert({
                producto_id: productRecord.id,
                url: publicUrl,
                nombre_archivo: fileName,
                es_principal: true,
                alt_text: product.nombre,
                mime_type: product.photo.type,
                file_size: product.photo.size,
              });
            
            if (photoRecordError) {
              console.error('❌ Photo record error:', photoRecordError);
            } else {
              console.log('✅ Photo record saved');
            }
          }
        } else {
          console.log('📸 No photo for this product');
        }
      }

      console.log('🎉 All products and photos processed successfully');
      toast({
        title: "¡Registro exitoso!",
        description: `Se registraron ${products.length} productos correctamente`,
      });

      console.log('🎯 Calling onComplete...');
      onComplete();
    } catch (error) {
      console.error('💥 Registration error:', error);
      toast({
        title: "Error",
        description: `Hubo un problema al registrar tus productos: ${error.message}`,
        variant: "destructive",
      });
    } finally {
      console.log('🏁 Setting loading to false');
      setLoading(false);
    }
  };

  const renderStep1 = () => (
    <div className="space-y-4">
      <div>
        <Label htmlFor="nombre">Nombre del Negocio *</Label>
        <Input
          id="nombre"
          value={providerData.nombre}
          onChange={(e) => setProviderData({...providerData, nombre: e.target.value})}
          placeholder="Ej: Frutas y Verduras La Huerta"
        />
      </div>
      <div>
        <Label htmlFor="email">Email *</Label>
        <Input
          id="email"
          type="email"
          value={providerData.email}
          onChange={(e) => setProviderData({...providerData, email: e.target.value})}
          placeholder="tu@email.com"
        />
      </div>
      <div>
        <Label htmlFor="telefono">Teléfono *</Label>
        <Input
          id="telefono"
          value={providerData.telefono}
          onChange={(e) => setProviderData({...providerData, telefono: e.target.value})}
          placeholder="123-456-7890"
        />
      </div>
      <div>
        <Label htmlFor="codigo_postal">Código Postal</Label>
        <Input
          id="codigo_postal"
          value={providerData.codigo_postal}
          onChange={(e) => setProviderData({...providerData, codigo_postal: e.target.value})}
          placeholder="12345"
        />
      </div>
    </div>
  );

  const renderStep2 = () => (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h3 className="text-lg font-medium">Productos ({products.length}/50)</h3>
        <Button onClick={addProduct} disabled={products.length >= 50}>
          <Plus className="w-4 h-4 mr-2" />
          Agregar Producto
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

              <div>
                <Label>Foto</Label>
                <div className="flex items-center gap-2">
                  <Input
                    type="file"
                    accept="image/*"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) handlePhotoUpload(product.id, file);
                    }}
                    className="flex-1"
                  />
                  {product.photoPreview && (
                    <img
                      src={product.photoPreview}
                      alt="Preview"
                      className="w-12 h-12 object-cover rounded"
                    />
                  )}
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
    </div>
  );

  return (
    <div className="max-w-4xl mx-auto p-6">
      <Card>
        <CardHeader>
          <CardTitle>Registro de Proveedor - Paso {currentStep} de 2</CardTitle>
          <div className="flex space-x-2">
            <div className={`h-2 w-1/2 rounded ${currentStep >= 1 ? 'bg-primary' : 'bg-muted'}`} />
            <div className={`h-2 w-1/2 rounded ${currentStep >= 2 ? 'bg-primary' : 'bg-muted'}`} />
          </div>
        </CardHeader>

        <CardContent>
          {currentStep === 1 && renderStep1()}
          {currentStep === 2 && renderStep2()}

          <div className="flex justify-between mt-8">
            <Button
              variant="outline"
              onClick={() => setCurrentStep(1)}
              disabled={currentStep === 1}
            >
              <ArrowLeft className="w-4 h-4 mr-2" />
              Anterior
            </Button>

            {currentStep === 1 ? (
              <Button
                onClick={() => setCurrentStep(2)}
                disabled={!validateStep1()}
              >
                Siguiente
                <ArrowRight className="w-4 h-4 ml-2" />
              </Button>
            ) : (
              <Button
                onClick={handleSubmit}
                disabled={loading || !validateStep2()}
              >
                {loading ? 'Registrando...' : 'Completar Registro'}
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}