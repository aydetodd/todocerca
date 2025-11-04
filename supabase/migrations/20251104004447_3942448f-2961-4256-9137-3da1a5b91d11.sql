-- Eliminar funciones y políticas anteriores
DROP POLICY IF EXISTS "Users can accept valid invitations" ON tracking_group_members;
DROP FUNCTION IF EXISTS public.has_valid_tracking_invitation(uuid, uuid);

-- Crear función mejorada para normalizar teléfonos y verificar invitaciones
CREATE OR REPLACE FUNCTION public.normalize_phone(phone text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT regexp_replace(phone, '[^0-9]', '', 'g')
$$;

-- Función mejorada que normaliza teléfonos para comparar
CREATE OR REPLACE FUNCTION public.has_valid_tracking_invitation(_user_id uuid, _group_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 
    FROM tracking_invitations ti
    JOIN profiles p ON normalize_phone(p.telefono) = normalize_phone(ti.phone_number)
    WHERE ti.group_id = _group_id
      AND p.user_id = _user_id
      AND ti.status = 'pending'
      AND ti.expires_at > now()
  )
$$;

-- Recrear política para aceptar invitaciones con mejor lógica
CREATE POLICY "Users can accept valid invitations"
ON tracking_group_members
FOR INSERT
WITH CHECK (
  user_id = auth.uid() 
  AND public.has_valid_tracking_invitation(auth.uid(), group_id)
);