-- Crear tabla para invitaciones de tracking
CREATE TABLE IF NOT EXISTS public.tracking_invitations (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  group_id UUID NOT NULL REFERENCES public.tracking_groups(id) ON DELETE CASCADE,
  phone_number TEXT NOT NULL,
  nickname TEXT NOT NULL,
  invited_by UUID NOT NULL REFERENCES auth.users(id),
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'expired')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  expires_at TIMESTAMP WITH TIME ZONE DEFAULT (now() + interval '7 days'),
  UNIQUE(group_id, phone_number)
);

-- RLS policies para tracking_invitations
ALTER TABLE public.tracking_invitations ENABLE ROW LEVEL SECURITY;

-- Los dueños del grupo pueden ver y crear invitaciones
CREATE POLICY "Group owners can manage invitations"
ON public.tracking_invitations
FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM tracking_groups tg
    WHERE tg.id = tracking_invitations.group_id
    AND tg.owner_id = auth.uid()
  )
);

-- Los usuarios invitados pueden ver sus propias invitaciones
CREATE POLICY "Users can view their invitations"
ON public.tracking_invitations
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM profiles p
    WHERE p.telefono = tracking_invitations.phone_number
    AND p.user_id = auth.uid()
  )
);