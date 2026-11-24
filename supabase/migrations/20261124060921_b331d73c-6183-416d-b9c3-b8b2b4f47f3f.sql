CREATE TABLE public.qard_domicilios (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), owner_id uuid NOT NULL, qard_number text NOT NULL,
 calle text NOT NULL, numero text NOT NULL, colonia text NOT NULL, cp text NOT NULL, municipio text NOT NULL, estado text NOT NULL,
 version integer NOT NULL DEFAULT 1, progress integer NOT NULL DEFAULT 0, status text NOT NULL DEFAULT 'pending',
 verified_at timestamptz, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(owner_id,qard_number)
);
GRANT SELECT ON public.qard_domicilios TO authenticated;
GRANT ALL ON public.qard_domicilios TO service_role;
ALTER TABLE public.qard_domicilios ENABLE ROW LEVEL SECURITY;
CREATE POLICY domicilio_owner_read ON public.qard_domicilios FOR SELECT TO authenticated USING(owner_id=auth.uid() AND NOT coalesce((auth.jwt()->>'is_anonymous')::boolean,false));

CREATE TABLE public.qard_documentos (
 id text PRIMARY KEY, owner_id uuid NOT NULL, source_hash text NOT NULL, pdf_hash text NOT NULL,
 domicilio_id uuid REFERENCES public.qard_domicilios(id), domicilio_version integer,
 address_verified boolean NOT NULL DEFAULT false, period_start timestamptz NOT NULL, period_end timestamptz NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.qard_documentos TO authenticated;
GRANT SELECT,INSERT ON public.qard_documentos TO service_role;
ALTER TABLE public.qard_documentos ENABLE ROW LEVEL SECURITY;
CREATE POLICY documento_owner_read ON public.qard_documentos FOR SELECT TO authenticated USING(owner_id=auth.uid() AND NOT coalesce((auth.jwt()->>'is_anonymous')::boolean,false));

CREATE OR REPLACE FUNCTION public.qard_documento_inmutable() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$ BEGIN RAISE EXCEPTION 'Documento inmutable'; END $$;
CREATE TRIGGER documento_inmutable BEFORE UPDATE OR DELETE ON public.qard_documentos FOR EACH ROW EXECUTE FUNCTION public.qard_documento_inmutable();
REVOKE ALL ON FUNCTION public.qard_documento_inmutable() FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.qard_domicilio_guardar(_qard text,_address jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE u uuid:=auth.uid(); n text:=regexp_replace(coalesce(_qard,''),'[^0-9]','','g'); a public.qard_domicilios; k text;
BEGIN
 IF u IS NULL OR coalesce((auth.jwt()->>'is_anonymous')::boolean,false) THEN RAISE EXCEPTION 'Inicia sesión'; END IF;
 IF length(n)<>16 OR NOT (EXISTS(SELECT 1 FROM public.qard_sub_qr WHERE titular_user_id=u AND qard_number=n) OR (right(n,2)='10' AND EXISTS(SELECT 1 FROM public.qard_sub_qr WHERE titular_user_id=u AND sub_index=0 AND left(qard_number,14)=left(n,14)))) THEN RAISE EXCEPTION 'Tarjeta no encontrada'; END IF;
 IF _address IS NULL OR jsonb_typeof(_address)<>'object' THEN RAISE EXCEPTION 'Domicilio inválido'; END IF;
 FOREACH k IN ARRAY ARRAY['calle','numero','colonia','cp','municipio','estado'] LOOP
  IF length(btrim(coalesce(_address->>k,''))) NOT BETWEEN 1 AND 160 THEN RAISE EXCEPTION 'Completa el domicilio'; END IF;
 END LOOP;
 IF _address->>'cp' !~ '^[0-9]{5}$' THEN RAISE EXCEPTION 'Código postal de cinco dígitos'; END IF;
 INSERT INTO public.qard_domicilios(owner_id,qard_number,calle,numero,colonia,cp,municipio,estado)
 VALUES(u,n,btrim(_address->>'calle'),btrim(_address->>'numero'),btrim(_address->>'colonia'),_address->>'cp',btrim(_address->>'municipio'),btrim(_address->>'estado'))
 ON CONFLICT(owner_id,qard_number) DO UPDATE SET calle=excluded.calle,numero=excluded.numero,colonia=excluded.colonia,cp=excluded.cp,municipio=excluded.municipio,estado=excluded.estado,
 version=qard_domicilios.version+1,progress=0,status='pending',verified_at=NULL,updated_at=now()
 WHERE (qard_domicilios.calle,qard_domicilios.numero,qard_domicilios.colonia,qard_domicilios.cp,qard_domicilios.municipio,qard_domicilios.estado)
 IS DISTINCT FROM (excluded.calle,excluded.numero,excluded.colonia,excluded.cp,excluded.municipio,excluded.estado);
 SELECT * INTO a FROM public.qard_domicilios WHERE owner_id=u AND qard_number=n;
 RETURN to_jsonb(a);
END $$;
REVOKE ALL ON FUNCTION public.qard_domicilio_guardar(text,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.qard_domicilio_guardar(text,jsonb) TO authenticated;

CREATE OR REPLACE FUNCTION public.qard_documento_fuente(_qard text,_days integer,_savings_token text DEFAULT NULL) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE u uuid:=auth.uid(); n text:=regexp_replace(coalesce(_qard,''),'[^0-9]','','g'); s public.qard_sub_qr; w public.qard_wallets; a public.qard_domicilios; start_at timestamptz; end_at timestamptz:=now(); balance numeric; savings jsonb; result jsonb; name text;
BEGIN
 IF u IS NULL OR coalesce((auth.jwt()->>'is_anonymous')::boolean,false) THEN RAISE EXCEPTION 'Inicia sesión'; END IF;
 IF _days IS NULL OR _days NOT IN(7,15,30,62) THEN RAISE EXCEPTION 'Periodo inválido'; END IF;
 SELECT * INTO s FROM public.qard_sub_qr WHERE titular_user_id=u AND qard_number=n;
 SELECT * INTO w FROM public.qard_wallets WHERE titular_user_id=u;
 IF w.id IS NULL THEN RAISE EXCEPTION 'Activa tu QaRd'; END IF;
 IF s.id IS NULL AND NOT (right(n,2)='10' AND EXISTS(SELECT 1 FROM public.qard_sub_qr WHERE titular_user_id=u AND sub_index=0 AND left(qard_number,14)=left(n,14))) THEN RAISE EXCEPTION 'Tarjeta no encontrada'; END IF;
 start_at:=((end_at AT TIME ZONE 'America/Hermosillo')::date-(_days-1))::timestamp AT TIME ZONE 'America/Hermosillo';
 IF right(n,2)='10' THEN
  savings:=qard_private.qard_ahorro_read(_savings_token);
  IF NOT coalesce((savings->>'ok')::boolean,false) THEN RAISE EXCEPTION 'Abre Ahorro con tu PIN'; END IF;
  SELECT coalesce(sum(saldo_mxn),0) INTO balance FROM public.qard_bolsillos WHERE titular_user_id=u;
 ELSE balance:=CASE s.sub_index WHEN 0 THEN w.saldo_mxn WHEN 1 THEN w.saldo_comercio_mxn ELSE s.saldo_mxn END;
 END IF;
 SELECT nombre_completo INTO name FROM public.qard_identidad WHERE user_id=u;
 IF coalesce(s.sub_index,0)>=11 THEN name:=s.nombre_completo; END IF;
 SELECT * INTO a FROM public.qard_domicilios WHERE owner_id=u AND qard_number=n;
 SELECT jsonb_build_object('qard',n,'index',coalesce(s.sub_index,10),'name',coalesce(name,''),'balance',balance,'principal_id',(SELECT id FROM public.qard_sub_qr WHERE titular_user_id=u AND sub_index=0),'card_id',s.id,'start',start_at,'end',end_at,'address',CASE WHEN a.id IS NULL THEN NULL ELSE to_jsonb(a) END,'movements',coalesce(jsonb_agg(jsonb_build_object('id',m.id,'tipo',m.tipo,'monto_mxn',m.monto_mxn,'descripcion',m.descripcion,'created_at',m.created_at,'comercio_nombre',m.comercio_nombre,'sub_qr_id',m.sub_qr_id,'ambito',m.ambito,'direccion',m.direccion,'comision_mxn',m.comision_mxn,'metadata',m.metadata) ORDER BY m.created_at DESC,m.id DESC) FILTER(WHERE m.id IS NOT NULL),'[]'::jsonb)) INTO result
 FROM public.qard_movimientos m WHERE m.titular_user_id=u AND m.created_at>=start_at AND m.created_at<=end_at;
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.qard_documento_fuente(text,integer,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.qard_documento_fuente(text,integer,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.qard_documento_verificar(_hash text) RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT coalesce((SELECT jsonb_build_object('found',true,'issued_at',d.created_at,'pdf_hash',d.pdf_hash,'source_hash',d.source_hash,'address_verified',d.address_verified AND a.status='valid' AND a.version=d.domicilio_version,'address_status',CASE WHEN d.address_verified AND a.status='valid' AND a.version=d.domicilio_version THEN 'valid' ELSE 'pending' END) FROM public.qard_documentos d LEFT JOIN public.qard_domicilios a ON a.id=d.domicilio_id WHERE d.id=_hash AND _hash ~ '^[a-f0-9]{64}$'),' {"found":false}'::jsonb);
$$;
REVOKE ALL ON FUNCTION public.qard_documento_verificar(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.qard_documento_verificar(text) TO anon,authenticated;
ALTER PUBLICATION supabase_realtime ADD TABLE public.qard_domicilios;