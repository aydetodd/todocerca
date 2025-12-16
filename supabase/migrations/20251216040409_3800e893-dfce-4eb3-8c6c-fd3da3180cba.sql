-- Create favorites table for products, providers, and listings
CREATE TABLE public.favoritos (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  tipo text NOT NULL CHECK (tipo IN ('producto', 'proveedor', 'listing')),
  producto_id uuid REFERENCES public.productos(id) ON DELETE CASCADE,
  proveedor_id uuid REFERENCES public.proveedores(id) ON DELETE CASCADE,
  listing_id uuid REFERENCES public.listings(id) ON DELETE CASCADE,
  precio_guardado numeric,
  stock_guardado integer,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE(user_id, producto_id),
  UNIQUE(user_id, proveedor_id),
  UNIQUE(user_id, listing_id)
);

-- Enable RLS
ALTER TABLE public.favoritos ENABLE ROW LEVEL SECURITY;

-- Users can view their own favorites
CREATE POLICY "Users can view own favorites"
ON public.favoritos FOR SELECT
USING (auth.uid() = user_id);

-- Users can add favorites
CREATE POLICY "Users can add favorites"
ON public.favoritos FOR INSERT
WITH CHECK (auth.uid() = user_id);

-- Users can delete their own favorites
CREATE POLICY "Users can delete own favorites"
ON public.favoritos FOR DELETE
USING (auth.uid() = user_id);

-- Enable realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.favoritos;