import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card } from '@/components/ui/card';
import { AspectRatio } from '@/components/ui/aspect-ratio';
import { Skeleton } from '@/components/ui/skeleton';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { ImageIcon, ChevronLeft, ChevronRight, X } from 'lucide-react';
import { Button } from '@/components/ui/button';

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
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState(0);

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

  const handlePhotoClick = (index: number) => {
    setLightboxIndex(index);
    setLightboxOpen(true);
  };

  const goToPrevious = () => {
    setLightboxIndex((prev) => (prev === 0 ? photos.length - 1 : prev - 1));
  };

  const goToNext = () => {
    setLightboxIndex((prev) => (prev === photos.length - 1 ? 0 : prev + 1));
  };

  return (
    <>
      <div className="space-y-3">
        {/* Foto principal */}
        <Card 
          className="overflow-hidden cursor-pointer hover:opacity-90 transition-opacity"
          onClick={() => handlePhotoClick(photos.findIndex(p => p.id === selectedPhoto?.id))}
        >
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
            {photos.map((photo, index) => (
              <button
                key={photo.id}
                onClick={() => {
                  setSelectedPhoto(photo);
                  handlePhotoClick(index);
                }}
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

      {/* Lightbox Modal */}
      <Dialog open={lightboxOpen} onOpenChange={setLightboxOpen}>
        <DialogContent className="max-w-[95vw] max-h-[95vh] p-0 bg-black/95 border-none">
          <div className="relative w-full h-[95vh] flex items-center justify-center">
            <Button
              variant="ghost"
              size="icon"
              className="absolute top-4 right-4 z-50 text-white hover:bg-white/20"
              onClick={() => setLightboxOpen(false)}
            >
              <X className="h-6 w-6" />
            </Button>

            {photos.length > 1 && (
              <>
                <Button
                  variant="ghost"
                  size="icon"
                  className="absolute left-4 z-50 text-white hover:bg-white/20"
                  onClick={goToPrevious}
                >
                  <ChevronLeft className="h-8 w-8" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="absolute right-4 z-50 text-white hover:bg-white/20"
                  onClick={goToNext}
                >
                  <ChevronRight className="h-8 w-8" />
                </Button>
              </>
            )}

            <img
              src={photos[lightboxIndex]?.url}
              alt={photos[lightboxIndex]?.alt_text || 'Foto del producto'}
              className="max-w-full max-h-full object-contain"
            />

            {photos.length > 1 && (
              <div className="absolute bottom-4 left-1/2 transform -translate-x-1/2 text-white text-sm bg-black/50 px-3 py-1 rounded-full">
                {lightboxIndex + 1} / {photos.length}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
};
