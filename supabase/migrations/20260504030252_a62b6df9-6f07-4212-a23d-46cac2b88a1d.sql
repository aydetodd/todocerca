ALTER TABLE public.unidades_empresa ALTER COLUMN is_verified SET DEFAULT true;
UPDATE public.unidades_empresa SET is_verified = true WHERE COALESCE(transport_type, '') <> 'taxi';