
-- Agregar QR principal (eje) a wallets_qr
ALTER TABLE public.wallets_qr
  ADD COLUMN IF NOT EXISTS token uuid NOT NULL DEFAULT gen_random_uuid(),
  ADD COLUMN IF NOT EXISTS folio_corto text;

-- Generar folios para wallets existentes que no lo tengan
UPDATE public.wallets_qr
SET folio_corto = 'EJ-' || upper(substring(replace(token::text,'-',''),1,4) || '-' || substring(replace(token::text,'-',''),5,4))
WHERE folio_corto IS NULL;

ALTER TABLE public.wallets_qr
  ALTER COLUMN folio_corto SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS wallets_qr_token_unique ON public.wallets_qr(token);
CREATE UNIQUE INDEX IF NOT EXISTS wallets_qr_folio_unique ON public.wallets_qr(folio_corto);

-- Para anti-fraude del QR eje
ALTER TABLE public.wallets_qr
  ADD COLUMN IF NOT EXISTS ultimo_uso_at timestamptz;
