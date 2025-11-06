
-- Agregar política RLS para que los miembros puedan ver los grupos a los que pertenecen
CREATE POLICY "Members can view their groups"
ON tracking_groups
FOR SELECT
USING (
  EXISTS (
    SELECT 1
    FROM tracking_group_members
    WHERE tracking_group_members.group_id = tracking_groups.id
      AND tracking_group_members.user_id = auth.uid()
  )
);
