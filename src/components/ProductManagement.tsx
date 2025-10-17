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
  stock: number;
  foto_url?: string;
}

interface Category {
  id: string;
  name: string;
}

interface ProductManagementProps {
  proveedorId: string;
}

export default function ProductManagement({ proveedorId }: ProductManagementProps) {
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [deleteProductId, setDeleteProductId] = useState<string | null>(null);
  const [userRole, setUserRole] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const { toast } = useToast();

  const [formData, setFormData] = useState({
    nombre: '',
    descripcion: '',
    precio: 0,
    unit: 'kg',
    category_id: '',
    keywords: '',
    is_available: true,
    stock: 0,
  });

  useEffect(() => {
    fetchProducts();
    fetchCategories();
    checkUserRole();
  }, [proveedorId]);

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
        stock: product.stock,
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
        stock: 0,
      });
    }
    setSelectedFile(null);
    setIsDialogOpen(true);
  };

  const uploadProductPhoto = async (productId: string, file: File) => {
    try {
      setUploadingPhoto(true);
      
      // Validar tamaño del archivo (máximo 500KB)
      const maxSize = 500 * 1024; // 500KB en bytes
      if (file.size > maxSize) {
        toast({
          title: "Archivo muy grande",
          description: "La foto no debe superar los 500KB. Por favor, comprime la imagen antes de subirla.",
          variant: "destructive",
        });
        throw new Error('Archivo muy grande');
      }

      // Primero, marcar todas las fotos actuales como no principales
      await supabase
        .from('fotos_productos')
        .update({ es_principal: false })
        .eq('producto_id', productId);
      
      // Generar nombre único para el archivo
      const fileExt = file.name.split('.').pop();
      const fileName = `${productId}_${Date.now()}.${fileExt}`;
      const filePath = `${proveedorId}/${fileName}`;

      // Subir archivo a storage
      const { error: uploadError } = await supabase.storage
        .from('product-photos')
        .upload(filePath, file);

      if (uploadError) throw uploadError;

      // Obtener URL pública
      const { data: { publicUrl } } = supabase.storage
        .from('product-photos')
        .getPublicUrl(filePath);

      // Crear registro en fotos_productos
      const { error: dbError } = await supabase
        .from('fotos_productos')
        .insert({
          producto_id: productId,
          url: publicUrl,
          nombre_archivo: fileName,
          es_principal: true,
          mime_type: file.type,
          file_size: file.size,
        });

      if (dbError) throw dbError;

      toast({
        title: "Éxito",
        description: "Foto actualizada correctamente",
      });

      return publicUrl;
    } catch (error) {
      console.error('Error uploading photo:', error);
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

        // Si hay una nueva foto, subirla
        if (selectedFile) {
          await uploadProductPhoto(editingProduct.id, selectedFile);
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

        // Si hay foto, subirla
        if (selectedFile && productId) {
          await uploadProductPhoto(productId, selectedFile);
        }

        toast({
          title: "Éxito",
          description: "Producto creado correctamente",
        });
      }

      setIsDialogOpen(false);
      setSelectedFile(null);
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
              <div>
                <Label htmlFor="nombre">Nombre del Producto *</Label>
                <Input
                  id="nombre"
                  value={formData.nombre}
                  onChange={(e) => setFormData({...formData, nombre: e.target.value})}
                  placeholder="Ej: Tomate rojo"
                />
              </div>
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
                      <SelectItem value="otros">Otros</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div>
                <Label htmlFor="category">Categoría *</Label>
                <Select
                  value={formData.category_id}
                  onValueChange={(value) => setFormData({...formData, category_id: value})}
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
              <div>
                <Label htmlFor="keywords">Palabras clave</Label>
                <Input
                  id="keywords"
                  value={formData.keywords}
                  onChange={(e) => setFormData({...formData, keywords: e.target.value})}
                  placeholder="Ej: fresco, orgánico, temporada"
                />
              </div>
              <div>
                <Label htmlFor="photo">Foto del Producto</Label>
                <div className="flex items-center gap-4 mt-2">
                  <Input
                    id="photo"
                    type="file"
                    accept="image/*"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) {
                        const maxSize = 500 * 1024; // 500KB
                        if (file.size > maxSize) {
                          toast({
                            title: "Archivo muy grande",
                            description: "La foto no debe superar los 500KB. Por favor, comprime la imagen antes de subirla.",
                            variant: "destructive",
                          });
                          e.target.value = ''; // Limpiar el input
                          return;
                        }
                        setSelectedFile(file);
                      }
                    }}
                    className="flex-1"
                  />
                  {editingProduct?.foto_url && !selectedFile && (
                    <img 
                      src={editingProduct.foto_url} 
                      alt="Foto actual"
                      className="w-16 h-16 object-cover rounded"
                    />
                  )}
                  {selectedFile && (
                    <div className="flex flex-col items-end">
                      <span className="text-sm text-muted-foreground">
                        {selectedFile.name}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {(selectedFile.size / 1024).toFixed(0)}KB
                      </span>
                    </div>
                  )}
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  Formatos: JPG, PNG, WEBP. <strong>Máximo 500KB</strong>
                </p>
                {editingProduct?.foto_url && (
                  <p className="text-xs text-primary mt-1">
                    Selecciona una nueva foto para cambiar la actual
                  </p>
                )}
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