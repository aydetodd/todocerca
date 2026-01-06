-- Sub-grupos de rastreadores GPS dentro de un tracking_group
CREATE TABLE public.gps_tracker_subgroups (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  group_id UUID NOT NULL REFERENCES public.tracking_groups(id) ON DELETE CASCADE,
  name VARCHAR(100) NOT NULL,
  description TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(group_id, name)
);

-- Dispositivos asignados a cada sub-grupo
CREATE TABLE public.gps_tracker_subgroup_devices (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  subgroup_id UUID NOT NULL REFERENCES public.gps_tracker_subgroups(id) ON DELETE CASCADE,
  tracker_id UUID NOT NULL REFERENCES public.gps_trackers(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(subgroup_id, tracker_id)
);

-- Miembros asignados a cada sub-grupo
CREATE TABLE public.gps_tracker_subgroup_members (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  subgroup_id UUID NOT NULL REFERENCES public.gps_tracker_subgroups(id) ON DELETE CASCADE,
  member_id UUID NOT NULL REFERENCES public.tracking_group_members(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(subgroup_id, member_id)
);

-- Índices para performance
CREATE INDEX idx_subgroups_group_id ON public.gps_tracker_subgroups(group_id);
CREATE INDEX idx_subgroup_devices_subgroup ON public.gps_tracker_subgroup_devices(subgroup_id);
CREATE INDEX idx_subgroup_devices_tracker ON public.gps_tracker_subgroup_devices(tracker_id);
CREATE INDEX idx_subgroup_members_subgroup ON public.gps_tracker_subgroup_members(subgroup_id);
CREATE INDEX idx_subgroup_members_member ON public.gps_tracker_subgroup_members(member_id);

-- Enable RLS
ALTER TABLE public.gps_tracker_subgroups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gps_tracker_subgroup_devices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gps_tracker_subgroup_members ENABLE ROW LEVEL SECURITY;

-- Función para verificar si el usuario es dueño del grupo
CREATE OR REPLACE FUNCTION public.is_tracking_group_owner(_user_id uuid, _group_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM tracking_groups
    WHERE id = _group_id
      AND owner_id = _user_id
  )
$$;

-- Políticas para gps_tracker_subgroups
CREATE POLICY "Members can view subgroups of their groups"
ON public.gps_tracker_subgroups
FOR SELECT
USING (
  public.is_tracking_group_member(auth.uid(), group_id)
);

CREATE POLICY "Owners can manage subgroups"
ON public.gps_tracker_subgroups
FOR ALL
USING (
  public.is_tracking_group_owner(auth.uid(), group_id)
);

-- Políticas para gps_tracker_subgroup_devices
CREATE POLICY "Members can view subgroup devices"
ON public.gps_tracker_subgroup_devices
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM gps_tracker_subgroups sg
    WHERE sg.id = subgroup_id
    AND public.is_tracking_group_member(auth.uid(), sg.group_id)
  )
);

CREATE POLICY "Owners can manage subgroup devices"
ON public.gps_tracker_subgroup_devices
FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM gps_tracker_subgroups sg
    WHERE sg.id = subgroup_id
    AND public.is_tracking_group_owner(auth.uid(), sg.group_id)
  )
);

-- Políticas para gps_tracker_subgroup_members
CREATE POLICY "Members can view subgroup members"
ON public.gps_tracker_subgroup_members
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM gps_tracker_subgroups sg
    WHERE sg.id = subgroup_id
    AND public.is_tracking_group_member(auth.uid(), sg.group_id)
  )
);

CREATE POLICY "Owners can manage subgroup members"
ON public.gps_tracker_subgroup_members
FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM gps_tracker_subgroups sg
    WHERE sg.id = subgroup_id
    AND public.is_tracking_group_owner(auth.uid(), sg.group_id)
  )
);

-- Trigger para updated_at
CREATE TRIGGER update_gps_tracker_subgroups_updated_at
BEFORE UPDATE ON public.gps_tracker_subgroups
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Función para obtener los trackers visibles para un usuario en un grupo
CREATE OR REPLACE FUNCTION public.get_visible_tracker_ids(_user_id uuid, _group_id uuid)
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  -- Si es dueño, ve todos los trackers del grupo
  SELECT gt.id
  FROM gps_trackers gt
  WHERE gt.group_id = _group_id
    AND public.is_tracking_group_owner(_user_id, _group_id)
  
  UNION
  
  -- Si no es dueño, solo ve trackers de sub-grupos donde está asignado
  SELECT DISTINCT sd.tracker_id
  FROM gps_tracker_subgroup_members sm
  JOIN gps_tracker_subgroups sg ON sg.id = sm.subgroup_id
  JOIN gps_tracker_subgroup_devices sd ON sd.subgroup_id = sg.id
  JOIN tracking_group_members tgm ON tgm.id = sm.member_id
  WHERE sg.group_id = _group_id
    AND tgm.user_id = _user_id
$$;