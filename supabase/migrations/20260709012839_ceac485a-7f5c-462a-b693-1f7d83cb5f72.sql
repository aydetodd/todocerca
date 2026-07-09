ALTER TABLE public.qard_movimientos DROP CONSTRAINT IF EXISTS qard_movimientos_tipo_check;
ALTER TABLE public.qard_movimientos ADD CONSTRAINT qard_movimientos_tipo_check
  CHECK (tipo = ANY (ARRAY[
    'recarga','cobro_comercio','devolucion','ajuste',
    'transfer_a_sub','transfer_desde_sub',
    'transferencia_p2p_out','transferencia_p2p_in',
    'retiro_oxxo','retiro_spei','retiro_qard'
  ]));