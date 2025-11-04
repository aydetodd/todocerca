-- Eliminar la política problemática que causa recursión
DROP POLICY IF EXISTS "Users can accept valid invitations" ON tracking_group_members;
DROP POLICY IF EXISTS "Group members can view other members" ON tracking_group_members;

-- Crear función para verificar si un usuario es miembro del grupo (security definer evita recursión)
CREATE OR REPLACE FUNCTION public.is_tracking_group_member(_user_id uuid, _group_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM tracking_group_members
    WHERE user_id = _user_id
      AND group_id = _group_id
  )
$$;

-- Crear función para verificar si hay invitación válida (security definer evita recursión)
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
    JOIN profiles p ON p.telefono = ti.phone_number
    WHERE ti.group_id = _group_id
      AND p.user_id = _user_id
      AND ti.status = 'pending'
      AND ti.expires_at > now()
  )
$$;

-- Recrear política para ver miembros usando la función
CREATE POLICY "Group members can view other members"
ON tracking_group_members
FOR SELECT
USING (public.is_tracking_group_member(auth.uid(), group_id));

-- Crear política para aceptar invitaciones usando la función
CREATE POLICY "Users can accept valid invitations"
ON tracking_group_members
FOR INSERT
WITH CHECK (
  user_id = auth.uid() 
  AND public.has_valid_tracking_invitation(auth.uid(), group_id)
);