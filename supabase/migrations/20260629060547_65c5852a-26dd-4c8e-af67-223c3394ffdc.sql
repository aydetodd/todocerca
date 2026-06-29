
-- ============================================================
-- WALLET QR FAMILIAR — saldo recargable con sub-QR enmicables
-- ============================================================

-- 1) WALLET DEL TITULAR
CREATE TABLE public.wallets_qr (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE,
  saldo_mxn numeric(12,2) NOT NULL DEFAULT 0 CHECK (saldo_mxn >= 0),
  total_recargado numeric(12,2) NOT NULL DEFAULT 0,
  total_gastado numeric(12,2) NOT NULL DEFAULT 0,
  ultima_recarga_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE ON public.wallets_qr TO authenticated;
GRANT ALL ON public.wallets_qr TO service_role;

ALTER TABLE public.wallets_qr ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Titular ve su wallet"
  ON public.wallets_qr FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Titular crea su wallet"
  ON public.wallets_qr FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER trg_wallets_qr_updated
  BEFORE UPDATE ON public.wallets_qr
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


-- 2) SUB-QR FÍSICOS (cada QR enmicable)
CREATE TABLE public.sub_qr_saldo (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  titular_user_id uuid NOT NULL,
  wallet_id uuid NOT NULL REFERENCES public.wallets_qr(id) ON DELETE CASCADE,
  token text NOT NULL UNIQUE,
  folio_corto text NOT NULL UNIQUE,
  alias text NOT NULL,
  saldo_mxn numeric(12,2) NOT NULL DEFAULT 0 CHECK (saldo_mxn >= 0),
  total_gastado numeric(12,2) NOT NULL DEFAULT 0,
  estado text NOT NULL DEFAULT 'activo' CHECK (estado IN ('activo','cancelado','perdido')),
  tipo_emisor text NOT NULL DEFAULT 'titular' CHECK (tipo_emisor IN ('titular','expendio')),
  expendio_id uuid, -- preparado para fase futura
  categoria text NOT NULL DEFAULT 'normal',
  ultimo_uso_at timestamptz,
  ultima_ruta_producto_id uuid,
  cancelado_at timestamptz,
  motivo_cancelacion text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_sub_qr_titular ON public.sub_qr_saldo(titular_user_id);
CREATE INDEX idx_sub_qr_token ON public.sub_qr_saldo(token);
CREATE INDEX idx_sub_qr_folio ON public.sub_qr_saldo(folio_corto);
CREATE INDEX idx_sub_qr_estado ON public.sub_qr_saldo(estado);

GRANT SELECT, INSERT, UPDATE ON public.sub_qr_saldo TO authenticated;
GRANT ALL ON public.sub_qr_saldo TO service_role;

ALTER TABLE public.sub_qr_saldo ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Titular ve sus sub-QR"
  ON public.sub_qr_saldo FOR SELECT TO authenticated
  USING (auth.uid() = titular_user_id);

CREATE POLICY "Titular crea sus sub-QR"
  ON public.sub_qr_saldo FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = titular_user_id);

CREATE POLICY "Titular actualiza sus sub-QR"
  ON public.sub_qr_saldo FOR UPDATE TO authenticated
  USING (auth.uid() = titular_user_id);

CREATE TRIGGER trg_sub_qr_saldo_updated
  BEFORE UPDATE ON public.sub_qr_saldo
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


-- 3) MOVIMIENTOS (historial completo)
CREATE TABLE public.movimientos_wallet (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  wallet_id uuid NOT NULL REFERENCES public.wallets_qr(id) ON DELETE CASCADE,
  titular_user_id uuid NOT NULL,
  sub_qr_id uuid REFERENCES public.sub_qr_saldo(id) ON DELETE SET NULL,
  tipo text NOT NULL CHECK (tipo IN (
    'recarga',           -- titular recarga su wallet vía Stripe
    'asignacion',        -- titular asigna saldo del wallet a un sub-QR
    'devolucion',        -- saldo de un sub-QR cancelado regresa al wallet
    'cobro_viaje',       -- sub-QR paga un pasaje
    'transferencia',     -- entre sub-QR (a futuro)
    'reembolso_fraude'   -- titular reporta fraude y se compensa
  )),
  monto_mxn numeric(12,2) NOT NULL,
  saldo_wallet_despues numeric(12,2),
  saldo_sub_qr_despues numeric(12,2),
  viaje_id uuid,
  producto_id uuid,
  unidad_id uuid,
  stripe_payment_id text,
  descripcion text,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_mov_wallet ON public.movimientos_wallet(wallet_id, created_at DESC);
CREATE INDEX idx_mov_titular ON public.movimientos_wallet(titular_user_id, created_at DESC);
CREATE INDEX idx_mov_sub_qr ON public.movimientos_wallet(sub_qr_id, created_at DESC);

GRANT SELECT ON public.movimientos_wallet TO authenticated;
GRANT ALL ON public.movimientos_wallet TO service_role;

ALTER TABLE public.movimientos_wallet ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Titular ve sus movimientos"
  ON public.movimientos_wallet FOR SELECT TO authenticated
  USING (auth.uid() = titular_user_id);


-- 4) REALTIME (para que el titular vea saldos en vivo)
ALTER PUBLICATION supabase_realtime ADD TABLE public.wallets_qr;
ALTER PUBLICATION supabase_realtime ADD TABLE public.sub_qr_saldo;
ALTER PUBLICATION supabase_realtime ADD TABLE public.movimientos_wallet;
