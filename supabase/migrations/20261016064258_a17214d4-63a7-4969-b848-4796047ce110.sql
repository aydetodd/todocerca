ALTER FUNCTION public.fletes_tipo_registrado() SECURITY INVOKER;
ALTER FUNCTION public.fletes_registrar_tipo(text) SECURITY INVOKER;
GRANT UPDATE (tipo) ON public.fletes_proveedores TO authenticated;
CREATE POLICY "fletero elige su tipo" ON public.fletes_proveedores FOR UPDATE TO authenticated USING (user_id=auth.uid()) WITH CHECK (user_id=auth.uid());
CREATE OR REPLACE FUNCTION public.fletes_tipo_unico() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$ BEGIN IF OLD.tipo IS NOT NULL AND NEW.tipo IS DISTINCT FROM OLD.tipo THEN RAISE EXCEPTION 'Tu tipo de registro ya está elegido.'; END IF; NEW.updated_at=now(); RETURN NEW; END; $$;
CREATE TRIGGER fletes_tipo_unico BEFORE UPDATE OF tipo ON public.fletes_proveedores FOR EACH ROW EXECUTE FUNCTION public.fletes_tipo_unico();
CREATE OR REPLACE FUNCTION public.fletes_registrar_tipo(_tipo text) RETURNS text LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$ DECLARE actual text; BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Inicia sesión.'; END IF;
 IF _tipo IS NULL OR _tipo NOT IN ('transportista','remitente') THEN RAISE EXCEPTION 'Elige transportista o remitente.'; END IF;
 SELECT tipo INTO actual FROM public.fletes_proveedores WHERE user_id=auth.uid() FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Primero valida tu RFC.'; END IF;
 IF actual IS NOT NULL AND actual<>_tipo THEN RAISE EXCEPTION 'Tu tipo de registro ya está elegido.'; END IF;
 UPDATE public.fletes_proveedores SET tipo=_tipo WHERE user_id=auth.uid(); RETURN _tipo;
END; $$;