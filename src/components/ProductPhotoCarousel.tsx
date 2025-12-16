import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Skeleton } from '@/components/ui/skeleton';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { ImageIcon } from 'lucide-react';

interface ProductPhoto {
  id: string;
  url: string;
  alt_text: string | null;
}

interface ProductPhotoCarouselProps {
  productoId: string;
}

export const ProductPhotoCarousel = ({ productoId }: ProductPhotoCarouselProps) => {
  const [photo, setPhoto] = useState<ProductPhoto | null>(null);
  const [loading, setLoading] = useState(true);
  const [isLightboxOpen, setIsLightboxOpen] = useState(false);

  useEffect(() => {
    loadPhoto();
  }, [productoId]);

  const loadPhoto = async () => {
    try {
      const { data, error } = await supabase
        .from('fotos_productos')
        .select('id, url, alt_text')
        .eq('producto_id', productoId)
        .eq('es_principal', true)
        .limit(1)
        .maybeSingle();

      if (error) throw error;
      setPhoto(data);
    } catch (error) {
      console.error('Error cargando foto:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return <Skeleton className="w-full h-full" />;
  }

  if (!photo) {
    return (
      <div className="w-full h-full flex items-center justify-center bg-muted">
        <div className="text-center text-muted-foreground">
          <ImageIcon className="h-12 w-12 mx-auto mb-2 opacity-50" />
          <p className="text-xs">Sin fotos</p>
        </div>
      </div>
    );
  }

  return (
    <>
      <img
        src={photo.url}
        alt={photo.alt_text || 'Foto del producto'}
        className="w-full h-full object-cover cursor-pointer hover:opacity-90 transition-opacity"
        loading="lazy"
        onClick={() => setIsLightboxOpen(true)}
      />
      
      <Dialog open={isLightboxOpen} onOpenChange={setIsLightboxOpen}>
        <DialogContent className="max-w-[95vw] max-h-[95vh] p-0 bg-transparent border-none">
          <img
            src={photo.url}
            alt={photo.alt_text || 'Foto del producto'}
            className="w-full h-full object-contain max-h-[90vh]"
            onClick={() => setIsLightboxOpen(false)}
          />
        </DialogContent>
      </Dialog>
    </>
  );
};
