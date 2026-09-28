-- 1) CVV: trigger también en UPDATE
DROP TRIGGER IF EXISTS trg_subqr_cvv_default ON public.qard_sub_qr;
CREATE TRIGGER trg_subqr_cvv_default BEFORE INSERT OR UPDATE OF cvv, cvv_dinamico ON public.qard_sub_qr
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_cvv_default();
DROP TRIGGER IF EXISTS trg_wallets_cvv_default ON public.qard_wallets;
CREATE TRIGGER trg_wallets_cvv_default BEFORE INSERT OR UPDATE OF cvv_dinamico ON public.qard_wallets
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_cvv_default();

-- 2) qard_dec endurecido: sin modo legado
CREATE OR REPLACE FUNCTION public.qard_dec(_v text)
 RETURNS text LANGUAGE plpgsql SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE k text; out_v text;
BEGIN
  IF _v IS NULL OR _v = '' THEN RETURN _v; END IF;
  IF left(_v, 7) <> 'enc:v1:' THEN RETURN NULL; END IF;
  SELECT valor INTO k FROM public.app_crypto_keys WHERE nombre='qard_master';
  BEGIN
    out_v := extensions.pgp_sym_decrypt(decode(substring(_v from 8), 'base64'), k);
  EXCEPTION WHEN OTHERS THEN out_v := NULL;
  END;
  RETURN out_v;
END;
$function$;
REVOKE EXECUTE ON FUNCTION public.qard_dec(text), public.qard_enc(text) FROM anon, authenticated, public;
GRANT EXECUTE ON FUNCTION public.qard_dec(text), public.qard_enc(text) TO service_role;

-- 3) Inmutabilidad de movimientos
CREATE OR REPLACE FUNCTION public.tg_qard_movimientos_bloqueo()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF TG_OP = 'DELETE'
     AND current_setting('qard.purga_autorizada', true) = 'on'
     AND OLD.created_at < now() - interval '2 months'
     AND EXISTS (SELECT 1 FROM public.qard_movimientos_archivo a WHERE a.movimiento_id = OLD.id)
  THEN
    RETURN OLD;
  END IF;
  RAISE EXCEPTION 'qard_movimientos es inmutable (% bloqueado)', TG_OP
    USING ERRCODE = 'insufficient_privilege';
END $$;
DROP TRIGGER IF EXISTS trg_inmutabilidad_qard_movimientos ON public.qard_movimientos;
DROP TRIGGER IF EXISTS trg_qard_movimientos_bloqueo ON public.qard_movimientos;
CREATE TRIGGER trg_qard_movimientos_bloqueo BEFORE UPDATE OR DELETE ON public.qard_movimientos
  FOR EACH ROW EXECUTE FUNCTION public.tg_qard_movimientos_bloqueo();

CREATE OR REPLACE FUNCTION public.qard_purge_movimientos_antiguos()
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
  INSERT INTO public.qard_movimientos_archivo (movimiento_id, titular_user_id, data, original_created_at)
  SELECT m.id, m.titular_user_id, to_jsonb(m), m.created_at
  FROM public.qard_movimientos m
  WHERE m.created_at < (now() - interval '2 months')
    AND NOT EXISTS (SELECT 1 FROM public.qard_movimientos_archivo a WHERE a.movimiento_id = m.id);

  PERFORM set_config('qard.purga_autorizada', 'on', true);
  DELETE FROM public.qard_movimientos m
  WHERE m.created_at < (now() - interval '2 months')
    AND EXISTS (SELECT 1 FROM public.qard_movimientos_archivo a WHERE a.movimiento_id = m.id);
  PERFORM set_config('qard.purga_autorizada', 'off', true);
END;
$function$;
REVOKE EXECUTE ON FUNCTION public.qard_purge_movimientos_antiguos() FROM anon, authenticated, public;
GRANT EXECUTE ON FUNCTION public.qard_purge_movimientos_antiguos() TO service_role;

-- 4) UDI a pagos_config y retiro de STP
ALTER TABLE public.pagos_config ADD COLUMN IF NOT EXISTS valor_udi_mxn numeric NOT NULL DEFAULT 8.60;
UPDATE public.pagos_config SET valor_udi_mxn = COALESCE((SELECT valor_udi_mxn FROM public.stp_config LIMIT 1), 8.60);

CREATE OR REPLACE FUNCTION public.qard_limite_recarga(_user_id uuid)
 RETURNS TABLE(estado text, tope numeric, usado numeric, disponible numeric)
 LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE _estado text; _udis integer; _udi numeric; _tope numeric; _usado numeric;
BEGIN
  IF auth.uid() IS NOT NULL AND _user_id <> auth.uid() AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'No autorizado';
  END IF;
  SELECT i.estado, COALESCE(i.monthly_limit_udis, 0) INTO _estado, _udis
  FROM public.qard_identidad i WHERE i.user_id = _user_id;
  _estado := COALESCE(_estado, 'inactive');
  SELECT c.valor_udi_mxn INTO _udi FROM public.pagos_config c LIMIT 1;
  _udi := COALESCE(_udi, 8.60);
  IF _estado = 'moral_approved' THEN _tope := NULL;
  ELSIF _udis > 0 THEN _tope := round(_udis * _udi, 2);
  ELSE _tope := 0; END IF;
  _usado := public.qard_entradas_mes(_user_id);
  RETURN QUERY SELECT _estado, _tope, _usado,
    CASE WHEN _tope IS NULL THEN NULL ELSE GREATEST(_tope - _usado, 0) END;
END;
$function$;

DROP FUNCTION IF EXISTS public.stp_procesar_deposito(text, numeric, text, text, text, text, text, jsonb);
DROP FUNCTION IF EXISTS public.stp_tope_mensual(uuid);
DROP TABLE IF EXISTS public.stp_webhook_log;
DROP TABLE IF EXISTS public.stp_depositos;
DROP TABLE IF EXISTS public.stp_config;

-- 5) pagos_* solo admin
DROP POLICY IF EXISTS "Dueño ve su cuenta virtual" ON public.pagos_cuentas_virtuales;
DROP POLICY IF EXISTS "Dueño ve sus transferencias" ON public.pagos_transferencias;
DROP POLICY IF EXISTS "Config de pagos legible" ON public.pagos_config;
CREATE POLICY "Solo admin pagos_cuentas_virtuales" ON public.pagos_cuentas_virtuales FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE POLICY "Solo admin pagos_transferencias" ON public.pagos_transferencias FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE POLICY "Solo admin pagos_config" ON public.pagos_config FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
REVOKE ALL ON public.pagos_config, public.pagos_cuentas_virtuales, public.pagos_transferencias FROM anon;

-- 6) Vista con permisos de quien consulta
ALTER VIEW public.citizen_reports_public SET (security_invoker = on);