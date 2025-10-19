import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card } from '@/components/ui/card';
import { AspectRatio } from '@/components/ui/aspect-ratio';
import { Skeleton } from '@/components/ui/skeleton';
import { ImageIcon, ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
} from '@/components/ui/carousel';

interface ProductPhoto {
  id: string;
  url: string;
  alt_text: string | null;
  es_principal: boolean;
}

interface ProductPhotoCarouselProps {
  productoId: string;
}

export const ProductPhotoCarousel = ({ productoId }: ProductPhotoCarouselProps) => {
  const [photos, setPhotos] = useState<ProductPhoto[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadPhotos();
  }, [productoId]);

  const loadPhotos = async () => {
    try {
      console.log('🖼️ Cargando fotos para producto:', productoId);
      const { data, error } = await supabase
        .from('fotos_productos')
        .select('id, url, alt_text, es_principal')
        .eq('producto_id', productoId)
        .order('es_principal', { ascending: false });

      if (error) {
        console.error('❌ Error cargando fotos:', error);
        throw error;
      }
      
      console.log('📸 Fotos encontradas:', data?.length || 0, data);
      
      if (data && data.length > 0) {
        setPhotos(data);
      }
    } catch (error) {
      console.error('Error cargando fotos:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return <Skeleton className="w-full h-48" />;
  }

  if (photos.length === 0) {
    return (
      <Card className="flex items-center justify-center h-48 bg-muted">
        <div className="text-center text-muted-foreground">
          <ImageIcon className="h-12 w-12 mx-auto mb-2 opacity-50" />
          <p className="text-xs">Sin fotos</p>
        </div>
      </Card>
    );
  }

  if (photos.length === 1) {
    return (
      <Card className="overflow-hidden">
        <AspectRatio ratio={16 / 9}>
          <img
            src={photos[0].url}
            alt={photos[0].alt_text || 'Foto del producto'}
            className="w-full h-full object-cover"
            loading="lazy"
          />
        </AspectRatio>
      </Card>
    );
  }

  return (
    <div className="relative">
      <Carousel className="w-full">
        <CarouselContent>
          {photos.map((photo) => (
            <CarouselItem key={photo.id}>
              <Card className="overflow-hidden">
                <AspectRatio ratio={16 / 9}>
                  <img
                    src={photo.url}
                    alt={photo.alt_text || 'Foto del producto'}
                    className="w-full h-full object-cover"
                    loading="lazy"
                  />
                </AspectRatio>
              </Card>
            </CarouselItem>
          ))}
        </CarouselContent>
        <CarouselPrevious className="left-2" />
        <CarouselNext className="right-2" />
      </Carousel>
      <div className="absolute bottom-2 left-1/2 transform -translate-x-1/2 bg-black/60 text-white text-xs px-2 py-1 rounded-full">
        {photos.length} fotos
      </div>
    </div>
  );
};
