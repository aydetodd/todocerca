-- Fix the search_path issue for the function
CREATE OR REPLACE FUNCTION check_product_limit()
RETURNS TRIGGER 
LANGUAGE plpgsql
SECURITY DEFINER 
SET search_path = public
AS $$
BEGIN
  IF (SELECT COUNT(*) FROM productos WHERE proveedor_id = NEW.proveedor_id) >= 50 THEN
    RAISE EXCEPTION 'No se pueden registrar más de 50 productos por proveedor';
  END IF;
  RETURN NEW;
END;
$$;