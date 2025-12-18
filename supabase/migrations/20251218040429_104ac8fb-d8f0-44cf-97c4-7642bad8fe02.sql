-- Add estado and municipio columns to listings table for location-based filtering
ALTER TABLE public.listings 
ADD COLUMN estado text,
ADD COLUMN municipio text;