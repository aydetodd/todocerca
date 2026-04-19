-- Add qr_scope to qr_tickets to differentiate paid public tickets vs employee/private QR
ALTER TABLE public.qr_tickets
ADD COLUMN IF NOT EXISTS qr_scope text NOT NULL DEFAULT 'publico';

-- Constraint to limit valid values
ALTER TABLE public.qr_tickets
DROP CONSTRAINT IF EXISTS qr_tickets_qr_scope_check;
ALTER TABLE public.qr_tickets
ADD CONSTRAINT qr_tickets_qr_scope_check CHECK (qr_scope IN ('publico', 'privado'));

-- Backfill existing tickets as 'publico' (they were paid tickets)
UPDATE public.qr_tickets SET qr_scope = 'publico' WHERE qr_scope IS NULL;

-- Index for fast scoping checks
CREATE INDEX IF NOT EXISTS idx_qr_tickets_qr_scope ON public.qr_tickets(qr_scope);