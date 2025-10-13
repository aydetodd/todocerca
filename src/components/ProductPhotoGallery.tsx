import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card } from '@/components/ui/card';
import { AspectRatio } from '@/components/ui/aspect-ratio';
import { Skeleton } from '@/components/ui/skeleton';
import { ImageIcon } from 'lucide-react';

interface ProductPhoto {
  id: string;
  url: string;
  alt_text: string | null;
  es_principal: boolean;
}

interface ProductPhotoGalleryProps {
  productoId: string;
}

export const ProductPhotoGallery = ({ productoId }: ProductPhotoGalleryProps) => {
  const [photos, setPhotos] = useState<ProductPhoto[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedPhoto, setSelectedPhoto] = useState<ProductPhoto | null>(null);

  useEffect(() => {
    loadPhotos();
  }, [productoId]);

  const loadPhotos = async () => {
    try {
      const { data, error } = await supabase
        .from('fotos_productos')
        .select('id, url, alt_text, es_principal')
        .eq('producto_id', productoId)
        .order('es_principal', { ascending: false });

      if (error) throw error;
      
      if (data && data.length > 0) {
        setPhotos(data);
        setSelectedPhoto(data[0]);
      }
    } catch (error) {
      console.error('Error cargando fotos:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-2">
        <Skeleton className="w-full h-48" />
        <div className="flex gap-2">
          <Skeleton className="w-16 h-16" />
          <Skeleton className="w-16 h-16" />
          <Skeleton className="w-16 h-16" />
        </div>
      </div>
    );
  }

  if (photos.length === 0) {
    return (
      <Card className="flex items-center justify-center h-48 bg-muted">
        <div className="text-center text-muted-foreground">
          <ImageIcon className="h-12 w-12 mx-auto mb-2 opacity-50" />
          <p className="text-sm">Sin fotos disponibles</p>
        </div>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      {/* Foto principal */}
      <Card className="overflow-hidden">
        <AspectRatio ratio={16 / 9}>
          <img
            src={selectedPhoto?.url}
            alt={selectedPhoto?.alt_text || 'Foto del producto'}
            className="w-full h-full object-cover"
            loading="lazy"
          />
        </AspectRatio>
      </Card>

      {/* Miniaturas */}
      {photos.length > 1 && (
        <div className="flex gap-2 overflow-x-auto pb-2">
          {photos.map((photo) => (
            <button
              key={photo.id}
              onClick={() => setSelectedPhoto(photo)}
              className={`flex-shrink-0 w-20 h-20 rounded-lg overflow-hidden border-2 transition-all ${
                selectedPhoto?.id === photo.id
                  ? 'border-primary ring-2 ring-primary ring-offset-2'
                  : 'border-transparent hover:border-primary/50'
              }`}
            >
              <img
                src={photo.url}
                alt={photo.alt_text || 'Miniatura'}
                className="w-full h-full object-cover"
                loading="lazy"
              />
            </button>
          ))}
        </div>
      )}
    </div>
  );
};
