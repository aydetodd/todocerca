-- Actualizar el límite de productos de 50 a 500
CREATE OR REPLACE FUNCTION public.check_product_limit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF (SELECT COUNT(*) FROM productos WHERE proveedor_id = NEW.proveedor_id) >= 500 THEN
    RAISE EXCEPTION 'No se pueden registrar más de 500 productos por proveedor';
  END IF;
  RETURN NEW;
END;
$function$;