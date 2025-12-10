-- Tabla para registrar GPS trackers por IMEI
CREATE TABLE public.gps_trackers (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  group_id UUID NOT NULL REFERENCES public.tracking_groups(id) ON DELETE CASCADE,
  imei VARCHAR(20) NOT NULL UNIQUE,
  name VARCHAR(100) NOT NULL,
  model VARCHAR(50) DEFAULT 'GT06',
  is_active BOOLEAN DEFAULT true,
  battery_level INTEGER,
  last_seen TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Tabla para ubicaciones de GPS trackers
CREATE TABLE public.gps_tracker_locations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tracker_id UUID NOT NULL REFERENCES public.gps_trackers(id) ON DELETE CASCADE,
  latitude DOUBLE PRECISION NOT NULL,
  longitude DOUBLE PRECISION NOT NULL,
  speed DOUBLE PRECISION,
  altitude DOUBLE PRECISION,
  course DOUBLE PRECISION,
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Índices para performance
CREATE INDEX idx_gps_trackers_group_id ON public.gps_trackers(group_id);
CREATE INDEX idx_gps_trackers_imei ON public.gps_trackers(imei);
CREATE INDEX idx_gps_tracker_locations_tracker_id ON public.gps_tracker_locations(tracker_id);
CREATE INDEX idx_gps_tracker_locations_updated_at ON public.gps_tracker_locations(updated_at DESC);

-- Habilitar RLS
ALTER TABLE public.gps_trackers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gps_tracker_locations ENABLE ROW LEVEL SECURITY;

-- Políticas para gps_trackers
CREATE POLICY "Group owners can manage trackers"
ON public.gps_trackers FOR ALL
USING (EXISTS (
  SELECT 1 FROM tracking_groups tg
  WHERE tg.id = gps_trackers.group_id AND tg.owner_id = auth.uid()
));

CREATE POLICY "Group members can view trackers"
ON public.gps_trackers FOR SELECT
USING (is_tracking_group_member(auth.uid(), group_id));

-- Políticas para gps_tracker_locations
CREATE POLICY "Group members can view tracker locations"
ON public.gps_tracker_locations FOR SELECT
USING (EXISTS (
  SELECT 1 FROM gps_trackers gt
  JOIN tracking_group_members tgm ON tgm.group_id = gt.group_id
  WHERE gt.id = gps_tracker_locations.tracker_id AND tgm.user_id = auth.uid()
));

-- Política para webhook (sin auth, usa service role)
CREATE POLICY "Service role can insert locations"
ON public.gps_tracker_locations FOR INSERT
WITH CHECK (true);

CREATE POLICY "Service role can update trackers"
ON public.gps_trackers FOR UPDATE
USING (true);

-- Trigger para updated_at
CREATE TRIGGER update_gps_trackers_updated_at
BEFORE UPDATE ON public.gps_trackers
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Habilitar realtime
ALTER PUBLICATION supabase_realtime ADD TABLE gps_tracker_locations;