ALTER TABLE public.qard_identidad
  ADD COLUMN IF NOT EXISTS validation_type text NOT NULL DEFAULT 'curp_only',
  ADD COLUMN IF NOT EXISTS ine_front_image_url text,
  ADD COLUMN IF NOT EXISTS ine_back_image_url text,
  ADD COLUMN IF NOT EXISTS ocr_intentos integer NOT NULL DEFAULT 0;

ALTER TABLE public.qard_identidad
  DROP CONSTRAINT IF EXISTS qard_identidad_validation_type_check;
ALTER TABLE public.qard_identidad
  ADD CONSTRAINT qard_identidad_validation_type_check
  CHECK (validation_type IN ('curp_only','ocr_full'));