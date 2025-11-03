-- Política para permitir que usuarios acepten invitaciones válidas
CREATE POLICY "Users can accept valid invitations"
ON tracking_group_members
FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM tracking_invitations ti
    JOIN profiles p ON p.telefono = ti.phone_number
    WHERE ti.group_id = tracking_group_members.group_id
      AND p.user_id = auth.uid()
      AND p.user_id = tracking_group_members.user_id
      AND ti.status = 'pending'
      AND ti.expires_at > now()
  )
);