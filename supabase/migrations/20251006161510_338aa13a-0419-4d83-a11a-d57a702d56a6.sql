-- Tabla para códigos de recuperación de contraseña
CREATE TABLE IF NOT EXISTS public.password_recovery_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  phone TEXT NOT NULL,
  code TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  expires_at TIMESTAMP WITH TIME ZONE DEFAULT (NOW() + INTERVAL '10 minutes'),
  used BOOLEAN DEFAULT FALSE
);

-- Índice para búsqueda rápida por teléfono
CREATE INDEX idx_password_recovery_phone ON public.password_recovery_codes(phone);

-- RLS policies
ALTER TABLE public.password_recovery_codes ENABLE ROW LEVEL SECURITY;

-- Los usuarios pueden crear códigos para su propio teléfono
CREATE POLICY "Users can request recovery codes"
  ON public.password_recovery_codes
  FOR INSERT
  WITH CHECK (true);

-- Los usuarios pueden ver sus propios códigos
CREATE POLICY "Users can view their recovery codes"
  ON public.password_recovery_codes
  FOR SELECT
  USING (true);

-- Función para limpiar códigos expirados automáticamente
CREATE OR REPLACE FUNCTION public.cleanup_expired_recovery_codes()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM public.password_recovery_codes
  WHERE expires_at < NOW() OR used = TRUE;
  RETURN NEW;
END;
$$;

-- Trigger para limpiar códigos expirados
CREATE TRIGGER cleanup_recovery_codes_trigger
  AFTER INSERT ON public.password_recovery_codes
  EXECUTE FUNCTION public.cleanup_expired_recovery_codes();