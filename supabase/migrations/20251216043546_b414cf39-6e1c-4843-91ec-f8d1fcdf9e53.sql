-- Add exported_at column to track exported orders
ALTER TABLE public.pedidos 
ADD COLUMN exported_at timestamp with time zone DEFAULT NULL;

-- Add comment for documentation
COMMENT ON COLUMN public.pedidos.exported_at IS 'Timestamp when the order was exported. NULL means not yet exported.';