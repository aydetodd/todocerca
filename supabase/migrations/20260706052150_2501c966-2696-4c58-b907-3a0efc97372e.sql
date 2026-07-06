
-- Regenerar todos los CVV a 3 dígitos
UPDATE public.qard_sub_qr
   SET cvv = lpad((floor(random()*1000))::int::text, 3, '0'),
       cvv_updated_at = now();

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
    v_nuevo := lpad((floor(random()*1000))::int::text, 3, '0');
  ELSE
    IF _nuevo_cvv !~ '^[0-9]{3}$' THEN
      RAISE EXCEPTION 'CVV debe ser exactamente 3 dígitos';
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

-- Cambia el default de la columna a 3 dígitos para nuevos sub-QR
ALTER TABLE public.qard_sub_qr
  ALTER COLUMN cvv SET DEFAULT lpad((floor(random()*1000))::int::text, 3, '0');
