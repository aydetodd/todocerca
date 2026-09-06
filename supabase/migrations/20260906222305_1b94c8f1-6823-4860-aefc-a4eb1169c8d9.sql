-- ============ CONFIG ============
CREATE TABLE public.stp_config (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  clabe_maestra text,
  beneficiario text DEFAULT 'TodoCerca',
  valor_udi_mxn numeric NOT NULL DEFAULT 8.60,
  stp_balance numeric NOT NULL DEFAULT 0,
  last_reconciliation timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.stp_config TO authenticated;
GRANT ALL ON public.stp_config TO service_role;
ALTER TABLE public.stp_config ENABLE ROW LEVEL SECURITY;
CREATE POLICY "stp_config_read_auth" ON public.stp_config FOR SELECT TO authenticated USING (true);
CREATE POLICY "stp_config_admin_all" ON public.stp_config FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
INSERT INTO public.stp_config(id) VALUES (true);

-- ============ DEPOSITOS ============
CREATE TABLE public.stp_depositos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clave_rastreo text NOT NULL UNIQUE,
  qard_number text,
  user_id uuid,
  monto_mxn numeric NOT NULL CHECK (monto_mxn > 0),
  concepto text,
  clabe_destino text,
  clabe_ordenante text,
  nombre_ordenante text,
  banco_ordenante text,
  estado text NOT NULL DEFAULT 'pending' CHECK (estado IN ('pending','completed','rejected','unmatched')),
  motivo text,
  stp_response jsonb NOT NULL DEFAULT '{}'::jsonb,
  webhook_received_at timestamptz NOT NULL DEFAULT now(),
  procesado_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_stp_depositos_qard ON public.stp_depositos(qard_number);
CREATE INDEX idx_stp_depositos_user ON public.stp_depositos(user_id, created_at DESC);
CREATE INDEX idx_stp_depositos_estado ON public.stp_depositos(estado, created_at DESC);
GRANT SELECT ON public.stp_depositos TO authenticated;
GRANT ALL ON public.stp_depositos TO service_role;
ALTER TABLE public.stp_depositos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "stp_depositos_own_read" ON public.stp_depositos FOR SELECT TO authenticated USING (user_id = auth.uid() OR public.is_admin());

-- ============ LOG DE WEBHOOKS ============
CREATE TABLE public.stp_webhook_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  deposito_id uuid REFERENCES public.stp_depositos(id) ON DELETE SET NULL,
  firma_valida boolean NOT NULL DEFAULT false,
  ip text,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  resultado text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_stp_webhook_log_fecha ON public.stp_webhook_log(created_at DESC);
GRANT ALL ON public.stp_webhook_log TO service_role;
ALTER TABLE public.stp_webhook_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "stp_webhook_log_admin" ON public.stp_webhook_log FOR SELECT TO authenticated USING (public.is_admin());

CREATE TRIGGER trg_stp_config_updated BEFORE UPDATE ON public.stp_config FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_stp_depositos_updated BEFORE UPDATE ON public.stp_depositos FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============ TOPE MENSUAL POR NIVEL (UDIS) ============
CREATE OR REPLACE FUNCTION public.stp_tope_mensual(_user_id uuid)
RETURNS numeric
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE _udis integer; _udi numeric; _base numeric;
BEGIN
  SELECT COALESCE(monthly_limit_udis, 0) INTO _udis FROM public.qard_identidad WHERE user_id = _user_id;
  SELECT COALESCE(valor_udi_mxn, 8.60) INTO _udi FROM public.stp_config WHERE id;
  SELECT tope INTO _base FROM public.qard_limite_recarga(_user_id);
  IF COALESCE(_udis,0) > 0 THEN
    IF _base IS NULL THEN RETURN _udis * _udi; END IF;
    RETURN LEAST(_base, _udis * _udi);
  END IF;
  RETURN _base;
END;
$$;

-- ============ PROCESAR DEPOSITO (idempotente) ============
CREATE OR REPLACE FUNCTION public.stp_procesar_deposito(
  _clave_rastreo text,
  _monto numeric,
  _concepto text,
  _clabe_destino text DEFAULT NULL,
  _clabe_ordenante text DEFAULT NULL,
  _nombre_ordenante text DEFAULT NULL,
  _banco_ordenante text DEFAULT NULL,
  _payload jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  v_dep public.stp_depositos%ROWTYPE;
  v_qard text;
  v_user uuid;
  v_wallet uuid;
  v_saldo numeric;
  v_tope numeric;
  v_usado numeric;
BEGIN
  IF _clave_rastreo IS NULL OR length(trim(_clave_rastreo)) = 0 THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'clave_rastreo_faltante');
  END IF;
  IF _monto IS NULL OR _monto <= 0 THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'monto_invalido');
  END IF;

  -- Idempotencia dura
  SELECT * INTO v_dep FROM public.stp_depositos WHERE clave_rastreo = _clave_rastreo;
  IF FOUND THEN
    RETURN jsonb_build_object('ok', true, 'duplicado', true, 'deposito_id', v_dep.id, 'estado', v_dep.estado);
  END IF;

  -- Extraer 16 dígitos de QaRd del concepto (tolerante a espacios/prefijo QR)
  v_qard := substring(regexp_replace(COALESCE(_concepto,''), '[^0-9]', '', 'g') FROM '\d{16}');

  INSERT INTO public.stp_depositos(
    clave_rastreo, qard_number, monto_mxn, concepto, clabe_destino,
    clabe_ordenante, nombre_ordenante, banco_ordenante, stp_response, estado
  ) VALUES (
    _clave_rastreo, v_qard, _monto, _concepto, _clabe_destino,
    _clabe_ordenante, _nombre_ordenante, _banco_ordenante, COALESCE(_payload,'{}'::jsonb), 'pending'
  ) RETURNING * INTO v_dep;

  IF v_qard IS NULL THEN
    UPDATE public.stp_depositos SET estado='unmatched', motivo='concepto_sin_qard', procesado_at=now() WHERE id=v_dep.id;
    RETURN jsonb_build_object('ok', false, 'deposito_id', v_dep.id, 'motivo', 'concepto_sin_qard');
  END IF;

  SELECT user_id INTO v_user FROM public.profiles WHERE qard_number = v_qard;
  IF v_user IS NULL THEN
    UPDATE public.stp_depositos SET estado='unmatched', motivo='qard_no_encontrada', procesado_at=now() WHERE id=v_dep.id;
    RETURN jsonb_build_object('ok', false, 'deposito_id', v_dep.id, 'motivo', 'qard_no_encontrada', 'qard', v_qard);
  END IF;

  UPDATE public.stp_depositos SET user_id = v_user WHERE id = v_dep.id;

  -- Tope mensual
  v_tope := public.stp_tope_mensual(v_user);
  v_usado := public.qard_recargas_mes(v_user);
  IF v_tope IS NOT NULL AND (v_usado + _monto) > v_tope THEN
    UPDATE public.stp_depositos
       SET estado='rejected', motivo='excede_tope_mensual', procesado_at=now()
     WHERE id=v_dep.id;
    RETURN jsonb_build_object('ok', false, 'deposito_id', v_dep.id, 'motivo', 'excede_tope_mensual',
                              'tope', v_tope, 'usado', v_usado, 'user_id', v_user);
  END IF;

  -- Acreditar
  v_wallet := public.qard_ensure_wallet(v_user);
  UPDATE public.qard_wallets
     SET saldo_mxn = saldo_mxn + _monto
   WHERE id = v_wallet
  RETURNING saldo_mxn INTO v_saldo;

  INSERT INTO public.qard_movimientos(
    wallet_id, titular_user_id, tipo, monto_mxn, saldo_despues, descripcion, metadata
  ) VALUES (
    v_wallet, v_user, 'recarga', _monto, v_saldo,
    'Recarga por transferencia SPEI $' || to_char(_monto,'FM999999990.00') || ' MXN',
    jsonb_build_object('origen','stp','clave_rastreo',_clave_rastreo,'ordenante',_nombre_ordenante)
  );

  UPDATE public.stp_depositos SET estado='completed', procesado_at=now() WHERE id=v_dep.id;

  RETURN jsonb_build_object('ok', true, 'deposito_id', v_dep.id, 'user_id', v_user,
                            'qard', v_qard, 'monto', _monto, 'saldo', v_saldo);
END;
$$;

REVOKE ALL ON FUNCTION public.stp_procesar_deposito(text,numeric,text,text,text,text,text,jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.stp_procesar_deposito(text,numeric,text,text,text,text,text,jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.stp_tope_mensual(uuid) TO authenticated, service_role;