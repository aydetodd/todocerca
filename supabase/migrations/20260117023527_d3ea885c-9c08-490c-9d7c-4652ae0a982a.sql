-- Tabla para almacenar alertas SOS activas
CREATE TABLE public.sos_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  latitude DOUBLE PRECISION,
  longitude DOUBLE PRECISION,
  status TEXT NOT NULL DEFAULT 'active', -- active, cancelled, resolved
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT (now() + interval '30 minutes'),
  cancelled_at TIMESTAMP WITH TIME ZONE,
  resolved_at TIMESTAMP WITH TIME ZONE,
  share_token UUID NOT NULL DEFAULT gen_random_uuid()
);

-- Índices
CREATE INDEX idx_sos_alerts_user_id ON public.sos_alerts(user_id);
CREATE INDEX idx_sos_alerts_status ON public.sos_alerts(status);
CREATE INDEX idx_sos_alerts_share_token ON public.sos_alerts(share_token);
CREATE INDEX idx_sos_alerts_expires ON public.sos_alerts(expires_at) WHERE status = 'active';

-- Habilitar RLS
ALTER TABLE public.sos_alerts ENABLE ROW LEVEL SECURITY;

-- Políticas RLS
CREATE POLICY "Users can view their own SOS alerts"
ON public.sos_alerts FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can create SOS alerts"
ON public.sos_alerts FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own SOS alerts"
ON public.sos_alerts FOR UPDATE
USING (auth.uid() = user_id);

-- Cualquiera puede ver una alerta activa con el token (para compartir vía link)
CREATE POLICY "Anyone can view active SOS with valid token"
ON public.sos_alerts FOR SELECT
USING (status = 'active' AND expires_at > now());

-- Habilitar realtime
ALTER PUBLICATION supabase_realtime ADD TABLE sos_alerts;