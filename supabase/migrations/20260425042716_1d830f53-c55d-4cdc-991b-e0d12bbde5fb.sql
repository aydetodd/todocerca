-- Tabla de dispositivos de confianza
CREATE TABLE public.trusted_devices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  device_fingerprint text NOT NULL,
  device_name text,
  device_type text NOT NULL DEFAULT 'mobile', -- 'mobile' | 'desktop' | 'tablet'
  user_agent text,
  last_ip text,
  is_active boolean NOT NULL DEFAULT true,
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, device_fingerprint)
);

CREATE INDEX idx_trusted_devices_user ON public.trusted_devices(user_id, is_active);

ALTER TABLE public.trusted_devices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own trusted devices"
  ON public.trusted_devices FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own trusted devices"
  ON public.trusted_devices FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own trusted devices"
  ON public.trusted_devices FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own trusted devices"
  ON public.trusted_devices FOR DELETE
  USING (auth.uid() = user_id);

-- Tabla de códigos de verificación de dispositivo
CREATE TABLE public.device_verification_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  device_fingerprint text NOT NULL,
  code text NOT NULL,
  phone text NOT NULL,
  attempts int NOT NULL DEFAULT 0,
  used boolean NOT NULL DEFAULT false,
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '10 minutes'),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_device_verif_lookup ON public.device_verification_codes(user_id, device_fingerprint, used);

ALTER TABLE public.device_verification_codes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own verification codes"
  ON public.device_verification_codes FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own verification codes"
  ON public.device_verification_codes FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own verification codes"
  ON public.device_verification_codes FOR UPDATE
  USING (auth.uid() = user_id);

-- Función de limpieza automática
CREATE OR REPLACE FUNCTION public.cleanup_expired_device_codes()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM public.device_verification_codes
  WHERE expires_at < now() OR used = true;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_cleanup_device_codes
  AFTER INSERT ON public.device_verification_codes
  FOR EACH STATEMENT
  EXECUTE FUNCTION public.cleanup_expired_device_codes();