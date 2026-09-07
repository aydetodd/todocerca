
-- 1) Campos nuevos en la identidad QaRd
ALTER TABLE public.qard_identidad
  ADD COLUMN IF NOT EXISTS account_opening_fee_pending boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS account_opening_fee_amount numeric(12,2) NOT NULL DEFAULT 10.00,
  ADD COLUMN IF NOT EXISTS verificamex_curp_validated boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS verificamex_ine_validated boolean NOT NULL DEFAULT false;

-- 2) QaRd Maestra (fila única)
CREATE TABLE IF NOT EXISTS public.master_qard_account (
  id uuid PRIMARY KEY DEFAULT '00000000-0000-0000-0000-000000000100'::uuid,
  qard_number text NOT NULL UNIQUE DEFAULT '5200000000000100',
  name text NOT NULL DEFAULT 'QaRd Maestra de TodoCerca',
  description text NOT NULL DEFAULT 'Cuenta maestra de comisiones y aperturas de cuenta',
  current_balance numeric(14,2) NOT NULL DEFAULT 0,
  total_commissions_earned numeric(14,2) NOT NULL DEFAULT 0,
  total_account_openings integer NOT NULL DEFAULT 0,
  total_reload_fees integer NOT NULL DEFAULT 0,
  total_withdrawal_fees numeric(14,2) NOT NULL DEFAULT 0,
  is_system_account boolean NOT NULL DEFAULT true,
  is_immutable boolean NOT NULL DEFAULT true,
  admin_only boolean NOT NULL DEFAULT true,
  last_reconciliation timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.master_qard_account TO authenticated;
GRANT ALL ON public.master_qard_account TO service_role;
ALTER TABLE public.master_qard_account ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Solo admin ve la QaRd Maestra" ON public.master_qard_account;
CREATE POLICY "Solo admin ve la QaRd Maestra"
  ON public.master_qard_account FOR SELECT TO authenticated
  USING (public.is_admin());

INSERT INTO public.master_qard_account (id) VALUES ('00000000-0000-0000-0000-000000000100')
ON CONFLICT (id) DO NOTHING;

-- No se puede borrar
CREATE OR REPLACE FUNCTION public.master_qard_no_delete()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  RAISE EXCEPTION 'La QaRd Maestra no se puede eliminar';
END; $$;

DROP TRIGGER IF EXISTS trg_master_qard_no_delete ON public.master_qard_account;
CREATE TRIGGER trg_master_qard_no_delete
  BEFORE DELETE ON public.master_qard_account
  FOR EACH ROW EXECUTE FUNCTION public.master_qard_no_delete();

-- 3) Movimientos de comisión
DO $$ BEGIN
  CREATE TYPE public.commission_type AS ENUM ('account_opening','reload_fee','withdrawal_fee');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.commission_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  master_qard_id uuid NOT NULL REFERENCES public.master_qard_account(id),
  user_id uuid,
  qard_number text,
  transaction_type public.commission_type NOT NULL,
  amount numeric(12,2) NOT NULL,
  original_amount numeric(12,2),
  percentage numeric(6,2),
  description text,
  spei_tracking_key text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_commission_created ON public.commission_transactions (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_commission_tipo ON public.commission_transactions (transaction_type);
CREATE INDEX IF NOT EXISTS idx_commission_qard ON public.commission_transactions (qard_number);

GRANT SELECT ON public.commission_transactions TO authenticated;
GRANT ALL ON public.commission_transactions TO service_role;
ALTER TABLE public.commission_transactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Solo admin ve comisiones" ON public.commission_transactions;
CREATE POLICY "Solo admin ve comisiones"
  ON public.commission_transactions FOR SELECT TO authenticated
  USING (public.is_admin());

-- 4) Cobro atómico de comisión a la QaRd Maestra
CREATE OR REPLACE FUNCTION public.qard_cobrar_comision(
  _user_id uuid,
  _tipo public.commission_type,
  _amount numeric,
  _original numeric DEFAULT NULL,
  _percentage numeric DEFAULT NULL,
  _descripcion text DEFAULT NULL,
  _clave_rastreo text DEFAULT NULL,
  _qard_number text DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_id uuid;
BEGIN
  IF _amount IS NULL OR _amount <= 0 THEN RETURN NULL; END IF;

  INSERT INTO public.commission_transactions(
    master_qard_id, user_id, qard_number, transaction_type, amount,
    original_amount, percentage, description, spei_tracking_key
  ) VALUES (
    '00000000-0000-0000-0000-000000000100', _user_id,
    COALESCE(_qard_number, (SELECT qard_number FROM public.profiles WHERE user_id = _user_id)),
    _tipo, _amount, _original, _percentage, _descripcion, _clave_rastreo
  ) RETURNING id INTO v_id;

  UPDATE public.master_qard_account SET
    current_balance = current_balance + _amount,
    total_commissions_earned = total_commissions_earned + _amount,
    total_account_openings = total_account_openings + CASE WHEN _tipo = 'account_opening' THEN 1 ELSE 0 END,
    total_reload_fees = total_reload_fees + CASE WHEN _tipo = 'reload_fee' THEN 1 ELSE 0 END,
    total_withdrawal_fees = total_withdrawal_fees + CASE WHEN _tipo = 'withdrawal_fee' THEN _amount ELSE 0 END,
    updated_at = now()
  WHERE id = '00000000-0000-0000-0000-000000000100';

  RETURN v_id;
END; $$;

-- 5) Comisión por retiro (2%)
CREATE OR REPLACE FUNCTION public.qard_comision_retiro(_user_id uuid, _monto numeric, _clave_rastreo text DEFAULT NULL)
RETURNS numeric
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_fee numeric;
BEGIN
  v_fee := round(COALESCE(_monto,0) * 0.02, 2);
  IF v_fee > 0 THEN
    PERFORM public.qard_cobrar_comision(
      _user_id, 'withdrawal_fee', v_fee, _monto, 2.00,
      'Comisión por retiro (2%) sobre $' || to_char(_monto,'FM999999990.00'), _clave_rastreo, NULL);
  END IF;
  RETURN v_fee;
END; $$;

-- 6) Depósito SPEI con comisiones automáticas
CREATE OR REPLACE FUNCTION public.stp_procesar_deposito(
  _clave_rastreo text, _monto numeric, _concepto text,
  _clabe_destino text DEFAULT NULL, _clabe_ordenante text DEFAULT NULL,
  _nombre_ordenante text DEFAULT NULL, _banco_ordenante text DEFAULT NULL,
  _payload jsonb DEFAULT '{}'::jsonb
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_dep public.stp_depositos%ROWTYPE;
  v_qard text; v_user uuid; v_wallet uuid; v_saldo numeric;
  v_tope numeric; v_usado numeric;
  v_apertura numeric := 0; v_recarga_fee numeric := 5.00; v_neto numeric;
  v_pendiente boolean := false; v_monto_apertura numeric := 10.00;
BEGIN
  IF _clave_rastreo IS NULL OR length(trim(_clave_rastreo)) = 0 THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'clave_rastreo_faltante');
  END IF;
  IF _monto IS NULL OR _monto <= 0 THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'monto_invalido');
  END IF;

  SELECT * INTO v_dep FROM public.stp_depositos WHERE clave_rastreo = _clave_rastreo;
  IF FOUND THEN
    RETURN jsonb_build_object('ok', true, 'duplicado', true, 'deposito_id', v_dep.id, 'estado', v_dep.estado);
  END IF;

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

  v_tope := public.stp_tope_mensual(v_user);
  v_usado := public.qard_recargas_mes(v_user);
  IF v_tope IS NOT NULL AND (v_usado + _monto) > v_tope THEN
    UPDATE public.stp_depositos SET estado='rejected', motivo='excede_tope_mensual', procesado_at=now() WHERE id=v_dep.id;
    RETURN jsonb_build_object('ok', false, 'deposito_id', v_dep.id, 'motivo', 'excede_tope_mensual',
                              'tope', v_tope, 'usado', v_usado, 'user_id', v_user);
  END IF;

  SELECT COALESCE(account_opening_fee_pending, true), COALESCE(account_opening_fee_amount, 10.00)
    INTO v_pendiente, v_monto_apertura
  FROM public.qard_identidad WHERE user_id = v_user;
  IF NOT FOUND THEN v_pendiente := true; v_monto_apertura := 10.00; END IF;

  IF v_pendiente THEN v_apertura := v_monto_apertura; END IF;

  v_neto := _monto - v_apertura - v_recarga_fee;
  IF v_neto <= 0 THEN
    UPDATE public.stp_depositos
       SET estado='rejected', motivo='monto_menor_a_comisiones', procesado_at=now()
     WHERE id=v_dep.id;
    RETURN jsonb_build_object('ok', false, 'deposito_id', v_dep.id, 'motivo', 'monto_menor_a_comisiones',
                              'user_id', v_user, 'comisiones', v_apertura + v_recarga_fee);
  END IF;

  v_wallet := public.qard_ensure_wallet(v_user);
  UPDATE public.qard_wallets SET saldo_mxn = saldo_mxn + v_neto WHERE id = v_wallet
  RETURNING saldo_mxn INTO v_saldo;

  INSERT INTO public.qard_movimientos(
    wallet_id, titular_user_id, tipo, monto_mxn, saldo_despues, comision_mxn, descripcion, metadata
  ) VALUES (
    v_wallet, v_user, 'recarga', v_neto, v_saldo, v_apertura + v_recarga_fee,
    'Recarga SPEI $' || to_char(_monto,'FM999999990.00') || ' MXN (neto acreditado)',
    jsonb_build_object('origen','stp','clave_rastreo',_clave_rastreo,'ordenante',_nombre_ordenante,
                       'monto_transferido',_monto,'apertura',v_apertura,'comision_recarga',v_recarga_fee)
  );

  IF v_apertura > 0 THEN
    PERFORM public.qard_cobrar_comision(v_user, 'account_opening', v_apertura, _monto, NULL,
      'Apertura de cuenta QaRd', _clave_rastreo, v_qard);
    UPDATE public.qard_identidad SET account_opening_fee_pending = false, updated_at = now()
     WHERE user_id = v_user;
  END IF;

  PERFORM public.qard_cobrar_comision(v_user, 'reload_fee', v_recarga_fee, _monto, NULL,
    'Comisión por recarga SPEI', _clave_rastreo, v_qard);

  UPDATE public.stp_depositos SET estado='completed', procesado_at=now() WHERE id=v_dep.id;

  RETURN jsonb_build_object('ok', true, 'deposito_id', v_dep.id, 'user_id', v_user,
                            'qard', v_qard, 'monto', _monto, 'apertura', v_apertura,
                            'comision_recarga', v_recarga_fee, 'neto', v_neto, 'saldo', v_saldo,
                            'primera_recarga', v_apertura > 0);
END; $$;
