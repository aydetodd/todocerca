import React, { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Plus, Pencil, Trash2, Save, X, AlertCircle, Image } from 'lucide-react';
import { ProductPhotoGallery } from '@/components/ProductPhotoGallery';
import { useMunicipios } from '@/hooks/useMunicipios';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface Product {
  id: string;
  nombre: string;
  descripcion: string;
  precio: number;
  unit: string;
  category_id: string;
  keywords: string;
  is_available: boolean;
  is_mobile: boolean;
  stock: number;
  foto_url?: string;
  estado?: string;
  ciudad?: string;
}

interface Category {
  id: string;
  name: string;
}

interface Category {
  id: string;
  name: string;
}

interface ProductManagementProps {
  proveedorId: string;
}

// Generar lista de rutas disponibles (1-30)
const AVAILABLE_ROUTES = Array.from({ length: 30 }, (_, i) => `Ruta ${i + 1}`);

export default function ProductManagement({ proveedorId }: ProductManagementProps) {
  const [products, setProducts] = useState<Product[]>([]);
  const [allRouteProducts, setAllRouteProducts] = useState<{nombre: string}[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [deleteProductId, setDeleteProductId] = useState<string | null>(null);
  const [userRole, setUserRole] = useState<string | null>(null);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [selectedRoute, setSelectedRoute] = useState<string>('');
  const [routeVariant, setRouteVariant] = useState<string>('');
  const { toast } = useToast();
  const { getEstados, getMunicipios } = useMunicipios();

  const [formData, setFormData] = useState({
    nombre: '',
    descripcion: '',
    precio: 0,
    unit: 'kg',
    category_id: '',
    keywords: '',
    is_available: true,
    is_mobile: false,
    stock: 1,
    estado: '',
    ciudad: '',
  });

  // Detectar si la categoría seleccionada es "Rutas de Transporte"
  const isRutasCategory = categories.find(c => c.id === formData.category_id)?.name === 'Rutas de Transporte';
  const rutasCategoryId = categories.find(c => c.name === 'Rutas de Transporte')?.id;

  // Contar variantes por número de ruta (globalmente)
  const routeVariantCount = AVAILABLE_ROUTES.reduce((acc, route) => {
    // Contar cuántos productos tienen este número de ruta (exacto o con variante)
    const count = allRouteProducts.filter(p => 
      p.nombre === route || p.nombre.startsWith(`${route} - `)
    ).length;
    acc[route] = count;
    return acc;
  }, {} as Record<string, number>);

  // Rutas disponibles (con menos de 3 variantes)
  const availableRoutes = AVAILABLE_ROUTES.filter(r => routeVariantCount[r] < 3);

  useEffect(() => {
    fetchProducts();
    fetchCategories();
    checkUserRole();
  }, [proveedorId]);

  // Fetch all route products globally when category changes
  useEffect(() => {
    if (rutasCategoryId) {
      fetchAllRouteProducts();
    }
  }, [rutasCategoryId]);

  const fetchAllRouteProducts = async () => {
    try {
      const { data, error } = await supabase
        .from('productos')
        .select('nombre')
        .eq('category_id', rutasCategoryId);

      if (error) throw error;
      setAllRouteProducts(data || []);
    } catch (error) {
      console.error('Error fetching route products:', error);
    }
  };

  const checkUserRole = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('user_id', user.id)
        .single();

      setUserRole(profile?.role || null);
    } catch (error) {
      console.error('Error checking user role:', error);
    }
  };

  const fetchProducts = async () => {
    try {
      const { data, error } = await supabase
        .from('productos')
        .select(`
          *,
          fotos_productos(url, es_principal)
        `)
        .eq('proveedor_id', proveedorId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      
      // Agregar la URL de la foto principal a cada producto
      const productsWithPhotos = (data || []).map((product: any) => ({
        ...product,
        foto_url: product.fotos_productos?.find((f: any) => f.es_principal)?.url || 
                  product.fotos_productos?.[0]?.url || null,
      }));
      
      setProducts(productsWithPhotos);
    } catch (error: any) {
      toast({
        title: "Error",
        description: "No se pudieron cargar los productos",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const fetchCategories = async () => {
    try {
      const { data, error } = await supabase
        .from('product_categories')
        .select('*')
        .order('name');

      if (error) throw error;
      setCategories(data || []);
    } catch (error: any) {
      console.error('Error fetching categories:', error);
    }
  };

  const handleOpenDialog = (product?: Product) => {
    if (product) {
      setEditingProduct(product);
      setFormData({
        nombre: product.nombre,
        descripcion: product.descripcion,
        precio: product.precio,
        unit: product.unit,
        category_id: product.category_id,
        keywords: product.keywords || '',
        is_available: product.is_available,
        is_mobile: product.is_mobile,
        stock: product.stock,
        estado: product.estado || '',
        ciudad: product.ciudad || '',
      });
    } else {
      setEditingProduct(null);
      setFormData({
        nombre: '',
        descripcion: '',
        precio: 0,
        unit: 'kg',
        category_id: '',
        keywords: '',
        is_available: true,
        is_mobile: false,
        stock: 1,
        estado: '',
        ciudad: '',
      });
      setSelectedRoute('');
      setRouteVariant('');
    }
    setSelectedFiles([]);
    setIsDialogOpen(true);
  };

  const uploadProductPhotos = async (files: File[], productId: string, isFirstProduct: boolean = false): Promise<void> => {
    try {
      setUploadingPhoto(true);
      
      // Validar tamaño de cada archivo
      const maxSize = 500 * 1024; // 500KB
      const invalidFiles = files.filter(f => f.size > maxSize);
      
      if (invalidFiles.length > 0) {
        toast({
          title: "Archivos muy grandes",
          description: `${invalidFiles.length} foto(s) superan los 500KB. Por favor, comprime las imágenes.`,
          variant: "destructive",
        });
        throw new Error('Archivos muy grandes');
      }

      // Si es un producto nuevo o no tiene fotos, la primera será principal
      let isFirstPhoto = isFirstProduct;
      
      if (!isFirstProduct) {
        // Verificar si ya tiene fotos
        const { data: existingPhotos } = await supabase
          .from('fotos_productos')
          .select('id')
          .eq('producto_id', productId)
          .limit(1);
        
        isFirstPhoto = !existingPhotos || existingPhotos.length === 0;
      }

      // Subir cada foto
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const fileExt = file.name.split('.').pop();
        const fileName = `${productId}_${Date.now()}_${i}.${fileExt}`;
        const filePath = `${proveedorId}/${fileName}`;

        const { error: uploadError } = await supabase.storage
          .from('product-photos')
          .upload(filePath, file);

        if (uploadError) throw uploadError;

        const { data: { publicUrl } } = supabase.storage
          .from('product-photos')
          .getPublicUrl(filePath);

        // La primera foto será principal si no hay otras
        const { error: dbError } = await supabase
          .from('fotos_productos')
          .insert({
            producto_id: productId,
            url: publicUrl,
            nombre_archivo: fileName,
            file_size: file.size,
            mime_type: file.type,
            es_principal: isFirstPhoto && i === 0,
          });

        if (dbError) throw dbError;
      }

      toast({
        title: "Éxito",
        description: `${files.length} foto(s) subida(s) correctamente`,
      });
    } catch (error) {
      console.error('Error uploading photos:', error);
      toast({
        title: "Error",
        description: "No se pudieron subir algunas fotos",
        variant: "destructive",
      });
      throw error;
    } finally {
      setUploadingPhoto(false);
    }
  };

  const handleSaveProduct = async () => {
    try {
      if (!formData.nombre || !formData.descripcion || !formData.category_id) {
        toast({
          title: "Error",
          description: "Por favor completa todos los campos obligatorios",
          variant: "destructive",
        });
        return;
      }

      let productId = editingProduct?.id;

      if (editingProduct) {
        // Update existing product
        const { error } = await supabase
          .from('productos')
          .update(formData)
          .eq('id', editingProduct.id);

        if (error) throw error;

        // Si hay nuevas fotos, subirlas
        if (selectedFiles.length > 0) {
          await uploadProductPhotos(selectedFiles, editingProduct.id, false);
        }

        toast({
          title: "Éxito",
          description: "Producto actualizado correctamente",
        });
      } else {
        // Create new product
        const { data, error } = await supabase
          .from('productos')
          .insert({
            ...formData,
            proveedor_id: proveedorId,
          })
          .select()
          .single();

        if (error) throw error;
        productId = data.id;

        // Si hay fotos, subirlas
        if (selectedFiles.length > 0 && productId) {
          await uploadProductPhotos(selectedFiles, productId, true);
        }

        toast({
          title: "Éxito",
          description: "Producto creado correctamente",
        });
      }

      setIsDialogOpen(false);
      setSelectedFiles([]);
      fetchProducts();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const handleDeleteProduct = async () => {
    if (!deleteProductId) return;

    try {
      // Verificar si el producto tiene pedidos asociados
      const { data: itemsPedido, error: checkError } = await supabase
        .from('items_pedido')
        .select('id')
        .eq('producto_id', deleteProductId)
        .limit(1);

      if (checkError) throw checkError;

      if (itemsPedido && itemsPedido.length > 0) {
        // El producto tiene pedidos asociados, no se puede eliminar
        toast({
          title: "No se puede eliminar",
          description: "Este producto tiene pedidos asociados. En lugar de eliminarlo, puedes marcarlo como 'No disponible' para ocultarlo de las búsquedas.",
          variant: "destructive",
        });
        setDeleteProductId(null);
        return;
      }

      // Si no tiene pedidos, eliminar el producto
      const { error } = await supabase
        .from('productos')
        .delete()
        .eq('id', deleteProductId);

      if (error) throw error;

      toast({
        title: "Éxito",
        description: "Producto eliminado correctamente",
      });

      setDeleteProductId(null);
      fetchProducts();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
      setDeleteProductId(null);
    }
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="text-center">Cargando productos...</div>
        </CardContent>
      </Card>
    );
  }

  // Verificar si el usuario es proveedor
  if (userRole && userRole !== 'proveedor') {
    return (
      <Alert className="max-w-2xl">
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>
          Solo los proveedores pueden gestionar productos. Si deseas ofrecer productos o servicios, 
          contacta al administrador para actualizar tu cuenta a proveedor.
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold">Mis Productos</h2>
          <p className="text-muted-foreground">Gestiona tu inventario ({products.length}/500)</p>
        </div>
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button onClick={() => handleOpenDialog()}>
              <Plus className="h-4 w-4 mr-2" />
              Nuevo Producto
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>
                {editingProduct ? 'Editar Producto' : 'Nuevo Producto'}
              </DialogTitle>
              <DialogDescription>
                {editingProduct 
                  ? 'Modifica los datos del producto' 
                  : 'Completa los datos del nuevo producto'}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              {/* Categoría primero para rutas de transporte */}
              <div>
                <Label htmlFor="category">Categoría *</Label>
                <Select
                  value={formData.category_id}
                  onValueChange={(value) => {
                    setFormData({...formData, category_id: value, nombre: '', descripcion: ''});
                    setSelectedRoute('');
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecciona una categoría" />
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
              
              {/* Selector especial para Rutas de Transporte */}
              {isRutasCategory && !editingProduct && (
                <>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="route">Número de Ruta *</Label>
                      <Select
                        value={selectedRoute}
                        onValueChange={(value) => {
                          setSelectedRoute(value);
                          const fullName = routeVariant ? `${value} - ${routeVariant}` : value;
                          setFormData({
                            ...formData, 
                            nombre: fullName,
                            unit: 'viaje',
                            keywords: ''
                          });
                        }}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Selecciona ruta" />
                        </SelectTrigger>
                        <SelectContent className="max-h-60 bg-background">
                          {availableRoutes.length > 0 ? (
                            availableRoutes.map((route) => (
                              <SelectItem key={route} value={route}>
                                {route}
                              </SelectItem>
                            ))
                          ) : (
                            <div className="px-2 py-4 text-center text-muted-foreground text-sm">
                              Todas las rutas tienen 3 variantes registradas
                            </div>
                          )}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label htmlFor="routeVariant">Variante (opcional)</Label>
                      <Input
                        id="routeVariant"
                        value={routeVariant}
                        onChange={(e) => {
                          const variant = e.target.value;
                          setRouteVariant(variant);
                          if (selectedRoute) {
                            const fullName = variant ? `${selectedRoute} - ${variant}` : selectedRoute;
                            setFormData({
                              ...formData,
                              nombre: fullName
                            });
                          }
                        }}
                        placeholder="Ej: Centro, Periférico, Manga"
                      />
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Si hay varias rutas con el mismo número pero diferente recorrido, agrega una variante para identificarla. 
                    Ejemplo: "Ruta 1 - Centro" o "Ruta 1 - Periférico"
                  </p>
                  
                  {/* Mostrar nombre final */}
                  {selectedRoute && (
                    <div className="bg-muted/50 p-3 rounded-md">
                      <Label className="text-xs text-muted-foreground">Nombre de tu ruta:</Label>
                      <p className="font-semibold text-lg">{formData.nombre || selectedRoute}</p>
                    </div>
                  )}
                  
                  {/* Campo de recorrido para rutas */}
                  {selectedRoute && (
                    <div>
                      <Label htmlFor="recorrido">Recorrido / Puntos Importantes *</Label>
                      <Textarea
                        id="recorrido"
                        value={formData.descripcion}
                        onChange={(e) => setFormData({...formData, descripcion: e.target.value})}
                        placeholder="Describe las calles principales y puntos importantes. Ej: Calle 200, Calle Michoacán, Centro Comercial X, Hospital Y..."
                        rows={4}
                      />
                      <p className="text-xs text-muted-foreground mt-1">
                        Escribe las calles y lugares por donde pasa tu ruta para que los usuarios puedan identificarla
                      </p>
                    </div>
                  )}
                  
                  {/* Campo de concepto/detalle para rutas */}
                  {selectedRoute && (
                    <div>
                      <Label htmlFor="concepto">Concepto / Detalle Adicional</Label>
                      <Input
                        id="concepto"
                        value={formData.keywords}
                        onChange={(e) => setFormData({...formData, keywords: e.target.value})}
                        placeholder="Ej: Servicio express, Aire acondicionado, Horario nocturno..."
                      />
                    </div>
                  )}
                </>
              )}

              {/* Nombre del producto (solo si no es categoría rutas o está editando) */}
              {(!isRutasCategory || editingProduct) && (
                <div>
                  <Label htmlFor="nombre">Nombre del Producto *</Label>
                  <Input
                    id="nombre"
                    value={formData.nombre}
                    onChange={(e) => setFormData({...formData, nombre: e.target.value})}
                    placeholder="Ej: Tomate rojo"
                  />
                </div>
              )}
              
              {/* Descripción para productos normales */}
              {(!isRutasCategory || editingProduct) && (
                <div>
                  <Label htmlFor="descripcion">Descripción *</Label>
                  <Textarea
                    id="descripcion"
                    value={formData.descripcion}
                    onChange={(e) => setFormData({...formData, descripcion: e.target.value})}
                    placeholder="Describe tu producto..."
                    rows={3}
                  />
                </div>
              )}
              
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="precio">Precio *</Label>
                  <Input
                    id="precio"
                    type="number"
                    value={formData.precio}
                    onChange={(e) => setFormData({...formData, precio: parseFloat(e.target.value) || 0})}
                    placeholder="0.00"
                    min="0"
                    step="0.01"
                  />
                </div>
                <div>
                  <Label htmlFor="unit">Unidad *</Label>
                  <Select
                    value={formData.unit}
                    onValueChange={(value) => setFormData({...formData, unit: value})}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="kg">Kilos</SelectItem>
                      <SelectItem value="l">Litros</SelectItem>
                      <SelectItem value="pz">Piezas</SelectItem>
                      <SelectItem value="m">Metros</SelectItem>
                      <SelectItem value="paquete">Paquetes</SelectItem>
                      <SelectItem value="caja">Cajas</SelectItem>
                      <SelectItem value="bulto">Bultos</SelectItem>
                      <SelectItem value="ton">Toneladas</SelectItem>
                      <SelectItem value="g">Gramos</SelectItem>
                      <SelectItem value="km">Kilómetros</SelectItem>
                      <SelectItem value="cita">Citas</SelectItem>
                      <SelectItem value="proceso">Procesos</SelectItem>
                      <SelectItem value="evento">Eventos</SelectItem>
                      <SelectItem value="viaje">Viajes</SelectItem>
                      <SelectItem value="otros">Otros</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              
              {/* Ubicación: Estado y Ciudad */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="estado">Estado *</Label>
                  <Select
                    value={formData.estado}
                    onValueChange={(value) => setFormData({...formData, estado: value, ciudad: ''})}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Selecciona estado" />
                    </SelectTrigger>
                    <SelectContent className="max-h-60">
                      {getEstados().map((estado) => (
                        <SelectItem key={estado} value={estado}>
                          {estado}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="ciudad">Ciudad *</Label>
                  <Select
                    value={formData.ciudad}
                    onValueChange={(value) => setFormData({...formData, ciudad: value})}
                    disabled={!formData.estado}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Selecciona ciudad" />
                    </SelectTrigger>
                    <SelectContent className="max-h-60">
                      {getMunicipios(formData.estado).map((municipio) => (
                        <SelectItem key={municipio} value={municipio}>
                          {municipio}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  id="is_mobile"
                  checked={formData.is_mobile}
                  onChange={(e) => setFormData({...formData, is_mobile: e.target.checked})}
                  className="h-4 w-4 rounded border-input"
                />
                <Label htmlFor="is_mobile" className="text-sm font-normal cursor-pointer">
                  Este producto se vende en ubicación móvil (vendedor ambulante)
                </Label>
              </div>
              <div>
                <Label htmlFor="photos">Fotos del Producto</Label>
                <div className="space-y-2 mt-2">
                  <Input
                    id="photos"
                    type="file"
                    accept="image/*"
                    multiple
                    onChange={(e) => {
                      const files = Array.from(e.target.files || []);
                      const maxSize = 500 * 1024; // 500KB
                      const validFiles = files.filter(f => f.size <= maxSize);
                      const invalidFiles = files.filter(f => f.size > maxSize);
                      
                      if (invalidFiles.length > 0) {
                        toast({
                          title: "Algunos archivos muy grandes",
                          description: `${invalidFiles.length} foto(s) superan los 500KB y no se seleccionaron.`,
                          variant: "destructive",
                        });
                      }
                      
                      if (validFiles.length > 0) {
                        setSelectedFiles(prev => [...prev, ...validFiles]);
                      }
                    }}
                  />
                  
                  {selectedFiles.length > 0 && (
                    <div className="space-y-2">
                      <p className="text-sm text-muted-foreground">
                        {selectedFiles.length} foto(s) seleccionada(s)
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {selectedFiles.map((file, index) => (
                          <div key={index} className="relative">
                            <img
                              src={URL.createObjectURL(file)}
                              alt={`Preview ${index + 1}`}
                              className="w-20 h-20 object-cover rounded border"
                            />
                            <button
                              type="button"
                              onClick={() => setSelectedFiles(prev => prev.filter((_, i) => i !== index))}
                              className="absolute -top-2 -right-2 bg-destructive text-destructive-foreground rounded-full w-5 h-5 flex items-center justify-center text-xs"
                            >
                              ×
                            </button>
                            <span className="absolute bottom-0 left-0 right-0 bg-black/50 text-white text-[10px] px-1 text-center">
                              {(file.size / 1024).toFixed(0)}KB
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  
                  {editingProduct && (
                    <ProductPhotoGallery productoId={editingProduct.id} />
                  )}
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  Formatos: JPG, PNG, WEBP. <strong>Máximo 500KB por foto</strong>. Puedes subir múltiples fotos.
                </p>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="stock">Stock</Label>
                  <Input
                    id="stock"
                    type="number"
                    value={formData.stock}
                    onChange={(e) => setFormData({...formData, stock: parseInt(e.target.value) || 0})}
                    min="0"
                  />
                </div>
                <div className="flex items-center space-x-2 pt-8">
                  <input
                    type="checkbox"
                    id="is_available"
                    checked={formData.is_available}
                    onChange={(e) => setFormData({...formData, is_available: e.target.checked})}
                    className="h-4 w-4"
                  />
                  <Label htmlFor="is_available">Disponible</Label>
                </div>
              </div>
            </div>
            <div className="flex justify-end space-x-2">
              <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
                <X className="h-4 w-4 mr-2" />
                Cancelar
              </Button>
              <Button onClick={handleSaveProduct} disabled={uploadingPhoto}>
                <Save className="h-4 w-4 mr-2" />
                {uploadingPhoto ? 'Subiendo foto...' : 'Guardar'}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {products.length === 0 ? (
        <Card>
          <CardContent className="p-12 text-center">
            <p className="text-muted-foreground mb-4">No tienes productos registrados</p>
            <Button onClick={() => handleOpenDialog()}>
              <Plus className="h-4 w-4 mr-2" />
              Agregar tu primer producto
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {products.map((product) => (
            <Card key={product.id} className="overflow-hidden">
              {product.foto_url && (
                <div className="w-full h-48 bg-muted relative">
                  <img 
                    src={product.foto_url} 
                    alt={product.nombre}
                    className="w-full h-full object-cover"
                  />
                </div>
              )}
              {!product.foto_url && (
                <div className="w-full h-48 bg-muted flex items-center justify-center">
                  <Image className="h-12 w-12 text-muted-foreground" />
                </div>
              )}
              <CardHeader>
                <CardTitle className="flex items-center justify-between">
                  <span className="truncate">{product.nombre}</span>
                  <div className="flex space-x-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleOpenDialog(product)}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setDeleteProductId(product.id)}
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                </CardTitle>
                <CardDescription>
                  ${product.precio.toFixed(2)} / {product.unit}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground line-clamp-2 mb-2">
                  {product.descripcion}
                </p>
                <div className="flex items-center justify-between text-xs">
                  <span className={product.is_available ? 'text-green-600' : 'text-red-600'}>
                    {product.is_available ? '● Disponible' : '● No disponible'}
                  </span>
                  <span className="text-muted-foreground">
                    Stock: {product.stock}
                  </span>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <AlertDialog open={!!deleteProductId} onOpenChange={() => setDeleteProductId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Estás seguro?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta acción no se puede deshacer. El producto será eliminado permanentemente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteProduct}>
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}