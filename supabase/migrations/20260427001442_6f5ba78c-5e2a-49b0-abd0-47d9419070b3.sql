-- Tabla de sesión activa única por usuario
CREATE TABLE public.active_sessions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL UNIQUE,
  device_fingerprint TEXT NOT NULL,
  device_name TEXT,
  device_type TEXT,
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.active_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own active session"
ON public.active_sessions FOR SELECT
USING (user_id = auth.uid());

CREATE POLICY "Users can insert their own active session"
ON public.active_sessions FOR INSERT
WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update their own active session"
ON public.active_sessions FOR UPDATE
USING (user_id = auth.uid());

CREATE POLICY "Users can delete their own active session"
ON public.active_sessions FOR DELETE
USING (user_id = auth.uid());

CREATE INDEX idx_active_sessions_user ON public.active_sessions(user_id);
CREATE INDEX idx_active_sessions_fingerprint ON public.active_sessions(device_fingerprint);