CREATE TABLE public.qard_negocios(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), owner_id uuid NOT NULL, nombre text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now());
GRANT SELECT, INSERT, UPDATE ON public.qard_negocios TO authenticated;
GRANT ALL ON public.qard_negocios TO service_role;
ALTER TABLE public.qard_negocios ENABLE ROW LEVEL SECURITY;
CREATE POLICY qard_negocios_owner_read ON public.qard_negocios FOR SELECT TO authenticated USING (owner_id=auth.uid());
CREATE POLICY qard_negocios_owner_insert ON public.qard_negocios FOR INSERT TO authenticated WITH CHECK (owner_id=auth.uid() AND length(btrim(nombre)) BETWEEN 2 AND 80);
CREATE POLICY qard_negocios_owner_update ON public.qard_negocios FOR UPDATE TO authenticated USING (owner_id=auth.uid()) WITH CHECK (owner_id=auth.uid() AND length(btrim(nombre)) BETWEEN 2 AND 80);
CREATE TRIGGER qard_negocios_updated BEFORE UPDATE ON public.qard_negocios FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.terminal_invites ADD COLUMN negocio_id uuid REFERENCES public.qard_negocios(id) ON DELETE SET NULL;
ALTER TABLE public.terminal_permissions ADD COLUMN negocio_id uuid REFERENCES public.qard_negocios(id) ON DELETE SET NULL;
ALTER TABLE public.terminal_operations ADD COLUMN negocio_id uuid REFERENCES public.qard_negocios(id) ON DELETE SET NULL;

CREATE OR REPLACE FUNCTION public.terminal_perm_negocio() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF NEW.status='accepted' THEN
  SELECT negocio_id INTO NEW.negocio_id FROM public.terminal_invites WHERE invited_user_id=NEW.user_id AND terminal_code=NEW.terminal_code AND merchant_user_id=NEW.invited_by AND status='accepted' ORDER BY updated_at DESC LIMIT 1;
 ELSE NEW.negocio_id:=NULL; END IF;
 RETURN NEW; END; $$;
CREATE TRIGGER terminal_perm_negocio BEFORE INSERT OR UPDATE ON public.terminal_permissions FOR EACH ROW EXECUTE FUNCTION public.terminal_perm_negocio();

CREATE OR REPLACE FUNCTION public.terminal_invite_negocio_sync() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF NEW.status='accepted' AND NEW.invited_user_id IS NOT NULL THEN
  UPDATE public.terminal_permissions SET negocio_id=NEW.negocio_id WHERE user_id=NEW.invited_user_id AND terminal_code=NEW.terminal_code AND invited_by=NEW.merchant_user_id AND status='accepted';
 END IF; RETURN NEW; END; $$;
CREATE TRIGGER terminal_invite_negocio_sync AFTER UPDATE ON public.terminal_invites FOR EACH ROW EXECUTE FUNCTION public.terminal_invite_negocio_sync();

CREATE OR REPLACE FUNCTION public.terminal_op_negocio() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF NEW.terminal_code='collection' AND auth.uid() IS NOT NULL THEN
  SELECT negocio_id INTO NEW.negocio_id FROM public.terminal_permissions WHERE user_id=auth.uid() AND terminal_code='collection' AND invited_by=NEW.merchant_user_id AND status='accepted';
 END IF; RETURN NEW; END; $$;
CREATE TRIGGER terminal_op_negocio BEFORE INSERT ON public.terminal_operations FOR EACH ROW EXECUTE FUNCTION public.terminal_op_negocio();

CREATE OR REPLACE FUNCTION public.terminal_invite_sucursal(_phone text, _negocio uuid) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_token uuid; BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.qard_negocios WHERE id=_negocio AND owner_id=auth.uid()) THEN RAISE EXCEPTION 'Sucursal no encontrada'; END IF;
 v_token:=public.terminal_invite_phone(_phone,'collection');
 UPDATE public.terminal_invites SET negocio_id=_negocio, updated_at=now() WHERE token=v_token AND merchant_user_id=auth.uid();
 RETURN v_token; END; $$;
REVOKE ALL ON FUNCTION public.terminal_invite_sucursal(text,uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.terminal_invite_sucursal(text,uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.qard_cobros_por_sucursal() RETURNS TABLE(negocio_id uuid, nombre text, cobrado numeric, cobros bigint, hoy numeric) LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT n.id, n.nombre, COALESCE(sum(o.amount_mxn),0), count(o.id), COALESCE(sum(o.amount_mxn) FILTER (WHERE (o.created_at AT TIME ZONE 'America/Hermosillo')::date=(now() AT TIME ZONE 'America/Hermosillo')::date),0)
 FROM public.qard_negocios n LEFT JOIN public.terminal_operations o ON o.negocio_id=n.id AND o.terminal_code='collection' AND o.merchant_user_id=auth.uid()
 WHERE n.owner_id=auth.uid() GROUP BY n.id,n.nombre
 UNION ALL
 SELECT NULL, 'Sin sucursal', COALESCE(sum(amount_mxn),0), count(*), COALESCE(sum(amount_mxn) FILTER (WHERE (created_at AT TIME ZONE 'America/Hermosillo')::date=(now() AT TIME ZONE 'America/Hermosillo')::date),0)
 FROM public.terminal_operations WHERE merchant_user_id=auth.uid() AND terminal_code='collection' AND negocio_id IS NULL
$$;
REVOKE ALL ON FUNCTION public.qard_cobros_por_sucursal() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.qard_cobros_por_sucursal() TO authenticated;