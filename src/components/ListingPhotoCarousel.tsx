import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Skeleton } from '@/components/ui/skeleton';
import { Gift } from 'lucide-react';
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
} from "@/components/ui/carousel";

interface ListingPhoto {
  id: string;
  url: string;
  alt_text: string | null;
}

interface ListingPhotoCarouselProps {
  listingId: string;
}

export function ListingPhotoCarousel({ listingId }: ListingPhotoCarouselProps) {
  const [photos, setPhotos] = useState<ListingPhoto[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadPhotos();
  }, [listingId]);

  const loadPhotos = async () => {
    try {
      const { data, error } = await supabase
        .from('fotos_listings')
        .select('id, url, alt_text')
        .eq('listing_id', listingId)
        .order('es_principal', { ascending: false });

      if (error) throw error;
      setPhotos(data || []);
    } catch (error) {
      console.error('Error loading listing photos:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return <Skeleton className="w-full h-full" />;
  }

  if (photos.length === 0) {
    return (
      <div className="w-full h-full flex flex-col items-center justify-center bg-primary/10">
        <Gift className="h-12 w-12 text-primary/50 mb-2" />
        <span className="text-sm text-muted-foreground">Cosa gratis</span>
      </div>
    );
  }

  if (photos.length === 1) {
    return (
      <img
        src={photos[0].url}
        alt={photos[0].alt_text || 'Foto del artículo'}
        className="w-full h-full object-cover"
      />
    );
  }

  return (
    <Carousel className="w-full h-full">
      <CarouselContent className="h-full">
        {photos.map((photo) => (
          <CarouselItem key={photo.id} className="h-full">
            <img
              src={photo.url}
              alt={photo.alt_text || 'Foto del artículo'}
              className="w-full h-full object-cover"
            />
          </CarouselItem>
        ))}
      </CarouselContent>
      <CarouselPrevious className="left-2" />
      <CarouselNext className="right-2" />
    </Carousel>
  );
}
