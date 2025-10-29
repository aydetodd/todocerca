-- Crear tabla de grupos de tracking
CREATE TABLE IF NOT EXISTS public.tracking_groups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL DEFAULT 'Mi Grupo Familiar',
  subscription_status TEXT CHECK (subscription_status IN ('active', 'expired', 'cancelled')) DEFAULT 'active',
  subscription_end DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT max_one_group_per_owner UNIQUE (owner_id)
);

-- Crear tabla de miembros del grupo
CREATE TABLE IF NOT EXISTS public.tracking_group_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id UUID NOT NULL REFERENCES public.tracking_groups(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  phone_number TEXT,
  nickname TEXT NOT NULL,
  is_owner BOOLEAN DEFAULT false,
  joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(group_id, user_id)
);

-- Crear tabla de ubicaciones de miembros del grupo
CREATE TABLE IF NOT EXISTS public.tracking_member_locations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  group_id UUID NOT NULL REFERENCES public.tracking_groups(id) ON DELETE CASCADE,
  latitude DOUBLE PRECISION NOT NULL,
  longitude DOUBLE PRECISION NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, group_id)
);

-- Índices para rendimiento
CREATE INDEX IF NOT EXISTS idx_tracking_groups_owner ON public.tracking_groups(owner_id);
CREATE INDEX IF NOT EXISTS idx_tracking_members_group ON public.tracking_group_members(group_id);
CREATE INDEX IF NOT EXISTS idx_tracking_members_user ON public.tracking_group_members(user_id);
CREATE INDEX IF NOT EXISTS idx_tracking_locations_group ON public.tracking_member_locations(group_id);
CREATE INDEX IF NOT EXISTS idx_tracking_locations_user ON public.tracking_member_locations(user_id);

-- Habilitar RLS
ALTER TABLE public.tracking_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tracking_group_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tracking_member_locations ENABLE ROW LEVEL SECURITY;

-- Políticas para tracking_groups: solo el dueño puede ver/modificar su grupo
CREATE POLICY "Users can view their own group"
  ON public.tracking_groups FOR SELECT
  USING (owner_id = auth.uid());

CREATE POLICY "Users can insert their own group"
  ON public.tracking_groups FOR INSERT
  WITH CHECK (owner_id = auth.uid());

CREATE POLICY "Users can update their own group"
  ON public.tracking_groups FOR UPDATE
  USING (owner_id = auth.uid());

-- Políticas para tracking_group_members: solo miembros del grupo pueden ver a otros miembros
CREATE POLICY "Group members can view other members"
  ON public.tracking_group_members FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.tracking_group_members tm
      WHERE tm.group_id = tracking_group_members.group_id
      AND tm.user_id = auth.uid()
    )
  );

CREATE POLICY "Group owners can add members"
  ON public.tracking_group_members FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.tracking_groups tg
      WHERE tg.id = group_id
      AND tg.owner_id = auth.uid()
    )
  );

CREATE POLICY "Group owners can remove members"
  ON public.tracking_group_members FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.tracking_groups tg
      WHERE tg.id = group_id
      AND tg.owner_id = auth.uid()
    )
  );

-- Políticas para tracking_member_locations: solo miembros del grupo pueden ver ubicaciones
CREATE POLICY "Group members can view locations"
  ON public.tracking_member_locations FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.tracking_group_members tm
      WHERE tm.group_id = tracking_member_locations.group_id
      AND tm.user_id = auth.uid()
    )
  );

CREATE POLICY "Group members can update their own location"
  ON public.tracking_member_locations FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Group members can update their location"
  ON public.tracking_member_locations FOR UPDATE
  USING (user_id = auth.uid());

-- Trigger para actualizar updated_at
CREATE TRIGGER update_tracking_groups_updated_at
  BEFORE UPDATE ON public.tracking_groups
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Habilitar realtime para las ubicaciones
ALTER PUBLICATION supabase_realtime ADD TABLE public.tracking_member_locations;
ALTER TABLE public.tracking_member_locations REPLICA IDENTITY FULL;