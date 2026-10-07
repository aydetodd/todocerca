ALTER TABLE public.unidades_empresa DROP CONSTRAINT IF EXISTS unidades_empresa_transport_type_check;
ALTER TABLE public.unidades_empresa ADD CONSTRAINT unidades_empresa_transport_type_check CHECK (transport_type = ANY (ARRAY['publico','foraneo','privado','taxi','taxi_colectivo']));
ALTER TABLE public.choferes_empresa DROP CONSTRAINT IF EXISTS choferes_empresa_transport_type_check;
ALTER TABLE public.choferes_empresa ADD CONSTRAINT choferes_empresa_transport_type_check CHECK (transport_type = ANY (ARRAY['publico','foraneo','privado','taxi','taxi_colectivo']));