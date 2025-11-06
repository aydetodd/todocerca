-- =====================================================
-- SIMPLIFICAR AUTENTICACIÓN: Solo SMS, sin email ni código postal
-- =====================================================

-- 1. Hacer email y codigo_postal opcionales en profiles
ALTER TABLE profiles 
  ALTER COLUMN email DROP NOT NULL,
  ALTER COLUMN codigo_postal DROP NOT NULL;

-- 2. Agregar columna para verificación por SMS
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS phone_verified BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS phone_verification_code TEXT,
  ADD COLUMN IF NOT EXISTS phone_verification_expires_at TIMESTAMPTZ;

-- 3. Crear tabla para códigos de verificación SMS
CREATE TABLE IF NOT EXISTS phone_verification_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  phone TEXT NOT NULL,
  code TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '10 minutes'),
  used BOOLEAN DEFAULT FALSE,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE
);

-- Habilitar RLS
ALTER TABLE phone_verification_codes ENABLE ROW LEVEL SECURITY;

-- Políticas para phone_verification_codes
CREATE POLICY "Users can request verification codes"
  ON phone_verification_codes
  FOR INSERT
  WITH CHECK (TRUE);

CREATE POLICY "Users can view own verification codes"
  ON phone_verification_codes
  FOR SELECT
  USING (
    phone IN (
      SELECT telefono 
      FROM profiles 
      WHERE user_id = auth.uid()
    )
  );

-- Índice para búsqueda rápida
CREATE INDEX IF NOT EXISTS idx_phone_verification_codes_phone 
  ON phone_verification_codes(phone);

-- Trigger para limpiar códigos expirados
CREATE OR REPLACE FUNCTION cleanup_expired_verification_codes()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM phone_verification_codes
  WHERE expires_at < NOW() OR used = TRUE;
  RETURN NEW;
END;
$$;

CREATE TRIGGER cleanup_verification_codes_trigger
  AFTER INSERT ON phone_verification_codes
  FOR EACH STATEMENT
  EXECUTE FUNCTION cleanup_expired_verification_codes();

-- Comentarios
COMMENT ON TABLE phone_verification_codes IS 'Códigos de verificación SMS para registro de usuarios';
COMMENT ON COLUMN profiles.phone_verified IS 'Indica si el teléfono ha sido verificado por SMS';