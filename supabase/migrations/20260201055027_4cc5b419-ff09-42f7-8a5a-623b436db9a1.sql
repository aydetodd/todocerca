-- Agregar columna 'recibido' a pedidos para que el proveedor confirme recepción
ALTER TABLE public.pedidos ADD COLUMN IF NOT EXISTS recibido boolean DEFAULT false;