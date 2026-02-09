import { useState, useEffect } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Plus, ImageIcon, ChevronDown, ChevronUp, Share2 } from 'lucide-react';
import { formatCurrency } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';

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

interface ProductCardProps {
  product: Product;
  selectedPersonIndex: number;
  onAddToCart: (item: {
    id: string;
    nombre: string;
    precio: number;
    unit: string;
    personIndex: number;
  }) => void;
}

interface ProductPhoto {
  id: string;
  url: string;
  alt_text: string | null;
}

export const ProductCard = ({ product, selectedPersonIndex, onAddToCart }: ProductCardProps) => {
  const [photo, setPhoto] = useState<ProductPhoto | null>(null);
  const [loadingPhoto, setLoadingPhoto] = useState(true);
  const [isLightboxOpen, setIsLightboxOpen] = useState(false);
  const [showFullDescription, setShowFullDescription] = useState(false);
  const { toast } = useToast();

  const MAX_DESCRIPTION_LENGTH = 60;
  const hasLongDescription = product.descripcion && product.descripcion.length > MAX_DESCRIPTION_LENGTH;

  useEffect(() => {
    loadPhoto();
  }, [product.id]);

  const loadPhoto = async () => {
    try {
      const { data, error } = await supabase
        .from('fotos_productos')
        .select('id, url, alt_text')
        .eq('producto_id', product.id)
        .eq('es_principal', true)
        .limit(1)
        .maybeSingle();

      if (error) throw error;
      setPhoto(data);
    } catch (error) {
      console.error('Error cargando foto:', error);
    } finally {
      setLoadingPhoto(false);
    }
  };

  const handleShare = async () => {
    const shareData = {
      title: product.nombre,
      text: `${product.nombre} - ${formatCurrency(product.precio)} / ${product.unit}`,
      url: window.location.href,
    };

    try {
      if (navigator.share) {
        await navigator.share(shareData);
      } else {
        await navigator.clipboard.writeText(`${shareData.text}\n${shareData.url}`);
        toast({
          title: "Enlace copiado",
          description: "El enlace del producto fue copiado al portapapeles",
        });
      }
    } catch (error) {
      console.error('Error sharing:', error);
    }
  };

  const truncatedDescription = hasLongDescription && !showFullDescription
    ? product.descripcion.substring(0, MAX_DESCRIPTION_LENGTH) + '...'
    : product.descripcion;

  return (
    <>
      <Card>
        <CardContent className="p-4">
          <div className="flex gap-4">
            {/* Foto pequeña del producto */}
            <div 
              className="flex-shrink-0 w-20 h-20 rounded-lg overflow-hidden bg-muted cursor-pointer"
              onClick={() => photo && setIsLightboxOpen(true)}
            >
              {loadingPhoto ? (
                <div className="w-full h-full animate-pulse bg-muted" />
              ) : photo ? (
                <img
                  src={photo.url}
                  alt={photo.alt_text || product.nombre}
                  className="w-full h-full object-cover hover:opacity-90 transition-opacity"
                  loading="lazy"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center">
                  <ImageIcon className="h-8 w-8 text-muted-foreground/50" />
                </div>
              )}
            </div>

            {/* Información del producto */}
            <div className="flex-1 min-w-0 space-y-2">
              <div className="flex items-start justify-between gap-1">
                <h3 className="text-base font-semibold line-clamp-2 flex-1 min-w-0">{product.nombre}</h3>
                <div className="flex items-center flex-shrink-0">
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={handleShare}
                    className="hover:bg-transparent h-8 w-8"
                  >
                    <Share2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
              
              <p className="text-xl font-bold text-foreground">
                {formatCurrency(product.precio)} / {product.unit}
              </p>
              
              {product.descripcion && (
                <div>
                  <p className="text-sm text-muted-foreground">
                    {truncatedDescription}
                  </p>
                  {hasLongDescription && (
                    <Button
                      variant="link"
                      size="sm"
                      className="p-0 h-auto text-primary"
                      onClick={() => setShowFullDescription(!showFullDescription)}
                    >
                      {showFullDescription ? (
                        <>
                          <ChevronUp className="h-3 w-3 mr-1" />
                          Ver menos
                        </>
                      ) : (
                        <>
                          <ChevronDown className="h-3 w-3 mr-1" />
                          Ver más
                        </>
                      )}
                    </Button>
                  )}
                </div>
              )}

              <div className="flex items-center gap-3 pt-1">
                <Badge variant={product.stock > 0 ? 'default' : 'secondary'}>
                  Stock: {product.stock}
                </Badge>
                {product.stock > 0 && (
                  <Button
                    onClick={() => onAddToCart({
                      id: product.id,
                      nombre: product.nombre,
                      precio: product.precio,
                      unit: product.unit,
                      personIndex: selectedPersonIndex,
                    })}
                    size="sm"
                  >
                    <Plus className="h-4 w-4 mr-1" />
                    Agregar
                  </Button>
                )}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Lightbox para ver foto grande */}
      <Dialog open={isLightboxOpen} onOpenChange={setIsLightboxOpen}>
        <DialogContent className="max-w-[95vw] max-h-[95vh] p-0 bg-transparent border-none">
          {photo && (
            <img
              src={photo.url}
              alt={photo.alt_text || product.nombre}
              className="w-full h-full object-contain max-h-[90vh] rounded-lg"
              onClick={() => setIsLightboxOpen(false)}
            />
          )}
        </DialogContent>
      </Dialog>
    </>
  );
};
