-- ============ CATÁLOGO DE SERVICIOS ============
CREATE TABLE public.qard_servicios_catalogo (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  nombre text NOT NULL,
  categoria text NOT NULL DEFAULT 'otro',
  icono text NOT NULL DEFAULT '🧾',
  referencia_label text NOT NULL DEFAULT 'Número de referencia',
  referencia_min_len integer NOT NULL DEFAULT 4,
  referencia_max_len integer NOT NULL DEFAULT 30,
  monto_min_mxn numeric NOT NULL DEFAULT 1,
  monto_max_mxn numeric NOT NULL DEFAULT 10000,
  comision_fija_mxn numeric NOT NULL DEFAULT 0,
  banco_nombre text,
  clabe_destino text,
  activo boolean NOT NULL DEFAULT true,
  orden integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.qard_servicios_catalogo TO anon;
GRANT SELECT ON public.qard_servicios_catalogo TO authenticated;
GRANT ALL ON public.qard_servicios_catalogo TO service_role;

ALTER TABLE public.qard_servicios_catalogo ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Servicios activos visibles para todos"
ON public.qard_servicios_catalogo FOR SELECT
USING (activo = true);

CREATE POLICY "Admins gestionan catalogo de servicios"
ON public.qard_servicios_catalogo FOR ALL
TO authenticated
USING (public.is_admin())
WITH CHECK (public.is_admin());

CREATE TRIGGER trg_qard_servicios_catalogo_updated
BEFORE UPDATE ON public.qard_servicios_catalogo
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============ PAGOS DE SERVICIO ============
CREATE TABLE public.qard_pagos_servicio (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  wallet_id uuid NOT NULL REFERENCES public.qard_wallets(id) ON DELETE CASCADE,
  servicio_id uuid NOT NULL REFERENCES public.qard_servicios_catalogo(id),
  servicio_nombre text NOT NULL,
  referencia text NOT NULL,
  monto_mxn numeric NOT NULL CHECK (monto_mxn > 0),
  comision_mxn numeric NOT NULL DEFAULT 0,
  total_mxn numeric NOT NULL CHECK (total_mxn > 0),
  estado text NOT NULL DEFAULT 'pendiente_envio',
  proveedor text NOT NULL DEFAULT 'fintoc',
  proveedor_transfer_id text,
  idempotency_key text NOT NULL UNIQUE,
  movimiento_id uuid REFERENCES public.qard_movimientos(id) ON DELETE SET NULL,
  error_msg text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_qard_pagos_servicio_user ON public.qard_pagos_servicio(user_id, created_at DESC);
CREATE INDEX idx_qard_pagos_servicio_estado ON public.qard_pagos_servicio(estado);

GRANT SELECT ON public.qard_pagos_servicio TO authenticated;
GRANT ALL ON public.qard_pagos_servicio TO service_role;

ALTER TABLE public.qard_pagos_servicio ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Usuario ve sus pagos de servicio"
ON public.qard_pagos_servicio FOR SELECT
TO authenticated
USING (user_id = auth.uid() OR public.is_admin());

CREATE TRIGGER trg_qard_pagos_servicio_updated
BEFORE UPDATE ON public.qard_pagos_servicio
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============ FUNCIÓN: COBRAR EL PAGO DE SERVICIO ============
CREATE OR REPLACE FUNCTION public.qard_pagar_servicio(
  _user_id uuid,
  _servicio_id uuid,
  _referencia text,
  _monto numeric,
  _idem text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_srv public.qard_servicios_catalogo%ROWTYPE;
  v_wallet public.qard_wallets%ROWTYPE;
  v_total numeric;
  v_nuevo numeric;
  v_mov_id uuid;
  v_pago_id uuid;
  v_existing public.qard_pagos_servicio%ROWTYPE;
BEGIN
  SELECT * INTO v_existing FROM public.qard_pagos_servicio WHERE idempotency_key = _idem;
  IF FOUND THEN
    RETURN jsonb_build_object('ok', true, 'duplicado', true, 'pago_id', v_existing.id,
      'estado', v_existing.estado, 'total_mxn', v_existing.total_mxn);
  END IF;

  SELECT * INTO v_srv FROM public.qard_servicios_catalogo WHERE id = _servicio_id AND activo = true;
  IF NOT FOUND THEN RAISE EXCEPTION 'Servicio no disponible'; END IF;

  IF _referencia IS NULL OR length(btrim(_referencia)) < v_srv.referencia_min_len
     OR length(btrim(_referencia)) > v_srv.referencia_max_len THEN
    RAISE EXCEPTION 'Referencia inválida para %', v_srv.nombre;
  END IF;

  IF _monto < v_srv.monto_min_mxn OR _monto > v_srv.monto_max_mxn THEN
    RAISE EXCEPTION 'Monto fuera de rango (% - %)', v_srv.monto_min_mxn, v_srv.monto_max_mxn;
  END IF;

  v_total := round(_monto + v_srv.comision_fija_mxn, 2);

  PERFORM public.qard_ensure_wallet(_user_id);
  SELECT * INTO v_wallet FROM public.qard_wallets WHERE titular_user_id = _user_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Sin billetera QaRd'; END IF;
  IF v_wallet.estado <> 'activa' THEN RAISE EXCEPTION 'Billetera %', v_wallet.estado; END IF;

  IF v_wallet.saldo_mxn < v_total THEN
    RAISE EXCEPTION 'Saldo insuficiente. Tienes $% y necesitas $%',
      to_char(v_wallet.saldo_mxn, 'FM999999990.00'), to_char(v_total, 'FM999999990.00');
  END IF;

  v_nuevo := round(v_wallet.saldo_mxn - v_total, 2);

  UPDATE public.qard_wallets SET saldo_mxn = v_nuevo, updated_at = now() WHERE id = v_wallet.id;

  INSERT INTO public.qard_movimientos (
    wallet_id, titular_user_id, tipo, monto_mxn, saldo_despues,
    comercio_nombre, comision_mxn, descripcion, metadata
  ) VALUES (
    v_wallet.id, _user_id, 'pago_servicio', -v_total, v_nuevo,
    v_srv.nombre, v_srv.comision_fija_mxn,
    'Pago ' || v_srv.nombre || ' ref ' || btrim(_referencia),
    jsonb_build_object('servicio_slug', v_srv.slug, 'referencia', btrim(_referencia), 'idem', _idem)
  ) RETURNING id INTO v_mov_id;

  INSERT INTO public.qard_pagos_servicio (
    user_id, wallet_id, servicio_id, servicio_nombre, referencia,
    monto_mxn, comision_mxn, total_mxn, estado, idempotency_key, movimiento_id,
    metadata
  ) VALUES (
    _user_id, v_wallet.id, v_srv.id, v_srv.nombre, btrim(_referencia),
    _monto, v_srv.comision_fija_mxn, v_total, 'pendiente_envio', _idem, v_mov_id,
    jsonb_build_object('clabe_destino', v_srv.clabe_destino, 'banco', v_srv.banco_nombre)
  ) RETURNING id INTO v_pago_id;

  RETURN jsonb_build_object(
    'ok', true, 'duplicado', false, 'pago_id', v_pago_id,
    'servicio', v_srv.nombre, 'monto_mxn', _monto,
    'comision_mxn', v_srv.comision_fija_mxn, 'total_mxn', v_total,
    'saldo_despues', v_nuevo, 'estado', 'pendiente_envio'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.qard_pagar_servicio(uuid, uuid, text, numeric, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.qard_pagar_servicio(uuid, uuid, text, numeric, text) TO service_role;

-- ============ FUNCIÓN: REVERSAR PAGO FALLIDO ============
CREATE OR REPLACE FUNCTION public.qard_revertir_pago_servicio(_pago_id uuid, _motivo text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_pago public.qard_pagos_servicio%ROWTYPE;
  v_wallet public.qard_wallets%ROWTYPE;
  v_nuevo numeric;
BEGIN
  SELECT * INTO v_pago FROM public.qard_pagos_servicio WHERE id = _pago_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Pago no encontrado'; END IF;
  IF v_pago.estado IN ('reversado', 'pagado') THEN
    RETURN jsonb_build_object('ok', true, 'estado', v_pago.estado, 'sin_cambio', true);
  END IF;

  SELECT * INTO v_wallet FROM public.qard_wallets WHERE id = v_pago.wallet_id FOR UPDATE;
  v_nuevo := round(v_wallet.saldo_mxn + v_pago.total_mxn, 2);
  UPDATE public.qard_wallets SET saldo_mxn = v_nuevo, updated_at = now() WHERE id = v_wallet.id;

  INSERT INTO public.qard_movimientos (
    wallet_id, titular_user_id, tipo, monto_mxn, saldo_despues,
    comercio_nombre, descripcion, metadata
  ) VALUES (
    v_wallet.id, v_pago.user_id, 'devolucion', v_pago.total_mxn, v_nuevo,
    v_pago.servicio_nombre,
    'Devolución pago ' || v_pago.servicio_nombre || ': ' || coalesce(_motivo, 'envío fallido'),
    jsonb_build_object('pago_servicio_id', v_pago.id)
  );

  UPDATE public.qard_pagos_servicio
     SET estado = 'reversado', error_msg = _motivo, updated_at = now()
   WHERE id = v_pago.id;

  RETURN jsonb_build_object('ok', true, 'estado', 'reversado', 'saldo_despues', v_nuevo);
END;
$$;

REVOKE ALL ON FUNCTION public.qard_revertir_pago_servicio(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.qard_revertir_pago_servicio(uuid, text) TO service_role;