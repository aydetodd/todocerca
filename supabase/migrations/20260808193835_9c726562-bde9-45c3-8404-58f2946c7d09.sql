
-- =====================================================================
-- PASO 1b: ARCHIVO ANTES DE PURGAR
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.qard_movimientos_archivo (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  movimiento_id uuid,
  titular_user_id uuid,
  data jsonb NOT NULL,
  original_created_at timestamptz,
  archived_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.qard_movimientos_archivo TO authenticated;
GRANT ALL ON public.qard_movimientos_archivo TO service_role;
ALTER TABLE public.qard_movimientos_archivo ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='qard_movimientos_archivo' AND policyname='Titular ve su archivo') THEN
    CREATE POLICY "Titular ve su archivo" ON public.qard_movimientos_archivo
      FOR SELECT TO authenticated USING (titular_user_id = auth.uid());
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS idx_qard_mov_archivo_titular ON public.qard_movimientos_archivo(titular_user_id, original_created_at DESC);

CREATE OR REPLACE FUNCTION public.qard_purge_movimientos_antiguos()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  INSERT INTO public.qard_movimientos_archivo (movimiento_id, titular_user_id, data, original_created_at)
  SELECT m.id, m.titular_user_id, to_jsonb(m), m.created_at
  FROM public.qard_movimientos m
  WHERE m.created_at < (now() - interval '2 months')
    AND NOT EXISTS (SELECT 1 FROM public.qard_movimientos_archivo a WHERE a.movimiento_id = m.id);

  DELETE FROM public.qard_movimientos
  WHERE created_at < (now() - interval '2 months');
END;
$function$;

-- =====================================================================
-- PASO 2: INMUTABILIDAD SELECTIVA
-- =====================================================================
CREATE OR REPLACE FUNCTION public.tg_inmutabilidad_financiera()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
DECLARE
  k text;
  o jsonb := to_jsonb(OLD);
  n jsonb := to_jsonb(NEW);
  ov text; nv text;
  protegido boolean;
BEGIN
  FOR k IN SELECT jsonb_object_keys(o) LOOP
    protegido := (
      k LIKE 'monto%' OR k LIKE 'saldo%' OR k LIKE 'comision%' OR k LIKE 'neto%'
      OR k LIKE 'importe%' OR k LIKE 'tarifa%' OR k LIKE 'precio%'
      OR k IN ('total','subtotal','bruto_mxn','created_at','id','wallet_id',
               'titular_user_id','user_id','sub_qr_id','comercio_user_id')
    );
    IF NOT protegido THEN CONTINUE; END IF;

    ov := o->>k;
    nv := n->>k;

    -- permitido: llenar por primera vez (NULL) o completar un cero
    IF ov IS NULL THEN CONTINUE; END IF;
    IF ov ~ '^-?[0-9]+(\.[0-9]+)?$' AND ov::numeric = 0 THEN CONTINUE; END IF;

    IF nv IS DISTINCT FROM ov THEN
      RAISE EXCEPTION 'Registro financiero inmutable: no se puede modificar "%" (% -> %)', k, ov, nv
        USING ERRCODE = 'check_violation';
    END IF;
  END LOOP;
  RETURN NEW;
END;
$function$;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'qard_movimientos','qard_pagos_servicio','qard_viajes_pasajero',
    'cobros_qr_tramo','movimientos_wallet','movimientos_boleto',
    'transacciones_boletos','liquidaciones_diarias','logs_validacion_qr',
    'audit_log_verificacion','validaciones_transporte_personal','intentos_fraude'
  ] LOOP
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name=t) THEN
      EXECUTE format('DROP TRIGGER IF EXISTS trg_inmutabilidad_%1$s ON public.%1$I', t);
      EXECUTE format('CREATE TRIGGER trg_inmutabilidad_%1$s BEFORE UPDATE ON public.%1$I FOR EACH ROW EXECUTE FUNCTION public.tg_inmutabilidad_financiera()', t);
    END IF;
  END LOOP;
END $$;

-- =====================================================================
-- PASO 3: CIFRADO DE CVV
-- =====================================================================
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

CREATE TABLE IF NOT EXISTS public.app_crypto_keys (
  nombre text PRIMARY KEY,
  valor text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
REVOKE ALL ON public.app_crypto_keys FROM anon, authenticated;
GRANT ALL ON public.app_crypto_keys TO service_role;
ALTER TABLE public.app_crypto_keys ENABLE ROW LEVEL SECURITY;

INSERT INTO public.app_crypto_keys (nombre, valor)
SELECT 'qard_master', encode(extensions.gen_random_bytes(32), 'hex')
WHERE NOT EXISTS (SELECT 1 FROM public.app_crypto_keys WHERE nombre = 'qard_master');

CREATE OR REPLACE FUNCTION public.qard_enc(_v text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public','extensions'
AS $function$
DECLARE k text;
BEGIN
  IF _v IS NULL OR _v = '' THEN RETURN _v; END IF;
  SELECT valor INTO k FROM public.app_crypto_keys WHERE nombre='qard_master';
  RETURN 'enc:v1:' || encode(extensions.pgp_sym_encrypt(_v, k), 'base64');
END;
$function$;

CREATE OR REPLACE FUNCTION public.qard_dec(_v text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public','extensions'
AS $function$
DECLARE k text; out_v text;
BEGIN
  IF _v IS NULL OR _v = '' THEN RETURN _v; END IF;
  IF left(_v, 7) <> 'enc:v1:' THEN RETURN _v; END IF;  -- legado en claro
  SELECT valor INTO k FROM public.app_crypto_keys WHERE nombre='qard_master';
  BEGIN
    out_v := extensions.pgp_sym_decrypt(decode(substring(_v from 8), 'base64'), k);
  EXCEPTION WHEN OTHERS THEN
    out_v := NULL;
  END;
  RETURN out_v;
END;
$function$;

REVOKE ALL ON FUNCTION public.qard_enc(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.qard_dec(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.qard_enc(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.qard_dec(text) TO service_role;

-- Migrar valores existentes a cifrado
UPDATE public.qard_sub_qr
   SET cvv = public.qard_enc(cvv)
 WHERE cvv IS NOT NULL AND left(cvv,7) <> 'enc:v1:';
UPDATE public.qard_sub_qr
   SET cvv_dinamico = public.qard_enc(cvv_dinamico)
 WHERE cvv_dinamico IS NOT NULL AND left(cvv_dinamico,7) <> 'enc:v1:';
UPDATE public.qard_wallets
   SET cvv_dinamico = public.qard_enc(cvv_dinamico)
 WHERE cvv_dinamico IS NOT NULL AND left(cvv_dinamico,7) <> 'enc:v1:';

-- Trigger de default: cifrar
CREATE OR REPLACE FUNCTION public.tg_set_cvv_default()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.cvv_dinamico IS NULL THEN
    NEW.cvv_dinamico := public.qard_enc(public.gen_cvv4());
  ELSIF left(NEW.cvv_dinamico, 7) <> 'enc:v1:' THEN
    NEW.cvv_dinamico := public.qard_enc(NEW.cvv_dinamico);
  END IF;
  IF TG_TABLE_NAME = 'qard_sub_qr' THEN
    IF NEW.cvv IS NOT NULL AND left(NEW.cvv, 7) <> 'enc:v1:' THEN
      NEW.cvv := public.qard_enc(NEW.cvv);
    END IF;
  END IF;
  RETURN NEW;
END $function$;

-- Rotación de CVV estático: guarda cifrado, devuelve en claro al titular
CREATE OR REPLACE FUNCTION public.qard_sub_qr_rotar_cvv(_sub_qr_id uuid, _nuevo_cvv text DEFAULT NULL::text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE v_titular uuid; v_nuevo text;
BEGIN
  SELECT titular_user_id INTO v_titular FROM public.qard_sub_qr WHERE id = _sub_qr_id;
  IF v_titular IS NULL THEN RAISE EXCEPTION 'Sub-QR no encontrado'; END IF;
  IF v_titular <> auth.uid() THEN RAISE EXCEPTION 'Solo el titular puede cambiar el CVV'; END IF;

  IF _nuevo_cvv IS NULL OR length(_nuevo_cvv) = 0 THEN
    v_nuevo := public.gen_cvv3();
  ELSE
    IF _nuevo_cvv !~ '^[0-9]{3}$' THEN RAISE EXCEPTION 'CVV debe ser exactamente 3 dígitos'; END IF;
    v_nuevo := _nuevo_cvv;
  END IF;

  UPDATE public.qard_sub_qr
     SET cvv = public.qard_enc(v_nuevo), cvv_updated_at = now()
   WHERE id = _sub_qr_id;

  RETURN v_nuevo;
END;
$function$;

-- Lectura descifrada solo para el titular
CREATE OR REPLACE FUNCTION public.qard_mis_cvv()
RETURNS TABLE(sub_qr_id uuid, qard_number text, cvv text, cvv_dinamico text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF auth.uid() IS NULL THEN RETURN; END IF;
  RETURN QUERY
  SELECT s.id, s.qard_number, public.qard_dec(s.cvv),
         CASE WHEN s.sub_index = 0
              THEN public.qard_dec(COALESCE(w.cvv_dinamico, s.cvv_dinamico))
              ELSE public.qard_dec(s.cvv_dinamico) END
  FROM public.qard_sub_qr s
  JOIN public.qard_wallets w ON w.id = s.wallet_id
  WHERE s.titular_user_id = auth.uid() OR w.titular_user_id = auth.uid();
END;
$function$;
GRANT EXECUTE ON FUNCTION public.qard_mis_cvv() TO authenticated, service_role;

-- Verificación de CVV para funciones de servicio (no expone el valor)
CREATE OR REPLACE FUNCTION public.qard_cvv_verificar(_qard_number text, _cvv text, _tipo text DEFAULT 'dinamico')
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE v_esperado text; v_sub_index int; v_sub text; v_wallet text; v_estatico text;
BEGIN
  SELECT s.sub_index, s.cvv_dinamico, w.cvv_dinamico, s.cvv
    INTO v_sub_index, v_sub, v_wallet, v_estatico
  FROM public.qard_sub_qr s JOIN public.qard_wallets w ON w.id = s.wallet_id
  WHERE s.qard_number = _qard_number LIMIT 1;
  IF v_sub_index IS NULL THEN RETURN false; END IF;

  IF _tipo = 'estatico' THEN
    v_esperado := public.qard_dec(v_estatico);
  ELSE
    v_esperado := public.qard_dec(CASE WHEN v_sub_index = 0 THEN COALESCE(v_wallet, v_sub) ELSE v_sub END);
  END IF;

  RETURN v_esperado IS NOT NULL
     AND v_esperado = regexp_replace(COALESCE(_cvv,''), '\D', '', 'g');
END;
$function$;
GRANT EXECUTE ON FUNCTION public.qard_cvv_verificar(text, text, text) TO authenticated, service_role;

-- P2P: comparar y rotar con cifrado
CREATE OR REPLACE FUNCTION public.qard_transfer_p2p(_from_numero16 text, _to_numero16 text, _cvv text, _monto numeric)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_from_sub_id uuid; v_from_wallet_id uuid; v_from_titular uuid;
  v_from_sub_index int; v_from_sub_saldo numeric; v_from_wallet_saldo numeric;
  v_to_sub_id uuid; v_to_wallet_id uuid; v_to_titular uuid;
  v_to_sub_index int; v_to_cvv_sub text; v_to_cvv_wallet text; v_to_cvv_expected text;
  v_new_cvv text; v_new_cvv_enc text;
  v_from_new_saldo numeric; v_to_new_saldo numeric; v_same_owner boolean;
BEGIN
  IF v_uid IS NULL THEN RETURN jsonb_build_object('ok', false, 'error', 'Sesión requerida'); END IF;
  IF _monto IS NULL OR _monto <= 0 THEN RETURN jsonb_build_object('ok', false, 'error', 'Monto inválido'); END IF;
  IF _from_numero16 IS NULL OR _to_numero16 IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Faltan datos');
  END IF;
  IF _from_numero16 = _to_numero16 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Origen y destino son la misma cuenta');
  END IF;

  SELECT s.id, s.wallet_id, s.sub_index, s.saldo_mxn, w.titular_user_id, w.saldo_mxn
    INTO v_from_sub_id, v_from_wallet_id, v_from_sub_index, v_from_sub_saldo, v_from_titular, v_from_wallet_saldo
  FROM public.qard_sub_qr s JOIN public.qard_wallets w ON w.id = s.wallet_id
  WHERE s.qard_number = _from_numero16 AND w.titular_user_id = v_uid LIMIT 1;

  IF v_from_sub_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'La cuenta origen no te pertenece');
  END IF;

  IF v_from_sub_index = 0 THEN
    IF v_from_wallet_saldo < _monto THEN RETURN jsonb_build_object('ok', false, 'error', 'Saldo insuficiente'); END IF;
  ELSE
    IF v_from_sub_saldo < _monto THEN RETURN jsonb_build_object('ok', false, 'error', 'Saldo insuficiente en sub-QR'); END IF;
  END IF;

  SELECT s.id, s.wallet_id, s.sub_index, s.cvv_dinamico, w.titular_user_id, w.cvv_dinamico
    INTO v_to_sub_id, v_to_wallet_id, v_to_sub_index, v_to_cvv_sub, v_to_titular, v_to_cvv_wallet
  FROM public.qard_sub_qr s JOIN public.qard_wallets w ON w.id = s.wallet_id
  WHERE s.qard_number = _to_numero16 LIMIT 1;

  IF v_to_sub_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'La cuenta destino no existe');
  END IF;

  v_same_owner := (v_to_titular = v_uid);

  IF NOT v_same_owner THEN
    v_to_cvv_expected := public.qard_dec(
      CASE WHEN v_to_sub_index = 0 THEN COALESCE(v_to_cvv_wallet, v_to_cvv_sub) ELSE v_to_cvv_sub END);
    IF _cvv IS NULL OR length(regexp_replace(_cvv, '\D', '', 'g')) <> 4 THEN
      RETURN jsonb_build_object('ok', false, 'error', 'CVV dinámico requerido (4 dígitos)');
    END IF;
    IF v_to_cvv_expected IS NULL OR v_to_cvv_expected <> regexp_replace(_cvv, '\D', '', 'g') THEN
      RETURN jsonb_build_object('ok', false, 'error', 'CVV dinámico incorrecto');
    END IF;
  END IF;

  v_new_cvv := public.gen_cvv4();
  v_new_cvv_enc := public.qard_enc(v_new_cvv);

  IF v_from_sub_index = 0 THEN
    UPDATE public.qard_wallets SET saldo_mxn = saldo_mxn - _monto WHERE id = v_from_wallet_id
      RETURNING saldo_mxn INTO v_from_new_saldo;
    UPDATE public.qard_sub_qr SET saldo_mxn = saldo_mxn - _monto WHERE id = v_from_sub_id;
  ELSE
    UPDATE public.qard_sub_qr SET saldo_mxn = saldo_mxn - _monto WHERE id = v_from_sub_id
      RETURNING saldo_mxn INTO v_from_new_saldo;
  END IF;

  IF v_to_sub_index = 0 THEN
    UPDATE public.qard_wallets SET saldo_mxn = saldo_mxn + _monto, cvv_dinamico = v_new_cvv_enc
     WHERE id = v_to_wallet_id RETURNING saldo_mxn INTO v_to_new_saldo;
    UPDATE public.qard_sub_qr SET saldo_mxn = saldo_mxn + _monto, cvv_dinamico = v_new_cvv_enc
     WHERE id = v_to_sub_id;
  ELSE
    UPDATE public.qard_sub_qr SET saldo_mxn = saldo_mxn + _monto, cvv_dinamico = v_new_cvv_enc
     WHERE id = v_to_sub_id RETURNING saldo_mxn INTO v_to_new_saldo;
  END IF;

  INSERT INTO public.qard_movimientos (wallet_id, titular_user_id, sub_qr_id, tipo, monto_mxn, saldo_despues, descripcion, comercio_nombre)
  VALUES (v_from_wallet_id, v_from_titular, CASE WHEN v_from_sub_index = 0 THEN NULL ELSE v_from_sub_id END,
          'transferencia_p2p_out', _monto, COALESCE(v_from_new_saldo, 0),
          'Transferencia enviada a •••• ' || right(_to_numero16, 4), 'Transferencia P2P');

  INSERT INTO public.qard_movimientos (wallet_id, titular_user_id, sub_qr_id, tipo, monto_mxn, saldo_despues, descripcion, comercio_nombre)
  VALUES (v_to_wallet_id, v_to_titular, CASE WHEN v_to_sub_index = 0 THEN NULL ELSE v_to_sub_id END,
          'transferencia_p2p_in', _monto, COALESCE(v_to_new_saldo, 0),
          'Transferencia recibida de •••• ' || right(_from_numero16, 4), 'Transferencia P2P');

  RETURN jsonb_build_object('ok', true, 'nuevo_cvv_destino', v_new_cvv);
END;
$function$;

-- =====================================================================
-- PASO 4: PREPARACIÓN NUEVO PROVEEDOR DE PAGOS
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.pagos_config (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  proveedor_activo text NOT NULL DEFAULT 'stripe',
  retiros_habilitados boolean NOT NULL DEFAULT false,
  notas text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.pagos_config TO anon, authenticated;
GRANT ALL ON public.pagos_config TO service_role;
ALTER TABLE public.pagos_config ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='pagos_config' AND policyname='Config de pagos legible') THEN
    CREATE POLICY "Config de pagos legible" ON public.pagos_config FOR SELECT USING (true);
  END IF;
END $$;
INSERT INTO public.pagos_config (id) VALUES (true) ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.pagos_cuentas_virtuales (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  wallet_id uuid REFERENCES public.qard_wallets(id) ON DELETE SET NULL,
  proveedor text NOT NULL DEFAULT 'stp',
  clabe text UNIQUE,
  beneficiario text,
  estado text NOT NULL DEFAULT 'pending',
  proveedor_ref text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.pagos_cuentas_virtuales TO authenticated;
GRANT ALL ON public.pagos_cuentas_virtuales TO service_role;
ALTER TABLE public.pagos_cuentas_virtuales ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='pagos_cuentas_virtuales' AND policyname='Dueño ve su cuenta virtual') THEN
    CREATE POLICY "Dueño ve su cuenta virtual" ON public.pagos_cuentas_virtuales
      FOR SELECT TO authenticated USING (user_id = auth.uid());
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.pagos_transferencias (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  cuenta_virtual_id uuid REFERENCES public.pagos_cuentas_virtuales(id) ON DELETE SET NULL,
  proveedor text NOT NULL DEFAULT 'stp',
  direccion text NOT NULL DEFAULT 'outbound',
  monto_mxn numeric(12,2) NOT NULL,
  comision_mxn numeric(12,2) NOT NULL DEFAULT 0,
  clabe_destino text,
  beneficiario text,
  concepto text,
  estado text NOT NULL DEFAULT 'pending',
  proveedor_ref text,
  clave_rastreo text,
  idempotency_key text UNIQUE,
  error_mensaje text,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.pagos_transferencias TO authenticated;
GRANT ALL ON public.pagos_transferencias TO service_role;
ALTER TABLE public.pagos_transferencias ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='pagos_transferencias' AND policyname='Dueño ve sus transferencias') THEN
    CREATE POLICY "Dueño ve sus transferencias" ON public.pagos_transferencias
      FOR SELECT TO authenticated USING (user_id = auth.uid());
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS idx_pagos_transf_user ON public.pagos_transferencias(user_id, created_at DESC);

DROP TRIGGER IF EXISTS trg_touch_pagos_cv ON public.pagos_cuentas_virtuales;
CREATE TRIGGER trg_touch_pagos_cv BEFORE UPDATE ON public.pagos_cuentas_virtuales
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
DROP TRIGGER IF EXISTS trg_touch_pagos_tr ON public.pagos_transferencias;
CREATE TRIGGER trg_touch_pagos_tr BEFORE UPDATE ON public.pagos_transferencias
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
DROP TRIGGER IF EXISTS trg_touch_pagos_config ON public.pagos_config;
CREATE TRIGGER trg_touch_pagos_config BEFORE UPDATE ON public.pagos_config
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =====================================================================
-- PASO 5 (datos): revocar lectura pública de módulos en pausa
-- =====================================================================
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['taxi_requests','votaciones','votos','votacion_opciones',
    'votacion_miembros','votacion_solicitudes','sos_alerts','citizen_reports','citizen_report_votes'] LOOP
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name=t) THEN
      EXECUTE format('REVOKE ALL ON public.%I FROM anon', t);
    END IF;
  END LOOP;
END $$;
