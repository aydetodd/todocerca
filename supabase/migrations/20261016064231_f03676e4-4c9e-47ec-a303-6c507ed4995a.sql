ALTER TABLE public.fletes_proveedores ADD COLUMN tipo text;
ALTER TABLE public.fletes_proveedores ADD CONSTRAINT fletes_proveedores_tipo_check CHECK (tipo IN ('transportista','remitente'));
UPDATE public.fletes_proveedores p SET tipo = x.tipo FROM (SELECT user_id,min(tipo) AS tipo FROM public.fletes_anuncios GROUP BY user_id HAVING count(DISTINCT tipo)=1) x WHERE x.user_id=p.user_id;
CREATE OR REPLACE FUNCTION public.fletes_registrar_tipo(_tipo text) RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE actual text;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Inicia sesión.'; END IF;
 IF _tipo IS NULL OR _tipo NOT IN ('transportista','remitente') THEN RAISE EXCEPTION 'Elige transportista o remitente.'; END IF;
 SELECT tipo INTO actual FROM public.fletes_proveedores WHERE user_id=auth.uid() FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Primero valida tu RFC.'; END IF;
 IF actual IS NOT NULL AND actual<>_tipo THEN RAISE EXCEPTION 'Tu tipo de registro ya está elegido.'; END IF;
 UPDATE public.fletes_proveedores SET tipo=_tipo,updated_at=now() WHERE user_id=auth.uid();
 RETURN _tipo;
END; $$;
REVOKE ALL ON FUNCTION public.fletes_registrar_tipo(text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.fletes_registrar_tipo(text) TO authenticated,service_role;
CREATE OR REPLACE FUNCTION public.fletes_tipo_registrado() RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$ SELECT tipo FROM public.fletes_proveedores WHERE user_id=auth.uid(); $$;
REVOKE ALL ON FUNCTION public.fletes_tipo_registrado() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.fletes_tipo_registrado() TO authenticated,service_role;
ALTER POLICY "ver anuncios fletes" ON public.fletes_anuncios TO authenticated USING (user_id=auth.uid() OR (disponible AND public.fletes_tiene_acceso(auth.uid()) AND tipo=CASE public.fletes_tipo_registrado() WHEN 'transportista' THEN 'remitente' WHEN 'remitente' THEN 'transportista' END));
ALTER POLICY "crear anuncio fletes" ON public.fletes_anuncios TO authenticated WITH CHECK (user_id=auth.uid() AND public.fletes_tiene_acceso(auth.uid()) AND tipo=public.fletes_tipo_registrado());
CREATE OR REPLACE FUNCTION public.fletes_preservar_tipo_anuncio() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$ BEGIN IF NEW.tipo IS DISTINCT FROM OLD.tipo OR NEW.user_id IS DISTINCT FROM OLD.user_id THEN RAISE EXCEPTION 'No se puede cambiar el tipo ni el dueño del anuncio.'; END IF; RETURN NEW; END; $$;
CREATE TRIGGER fletes_preservar_tipo_anuncio BEFORE UPDATE ON public.fletes_anuncios FOR EACH ROW EXECUTE FUNCTION public.fletes_preservar_tipo_anuncio();