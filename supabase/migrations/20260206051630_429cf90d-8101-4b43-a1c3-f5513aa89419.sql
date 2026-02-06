-- Update is_invited_to_product to also recognize linked drivers (choferes_empresa)
CREATE OR REPLACE FUNCTION public.is_invited_to_product(p_producto_id uuid, p_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    -- Check passenger invitations (ruta_invitaciones)
    SELECT 1 FROM ruta_invitaciones ri
    JOIN profiles p ON normalize_phone(p.telefono) = normalize_phone(ri.telefono_invitado)
    WHERE ri.producto_id = p_producto_id
    AND p.user_id = p_user_id
  )
  OR EXISTS (
    -- Check if user is an active driver for the provider that owns this product
    SELECT 1 FROM choferes_empresa ce
    JOIN productos prod ON prod.proveedor_id = ce.proveedor_id
    WHERE prod.id = p_producto_id
    AND ce.user_id = p_user_id
    AND ce.is_active = true
  );
$$;