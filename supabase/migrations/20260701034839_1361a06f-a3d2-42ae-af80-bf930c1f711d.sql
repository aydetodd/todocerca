
-- ========================================
-- QaRd Fase 1 — Migración
-- ========================================

-- 1) Limpieza de datos de prueba antiguos (boletos y wallet familiar)
TRUNCATE TABLE public.movimientos_wallet CASCADE;
TRUNCATE TABLE public.sub_qr_saldo CASCADE;
TRUNCATE TABLE public.wallets_qr CASCADE;
TRUNCATE TABLE public.qr_tickets CASCADE;
TRUNCATE TABLE public.movimientos_boleto CASCADE;
TRUNCATE TABLE public.transacciones_boletos CASCADE;
TRUNCATE TABLE public.cuentas_boletos CASCADE;

-- 2) Columna qard_number en profiles (número único de 16 dígitos del titular con SS=00)
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS qard_number text UNIQUE,
  ADD COLUMN IF NOT EXISTS qard_nivel2_id uuid REFERENCES public.subdivisiones_nivel2(id);

-- 3) Secuencia por bucket (pais, estado, municipio)
CREATE TABLE IF NOT EXISTS public.qard_secuencia_municipio (
  pp text NOT NULL,
  ee text NOT NULL,
  mmm text NOT NULL,
  next_id integer NOT NULL DEFAULT 1,
  PRIMARY KEY (pp, ee, mmm)
);
GRANT SELECT ON public.qard_secuencia_municipio TO authenticated;
GRANT ALL  ON public.qard_secuencia_municipio TO service_role;
ALTER TABLE public.qard_secuencia_municipio ENABLE ROW LEVEL SECURITY;
CREATE POLICY "seq lectura autenticados" ON public.qard_secuencia_municipio FOR SELECT TO authenticated USING (true);

-- 4) Wallet QaRd
CREATE TABLE IF NOT EXISTS public.qard_wallets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  titular_user_id uuid NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  saldo_mxn numeric(12,2) NOT NULL DEFAULT 0,
  estado text NOT NULL DEFAULT 'activa' CHECK (estado IN ('activa','bloqueada')),
  telefono_lock text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (saldo_mxn >= -50)
);
GRANT SELECT, INSERT, UPDATE ON public.qard_wallets TO authenticated;
GRANT ALL ON public.qard_wallets TO service_role;
ALTER TABLE public.qard_wallets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "titular ve su wallet"   ON public.qard_wallets FOR SELECT TO authenticated USING (auth.uid() = titular_user_id);
CREATE POLICY "titular crea su wallet" ON public.qard_wallets FOR INSERT TO authenticated WITH CHECK (auth.uid() = titular_user_id);
CREATE TRIGGER qard_wallets_updated_at BEFORE UPDATE ON public.qard_wallets
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 5) Sub-QR familiares
CREATE TABLE IF NOT EXISTS public.qard_sub_qr (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  wallet_id uuid NOT NULL REFERENCES public.qard_wallets(id) ON DELETE CASCADE,
  titular_user_id uuid NOT NULL,
  sub_index integer NOT NULL CHECK (sub_index BETWEEN 0 AND 99),
  qard_number text NOT NULL UNIQUE,
  alias text NOT NULL DEFAULT 'Titular',
  limite_por_transaccion numeric(12,2),
  horario_inicio time,
  horario_fin time,
  estado text NOT NULL DEFAULT 'activa' CHECK (estado IN ('activa','cancelada')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (wallet_id, sub_index)
);
GRANT SELECT, INSERT, UPDATE ON public.qard_sub_qr TO authenticated;
GRANT ALL ON public.qard_sub_qr TO service_role;
ALTER TABLE public.qard_sub_qr ENABLE ROW LEVEL SECURITY;
CREATE POLICY "titular ve sus sub-qr"     ON public.qard_sub_qr FOR SELECT TO authenticated USING (auth.uid() = titular_user_id);
CREATE POLICY "titular crea sus sub-qr"   ON public.qard_sub_qr FOR INSERT TO authenticated WITH CHECK (auth.uid() = titular_user_id);
CREATE POLICY "titular edita sus sub-qr"  ON public.qard_sub_qr FOR UPDATE TO authenticated USING (auth.uid() = titular_user_id);
CREATE TRIGGER qard_sub_qr_updated_at BEFORE UPDATE ON public.qard_sub_qr
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 6) Movimientos QaRd
CREATE TABLE IF NOT EXISTS public.qard_movimientos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  wallet_id uuid NOT NULL REFERENCES public.qard_wallets(id) ON DELETE CASCADE,
  titular_user_id uuid NOT NULL,
  sub_qr_id uuid REFERENCES public.qard_sub_qr(id),
  tipo text NOT NULL CHECK (tipo IN ('recarga','cobro_comercio','devolucion','ajuste')),
  monto_mxn numeric(12,2) NOT NULL,
  saldo_despues numeric(12,2) NOT NULL,
  comercio_user_id uuid,
  comercio_nombre text,
  comision_mxn numeric(12,2) DEFAULT 0,
  neto_comercio_mxn numeric(12,2) DEFAULT 0,
  descripcion text,
  metadata jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_qard_mov_titular ON public.qard_movimientos(titular_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_qard_mov_comercio ON public.qard_movimientos(comercio_user_id, created_at DESC);
GRANT SELECT ON public.qard_movimientos TO authenticated;
GRANT ALL ON public.qard_movimientos TO service_role;
ALTER TABLE public.qard_movimientos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "titular ve sus movimientos"  ON public.qard_movimientos FOR SELECT TO authenticated USING (auth.uid() = titular_user_id);
CREATE POLICY "comercio ve sus cobros"      ON public.qard_movimientos FOR SELECT TO authenticated USING (auth.uid() = comercio_user_id);

-- 7) Función: obtener PP EE MMM para un user
CREATE OR REPLACE FUNCTION public.qard_bucket_for_user(_user_id uuid)
RETURNS TABLE(pp text, ee text, mmm text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_tel text;
  v_lada text;
  v_pp text := '00';
  v_ee text := '00';
  v_mmm text := '000';
  v_nivel2 uuid;
  v_nivel1 uuid;
  v_pais_id uuid;
  v_ee_num integer;
  v_mmm_num integer;
BEGIN
  SELECT telefono, qard_nivel2_id INTO v_tel, v_nivel2
  FROM profiles WHERE user_id = _user_id LIMIT 1;

  -- 1) PP desde lada
  IF v_tel IS NOT NULL THEN
    v_lada := regexp_replace(v_tel, '[^0-9]', '', 'g');
    -- Match código_telefono en tabla paises
    SELECT SUBSTRING(regexp_replace(codigo_telefono, '[^0-9]', '', 'g'), 1, 2) INTO v_pp
    FROM paises
    WHERE v_lada LIKE regexp_replace(codigo_telefono, '[^0-9]', '', 'g') || '%'
    ORDER BY length(regexp_replace(codigo_telefono, '[^0-9]', '', 'g')) DESC
    LIMIT 1;
    v_pp := COALESCE(LPAD(v_pp, 2, '0'), '00');
  END IF;

  -- 2) EE + MMM desde qard_nivel2_id
  IF v_nivel2 IS NOT NULL THEN
    SELECT n2.nivel1_id INTO v_nivel1 FROM subdivisiones_nivel2 n2 WHERE n2.id = v_nivel2;
    SELECT n1.pais_id  INTO v_pais_id FROM subdivisiones_nivel1 n1 WHERE n1.id = v_nivel1;

    -- Orden alfabético del estado dentro del país
    SELECT rn INTO v_ee_num FROM (
      SELECT id, ROW_NUMBER() OVER (ORDER BY LOWER(nombre)) AS rn
      FROM subdivisiones_nivel1 WHERE pais_id = v_pais_id
    ) t WHERE t.id = v_nivel1;

    -- Orden alfabético del municipio dentro del estado
    SELECT rn INTO v_mmm_num FROM (
      SELECT id, ROW_NUMBER() OVER (ORDER BY LOWER(nombre)) AS rn
      FROM subdivisiones_nivel2 WHERE nivel1_id = v_nivel1
    ) t WHERE t.id = v_nivel2;

    v_ee  := LPAD(COALESCE(v_ee_num, 0)::text, 2, '0');
    v_mmm := LPAD(COALESCE(v_mmm_num, 0)::text, 3, '0');
  END IF;

  RETURN QUERY SELECT v_pp, v_ee, v_mmm;
END;
$$;

-- 8) Función: generar / asegurar qard_number del titular (SS=00)
CREATE OR REPLACE FUNCTION public.qard_ensure_number(_user_id uuid)
RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_existing text;
  v_pp text; v_ee text; v_mmm text;
  v_next integer;
  v_number text;
BEGIN
  SELECT qard_number INTO v_existing FROM profiles WHERE user_id = _user_id;
  IF v_existing IS NOT NULL AND length(v_existing) = 16 THEN
    RETURN v_existing;
  END IF;

  SELECT * INTO v_pp, v_ee, v_mmm FROM public.qard_bucket_for_user(_user_id);

  -- Reservar next_id
  INSERT INTO qard_secuencia_municipio(pp, ee, mmm, next_id)
  VALUES (v_pp, v_ee, v_mmm, 2)
  ON CONFLICT (pp, ee, mmm)
  DO UPDATE SET next_id = qard_secuencia_municipio.next_id + 1
  RETURNING next_id - 1 INTO v_next;

  v_number := v_pp || v_ee || v_mmm || LPAD(v_next::text, 7, '0') || '00';
  UPDATE profiles SET qard_number = v_number WHERE user_id = _user_id;

  RETURN v_number;
END;
$$;

-- 9) Función: crear wallet + sub-qr titular (SS=00) para un user
CREATE OR REPLACE FUNCTION public.qard_ensure_wallet(_user_id uuid)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_wallet_id uuid;
  v_number text;
  v_apodo text;
BEGIN
  v_number := public.qard_ensure_number(_user_id);

  SELECT id INTO v_wallet_id FROM qard_wallets WHERE titular_user_id = _user_id;
  IF v_wallet_id IS NULL THEN
    INSERT INTO qard_wallets(titular_user_id) VALUES (_user_id) RETURNING id INTO v_wallet_id;
  END IF;

  SELECT COALESCE(apodo, nombre, 'Titular') INTO v_apodo FROM profiles WHERE user_id = _user_id;

  INSERT INTO qard_sub_qr(wallet_id, titular_user_id, sub_index, qard_number, alias)
  VALUES (v_wallet_id, _user_id, 0, v_number, v_apodo)
  ON CONFLICT (wallet_id, sub_index) DO NOTHING;

  RETURN v_wallet_id;
END;
$$;

-- 10) Trigger para nuevos profiles: genera qard_number automáticamente
CREATE OR REPLACE FUNCTION public.qard_on_profile_insert()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.qard_ensure_number(NEW.user_id);
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'qard_on_profile_insert error: %', SQLERRM;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_qard_on_profile_insert ON public.profiles;
CREATE TRIGGER trg_qard_on_profile_insert
AFTER INSERT ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.qard_on_profile_insert();

-- 11) Backfill: generar qard_number para todos los users existentes
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT user_id FROM profiles WHERE qard_number IS NULL LOOP
    PERFORM public.qard_ensure_number(r.user_id);
  END LOOP;
END $$;
