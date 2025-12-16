-- Crear tabla para fotos de listings (cosas regaladas)
CREATE TABLE public.fotos_listings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  listing_id UUID NOT NULL REFERENCES public.listings(id) ON DELETE CASCADE,
  url TEXT NOT NULL,
  nombre_archivo TEXT NOT NULL,
  alt_text TEXT,
  mime_type TEXT,
  file_size INTEGER,
  es_principal BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.fotos_listings ENABLE ROW LEVEL SECURITY;

-- Anyone can view listing photos (listings are public)
CREATE POLICY "Anyone can view listing photos"
ON public.fotos_listings
FOR SELECT
USING (true);

-- Users can insert photos for their own listings
CREATE POLICY "Users can insert photos for own listings"
ON public.fotos_listings
FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM listings l
    JOIN profiles p ON l.profile_id = p.id
    WHERE l.id = fotos_listings.listing_id
    AND p.user_id = auth.uid()
  )
);

-- Users can delete photos from their own listings
CREATE POLICY "Users can delete photos from own listings"
ON public.fotos_listings
FOR DELETE
USING (
  EXISTS (
    SELECT 1 FROM listings l
    JOIN profiles p ON l.profile_id = p.id
    WHERE l.id = fotos_listings.listing_id
    AND p.user_id = auth.uid()
  )
);

-- Create storage bucket for listing photos
INSERT INTO storage.buckets (id, name, public)
VALUES ('listing-photos', 'listing-photos', true)
ON CONFLICT (id) DO NOTHING;

-- Storage policies for listing photos
CREATE POLICY "Anyone can view listing photos storage"
ON storage.objects
FOR SELECT
USING (bucket_id = 'listing-photos');

CREATE POLICY "Authenticated users can upload listing photos"
ON storage.objects
FOR INSERT
WITH CHECK (bucket_id = 'listing-photos' AND auth.uid() IS NOT NULL);

CREATE POLICY "Users can delete own listing photos"
ON storage.objects
FOR DELETE
USING (bucket_id = 'listing-photos' AND auth.uid()::text = (storage.foldername(name))[1]);