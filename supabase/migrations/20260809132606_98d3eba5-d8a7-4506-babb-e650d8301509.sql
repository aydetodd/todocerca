-- ============================================================
-- 1. ESP32 credentials -> owner-only table
-- ============================================================
CREATE TABLE IF NOT EXISTS public.unidades_esp32_credenciales (
  unidad_id uuid PRIMARY KEY REFERENCES public.unidades_empresa(id) ON DELETE CASCADE,
  esp32_secret text,
  esp32_wifi_ssid text,
  esp32_wifi_password text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.unidades_esp32_credenciales TO authenticated;
GRANT ALL ON public.unidades_esp32_credenciales TO service_role;

ALTER TABLE public.unidades_esp32_credenciales ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owner proveedor manages esp32 credentials"
  ON public.unidades_esp32_credenciales
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.unidades_empresa u
      JOIN public.proveedores p ON p.id = u.proveedor_id
      WHERE u.id = unidades_esp32_credenciales.unidad_id
        AND p.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.unidades_empresa u
      JOIN public.proveedores p ON p.id = u.proveedor_id
      WHERE u.id = unidades_esp32_credenciales.unidad_id
        AND p.user_id = auth.uid()
    )
  );

-- Non-sensitive flag so the UI can still show "module configured"
ALTER TABLE public.unidades_empresa
  ADD COLUMN IF NOT EXISTS esp32_configurado boolean NOT NULL DEFAULT false;

-- Migrate existing credentials
INSERT INTO public.unidades_esp32_credenciales (unidad_id, esp32_secret, esp32_wifi_ssid, esp32_wifi_password)
SELECT id, esp32_secret, esp32_wifi_ssid, esp32_wifi_password
FROM public.unidades_empresa
WHERE esp32_secret IS NOT NULL OR esp32_wifi_ssid IS NOT NULL OR esp32_wifi_password IS NOT NULL
ON CONFLICT (unidad_id) DO NOTHING;

UPDATE public.unidades_empresa u
SET esp32_configurado = true
WHERE EXISTS (
  SELECT 1 FROM public.unidades_esp32_credenciales c
  WHERE c.unidad_id = u.id AND c.esp32_secret IS NOT NULL
);

ALTER TABLE public.unidades_empresa
  DROP COLUMN IF EXISTS esp32_secret,
  DROP COLUMN IF EXISTS esp32_wifi_ssid,
  DROP COLUMN IF EXISTS esp32_wifi_password;

CREATE OR REPLACE FUNCTION public.tg_sync_esp32_configurado()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    UPDATE public.unidades_empresa SET esp32_configurado = false WHERE id = OLD.unidad_id;
    RETURN OLD;
  END IF;
  UPDATE public.unidades_empresa
  SET esp32_configurado = (NEW.esp32_secret IS NOT NULL)
  WHERE id = NEW.unidad_id;
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_esp32_configurado ON public.unidades_esp32_credenciales;
CREATE TRIGGER trg_sync_esp32_configurado
  AFTER INSERT OR UPDATE OR DELETE ON public.unidades_esp32_credenciales
  FOR EACH ROW EXECUTE FUNCTION public.tg_sync_esp32_configurado();

-- ============================================================
-- 2. proveedores: remove account email from broadly readable table
-- ============================================================
ALTER TABLE public.proveedores DROP COLUMN IF EXISTS email;

-- ============================================================
-- 3. SECURITY DEFINER view -> security invoker
-- ============================================================
ALTER VIEW public.citizen_reports_public SET (security_invoker = on);

-- ============================================================
-- 4. Fix mutable search_path on project functions
-- ============================================================
ALTER FUNCTION public.tg_profiles_lock_nivel2() SET search_path = public;
ALTER FUNCTION public.tg_ruta_solicitud_touch() SET search_path = public;

-- ============================================================
-- 5. Revoke EXECUTE on internal SECURITY DEFINER functions
--    (trigger functions + scheduled maintenance helpers)
-- ============================================================
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prosecdef
      AND (
        -- functions bound to triggers
        EXISTS (SELECT 1 FROM pg_trigger t WHERE t.tgfoid = p.oid)
        OR p.prorettype = 'trigger'::regtype
        -- scheduled maintenance helpers, never called from the client
        OR p.proname IN (
          'cleanup_expired_device_codes',
          'cleanup_expired_recovery_codes',
          'cleanup_expired_verification_codes',
          'cleanup_member_location',
          'qard_purge_movimientos_antiguos',
          'qard_rate_limit_purge',
          'qard_rate_limit_check',
          'reset_order_sequence'
        )
      )
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM anon, authenticated', r.sig);
  END LOOP;
END $$;

-- ============================================================
-- 6. storage.objects: writes require an authenticated session
-- ============================================================
ALTER POLICY "Authenticated users can upload listing photos" ON storage.objects TO authenticated;
ALTER POLICY "Authenticated users can upload product photos" ON storage.objects TO authenticated;
ALTER POLICY "Users can delete own listing photos" ON storage.objects TO authenticated;
ALTER POLICY "Users can delete their own uploaded photos" ON storage.objects TO authenticated;
ALTER POLICY "Users can update their own uploaded photos" ON storage.objects TO authenticated;