-- Función para resetear el sequence de número de orden (sin eliminar pedidos)
CREATE OR REPLACE FUNCTION public.reset_order_sequence(proveedor_id_param uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Resetear la secuencia a 1
  -- Nota: Esto solo afecta los nuevos pedidos, no modifica los existentes
  ALTER SEQUENCE IF EXISTS pedidos_numero_orden_seq RESTART WITH 1;
END;
$$;