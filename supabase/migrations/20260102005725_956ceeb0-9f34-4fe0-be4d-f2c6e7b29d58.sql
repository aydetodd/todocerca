-- ============================================
-- GPS TRACKER ENHANCED FEATURES
-- Historial, alertas, geocercas, control remoto
-- ============================================

-- 1. Tabla de historial de ubicaciones (almacena cada punto GPS)
CREATE TABLE public.gps_tracker_history (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tracker_id UUID NOT NULL REFERENCES public.gps_trackers(id) ON DELETE CASCADE,
  latitude DOUBLE PRECISION NOT NULL,
  longitude DOUBLE PRECISION NOT NULL,
  speed DOUBLE PRECISION,
  altitude DOUBLE PRECISION,
  course DOUBLE PRECISION,
  -- Datos adicionales de Flespi
  ignition BOOLEAN,
  engine_status BOOLEAN,
  odometer DOUBLE PRECISION,
  fuel_level DOUBLE PRECISION,
  external_voltage DOUBLE PRECISION,
  gsm_signal INTEGER,
  satellites INTEGER,
  hdop DOUBLE PRECISION,
  timestamp TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Índices para consultas eficientes
CREATE INDEX idx_gps_tracker_history_tracker_id ON public.gps_tracker_history(tracker_id);
CREATE INDEX idx_gps_tracker_history_timestamp ON public.gps_tracker_history(timestamp DESC);
CREATE INDEX idx_gps_tracker_history_tracker_timestamp ON public.gps_tracker_history(tracker_id, timestamp DESC);

-- 2. Tabla de geocercas
CREATE TABLE public.gps_geofences (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  group_id UUID NOT NULL REFERENCES public.tracking_groups(id) ON DELETE CASCADE,
  name VARCHAR(100) NOT NULL,
  description TEXT,
  -- Tipo: circle (centro + radio) o polygon (puntos)
  fence_type VARCHAR(20) NOT NULL DEFAULT 'circle' CHECK (fence_type IN ('circle', 'polygon')),
  -- Para círculo
  center_lat DOUBLE PRECISION,
  center_lng DOUBLE PRECISION,
  radius_meters DOUBLE PRECISION,
  -- Para polígono (array de puntos como JSON)
  polygon_points JSONB,
  -- Configuración de alertas
  alert_on_enter BOOLEAN DEFAULT false,
  alert_on_exit BOOLEAN DEFAULT true,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 3. Tabla de asignación de geocercas a trackers
CREATE TABLE public.gps_tracker_geofences (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tracker_id UUID NOT NULL REFERENCES public.gps_trackers(id) ON DELETE CASCADE,
  geofence_id UUID NOT NULL REFERENCES public.gps_geofences(id) ON DELETE CASCADE,
  is_inside BOOLEAN DEFAULT NULL,
  last_checked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(tracker_id, geofence_id)
);

-- 4. Tabla de alertas GPS
CREATE TABLE public.gps_alerts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tracker_id UUID NOT NULL REFERENCES public.gps_trackers(id) ON DELETE CASCADE,
  group_id UUID NOT NULL REFERENCES public.tracking_groups(id) ON DELETE CASCADE,
  alert_type VARCHAR(50) NOT NULL CHECK (alert_type IN (
    'speed_limit', 'geofence_enter', 'geofence_exit', 
    'low_battery', 'power_cut', 'ignition_on', 'ignition_off',
    'sos', 'vibration', 'engine_kill', 'offline'
  )),
  title VARCHAR(200) NOT NULL,
  message TEXT,
  latitude DOUBLE PRECISION,
  longitude DOUBLE PRECISION,
  speed DOUBLE PRECISION,
  -- Referencia opcional a geocerca
  geofence_id UUID REFERENCES public.gps_geofences(id) ON DELETE SET NULL,
  -- Estado de la alerta
  is_read BOOLEAN DEFAULT false,
  is_resolved BOOLEAN DEFAULT false,
  resolved_at TIMESTAMPTZ,
  resolved_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_gps_alerts_tracker_id ON public.gps_alerts(tracker_id);
CREATE INDEX idx_gps_alerts_group_id ON public.gps_alerts(group_id);
CREATE INDEX idx_gps_alerts_created_at ON public.gps_alerts(created_at DESC);
CREATE INDEX idx_gps_alerts_unread ON public.gps_alerts(group_id, is_read) WHERE is_read = false;

-- 5. Tabla de configuración de alertas por tracker
CREATE TABLE public.gps_tracker_settings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tracker_id UUID NOT NULL REFERENCES public.gps_trackers(id) ON DELETE CASCADE UNIQUE,
  -- Límites de velocidad
  speed_limit_kmh INTEGER DEFAULT 120,
  speed_alert_enabled BOOLEAN DEFAULT false,
  -- Control de motor
  engine_kill_enabled BOOLEAN DEFAULT false,
  engine_kill_password VARCHAR(20),
  -- Alertas
  low_battery_threshold INTEGER DEFAULT 20,
  battery_alert_enabled BOOLEAN DEFAULT true,
  power_cut_alert_enabled BOOLEAN DEFAULT true,
  ignition_alert_enabled BOOLEAN DEFAULT false,
  offline_alert_enabled BOOLEAN DEFAULT true,
  offline_threshold_minutes INTEGER DEFAULT 30,
  -- Odómetro
  odometer_offset DOUBLE PRECISION DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 6. Expandir tabla gps_trackers con más campos
ALTER TABLE public.gps_trackers 
ADD COLUMN IF NOT EXISTS ignition BOOLEAN,
ADD COLUMN IF NOT EXISTS engine_blocked BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS odometer DOUBLE PRECISION,
ADD COLUMN IF NOT EXISTS external_voltage DOUBLE PRECISION,
ADD COLUMN IF NOT EXISTS gsm_signal INTEGER,
ADD COLUMN IF NOT EXISTS satellites INTEGER;

-- 7. Expandir gps_tracker_locations
ALTER TABLE public.gps_tracker_locations
ADD COLUMN IF NOT EXISTS ignition BOOLEAN,
ADD COLUMN IF NOT EXISTS odometer DOUBLE PRECISION,
ADD COLUMN IF NOT EXISTS external_voltage DOUBLE PRECISION,
ADD COLUMN IF NOT EXISTS gsm_signal INTEGER,
ADD COLUMN IF NOT EXISTS satellites INTEGER;

-- 8. Habilitar RLS
ALTER TABLE public.gps_tracker_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gps_geofences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gps_tracker_geofences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gps_alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gps_tracker_settings ENABLE ROW LEVEL SECURITY;

-- 9. Políticas RLS para historial
CREATE POLICY "Members can view tracker history"
ON public.gps_tracker_history FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.gps_trackers gt
    JOIN public.tracking_group_members tgm ON gt.group_id = tgm.group_id
    WHERE gt.id = gps_tracker_history.tracker_id
    AND tgm.user_id = auth.uid()
  )
);

-- 10. Políticas RLS para geocercas
CREATE POLICY "Members can view geofences"
ON public.gps_geofences FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.tracking_group_members tgm
    WHERE tgm.group_id = gps_geofences.group_id
    AND tgm.user_id = auth.uid()
  )
);

CREATE POLICY "Owner can manage geofences"
ON public.gps_geofences FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM public.tracking_groups tg
    WHERE tg.id = gps_geofences.group_id
    AND tg.owner_id = auth.uid()
  )
);

-- 11. Políticas RLS para asignaciones geocerca-tracker
CREATE POLICY "Members can view tracker geofences"
ON public.gps_tracker_geofences FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.gps_trackers gt
    JOIN public.tracking_group_members tgm ON gt.group_id = tgm.group_id
    WHERE gt.id = gps_tracker_geofences.tracker_id
    AND tgm.user_id = auth.uid()
  )
);

CREATE POLICY "Owner can manage tracker geofences"
ON public.gps_tracker_geofences FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM public.gps_trackers gt
    JOIN public.tracking_groups tg ON gt.group_id = tg.id
    WHERE gt.id = gps_tracker_geofences.tracker_id
    AND tg.owner_id = auth.uid()
  )
);

-- 12. Políticas RLS para alertas
CREATE POLICY "Members can view alerts"
ON public.gps_alerts FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.tracking_group_members tgm
    WHERE tgm.group_id = gps_alerts.group_id
    AND tgm.user_id = auth.uid()
  )
);

CREATE POLICY "Members can update alerts they can view"
ON public.gps_alerts FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM public.tracking_group_members tgm
    WHERE tgm.group_id = gps_alerts.group_id
    AND tgm.user_id = auth.uid()
  )
);

-- 13. Políticas RLS para configuración
CREATE POLICY "Members can view tracker settings"
ON public.gps_tracker_settings FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.gps_trackers gt
    JOIN public.tracking_group_members tgm ON gt.group_id = tgm.group_id
    WHERE gt.id = gps_tracker_settings.tracker_id
    AND tgm.user_id = auth.uid()
  )
);

CREATE POLICY "Owner can manage tracker settings"
ON public.gps_tracker_settings FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM public.gps_trackers gt
    JOIN public.tracking_groups tg ON gt.group_id = tg.id
    WHERE gt.id = gps_tracker_settings.tracker_id
    AND tg.owner_id = auth.uid()
  )
);

-- 14. Trigger para updated_at
CREATE TRIGGER update_gps_geofences_updated_at
BEFORE UPDATE ON public.gps_geofences
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_gps_tracker_settings_updated_at
BEFORE UPDATE ON public.gps_tracker_settings
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();