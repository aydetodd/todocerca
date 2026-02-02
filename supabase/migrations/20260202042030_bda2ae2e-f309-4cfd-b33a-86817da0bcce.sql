-- Add field to indicate if price is a starting price ("desde...")
ALTER TABLE public.productos 
ADD COLUMN is_price_from boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.productos.is_price_from IS 'If true, the price is a starting price (Desde...), otherwise it is a fixed price';