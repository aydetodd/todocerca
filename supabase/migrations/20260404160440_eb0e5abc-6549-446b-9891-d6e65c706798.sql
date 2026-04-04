
CREATE TABLE public.movimientos_boleto (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  qr_ticket_id uuid NOT NULL REFERENCES public.qr_tickets(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  tipo text NOT NULL, -- 'generated', 'transferred', 'transfer_cancelled', 'transfer_expired', 'used', 're_transferred'
  detalles jsonb DEFAULT '{}'::jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX idx_movimientos_boleto_ticket ON public.movimientos_boleto(qr_ticket_id);
CREATE INDEX idx_movimientos_boleto_user ON public.movimientos_boleto(user_id);

ALTER TABLE public.movimientos_boleto ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Usuarios ven movimientos de sus boletos"
ON public.movimientos_boleto
FOR SELECT
TO public
USING (auth.uid() = user_id OR is_admin());

CREATE POLICY "Sistema inserta movimientos"
ON public.movimientos_boleto
FOR INSERT
TO public
WITH CHECK (true);
