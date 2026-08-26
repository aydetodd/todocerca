ALTER TABLE public.device_verification_codes
ADD COLUMN IF NOT EXISTS destination_email text;

COMMENT ON COLUMN public.device_verification_codes.destination_email IS
'Correo destino pendiente de confirmar mediante el código de verificación del dispositivo.';