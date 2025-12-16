import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Skeleton } from '@/components/ui/skeleton';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Gift } from 'lucide-react';

interface ListingPhoto {
  id: string;
  url: string;
  alt_text: string | null;
}

interface ListingPhotoCarouselProps {
  listingId: string;
}

export function ListingPhotoCarousel({ listingId }: ListingPhotoCarouselProps) {
  const [photo, setPhoto] = useState<ListingPhoto | null>(null);
  const [loading, setLoading] = useState(true);
  const [isLightboxOpen, setIsLightboxOpen] = useState(false);

  useEffect(() => {
    loadPhoto();
  }, [listingId]);

  const loadPhoto = async () => {
    try {
      const { data, error } = await supabase
        .from('fotos_listings')
        .select('id, url, alt_text')
        .eq('listing_id', listingId)
        .eq('es_principal', true)
        .limit(1)
        .maybeSingle();

      if (error) throw error;
      setPhoto(data);
    } catch (error) {
      console.error('Error loading listing photo:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return <Skeleton className="w-full h-full" />;
  }

  if (!photo) {
    return (
      <div className="w-full h-full flex flex-col items-center justify-center bg-primary/10">
        <Gift className="h-12 w-12 text-primary/50 mb-2" />
        <span className="text-sm text-muted-foreground">Cosa gratis</span>
      </div>
    );
  }

  return (
    <>
      <img
        src={photo.url}
        alt={photo.alt_text || 'Foto del artículo'}
        className="w-full h-full object-cover cursor-pointer hover:opacity-90 transition-opacity"
        onClick={() => setIsLightboxOpen(true)}
      />
      
      <Dialog open={isLightboxOpen} onOpenChange={setIsLightboxOpen}>
        <DialogContent className="max-w-[95vw] max-h-[95vh] p-0 bg-transparent border-none">
          <img
            src={photo.url}
            alt={photo.alt_text || 'Foto del artículo'}
            className="w-full h-full object-contain max-h-[90vh]"
            onClick={() => setIsLightboxOpen(false)}
          />
        </DialogContent>
      </Dialog>
    </>
  );
}
