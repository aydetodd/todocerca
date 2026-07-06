
-- Vigencia y CVV dinámico para QaRd sub-QR
ALTER TABLE public.qard_sub_qr
  ADD COLUMN IF NOT EXISTS fecha_vencimiento text NOT NULL DEFAULT '12/99',
  ADD COLUMN IF NOT EXISTS cvv text NOT NULL DEFAULT lpad((floor(random()*10000))::int::text, 4, '0'),
  ADD COLUMN IF NOT EXISTS cvv_updated_at timestamptz NOT NULL DEFAULT now();

-- Backfill: garantiza CVV para filas ya existentes (por si estaban null en algún ambiente)
UPDATE public.qard_sub_qr
   SET cvv = lpad((floor(random()*10000))::int::text, 4, '0')
 WHERE cvv IS NULL OR length(cvv) < 3;

-- RPC: rotar/actualizar CVV de un sub-QR.
-- Solo el titular (sub_index 00) puede cambiar el CVV de cualquiera de sus sub-QR.
-- Si _nuevo_cvv es NULL se genera aleatorio de 4 dígitos.
CREATE OR REPLACE FUNCTION public.qard_sub_qr_rotar_cvv(
  _sub_qr_id uuid,
  _nuevo_cvv text DEFAULT NULL
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_titular uuid;
  v_nuevo text;
BEGIN
  SELECT titular_user_id INTO v_titular
    FROM public.qard_sub_qr
   WHERE id = _sub_qr_id;

  IF v_titular IS NULL THEN
    RAISE EXCEPTION 'Sub-QR no encontrado';
  END IF;

  IF v_titular <> auth.uid() THEN
    RAISE EXCEPTION 'Solo el titular puede cambiar el CVV';
  END IF;

  IF _nuevo_cvv IS NULL OR length(_nuevo_cvv) = 0 THEN
    v_nuevo := lpad((floor(random()*10000))::int::text, 4, '0');
  ELSE
    IF _nuevo_cvv !~ '^[0-9]{3,4}$' THEN
      RAISE EXCEPTION 'CVV debe ser 3 o 4 dígitos';
    END IF;
    v_nuevo := _nuevo_cvv;
  END IF;

  UPDATE public.qard_sub_qr
     SET cvv = v_nuevo,
         cvv_updated_at = now()
   WHERE id = _sub_qr_id;

  RETURN v_nuevo;
END;
$$;

GRANT EXECUTE ON FUNCTION public.qard_sub_qr_rotar_cvv(uuid, text) TO authenticated;
