CREATE TABLE public.merchant_tax_profiles (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL UNIQUE,
 rfc text NOT NULL DEFAULT '', legal_name text NOT NULL DEFAULT '', tax_regime text NOT NULL DEFAULT '', postal_code text NOT NULL DEFAULT '', activity text NOT NULL DEFAULT '', evidence_path text,
 confirmation_status text NOT NULL DEFAULT 'draft', confirmed_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.merchant_tax_profiles TO authenticated;
GRANT ALL ON public.merchant_tax_profiles TO service_role;
ALTER TABLE public.merchant_tax_profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY merchant_tax_owner ON public.merchant_tax_profiles FOR ALL TO authenticated USING (user_id = (SELECT auth.uid())) WITH CHECK (user_id = (SELECT auth.uid()));
CREATE TABLE public.formalization_progress (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL, step_key text NOT NULL, guide_version text NOT NULL DEFAULT 'v1', status text NOT NULL DEFAULT 'pending', note text NOT NULL DEFAULT '', evidence_path text,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), UNIQUE (user_id,step_key,guide_version)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.formalization_progress TO authenticated;
GRANT ALL ON public.formalization_progress TO service_role;
ALTER TABLE public.formalization_progress ENABLE ROW LEVEL SECURITY;
CREATE POLICY formalization_owner ON public.formalization_progress FOR ALL TO authenticated USING (user_id = (SELECT auth.uid())) WITH CHECK (user_id = (SELECT auth.uid()));
CREATE FUNCTION public.validate_formalization_record() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
 NEW.updated_at := now();
 IF TG_TABLE_NAME = 'merchant_tax_profiles' THEN
  NEW.rfc := upper(trim(NEW.rfc));
  IF NEW.confirmation_status NOT IN ('draft','self_confirmed') THEN RAISE EXCEPTION 'Invalid confirmation status'; END IF;
  IF NEW.rfc <> '' AND NEW.rfc !~ '^[A-ZÑ&]{3,4}[0-9]{6}[A-Z0-9]{3}$' THEN RAISE EXCEPTION 'Invalid RFC format'; END IF;
  IF NEW.postal_code <> '' AND NEW.postal_code !~ '^[0-9]{5}$' THEN RAISE EXCEPTION 'Invalid postal code'; END IF;
  IF NEW.confirmation_status = 'self_confirmed' THEN
   IF NEW.rfc = '' OR trim(NEW.legal_name) = '' OR NEW.tax_regime !~ '^[0-9]{3}$' OR NEW.postal_code = '' OR trim(NEW.activity) = '' THEN RAISE EXCEPTION 'Complete fiscal data before confirming'; END IF;
   IF TG_OP = 'UPDATE' AND (NEW.rfc,NEW.legal_name,NEW.tax_regime,NEW.postal_code,NEW.activity,NEW.evidence_path) IS DISTINCT FROM (OLD.rfc,OLD.legal_name,OLD.tax_regime,OLD.postal_code,OLD.activity,OLD.evidence_path) THEN
    NEW.confirmation_status := 'draft'; NEW.confirmed_at := NULL;
   ELSIF TG_OP = 'INSERT' OR OLD.confirmation_status <> 'self_confirmed' THEN NEW.confirmed_at := now();
   ELSE NEW.confirmed_at := OLD.confirmed_at; END IF;
  ELSE NEW.confirmed_at := NULL; END IF;
 ELSE
  IF NEW.status NOT IN ('pending','completed','not_applicable') OR NEW.guide_version <> 'v1' OR NEW.step_key NOT IN ('eligibility','documents','rfc','credentials','fiscal_profile','obligations') THEN RAISE EXCEPTION 'Invalid guide step or status'; END IF;
 END IF;
 IF NEW.evidence_path IS NOT NULL AND split_part(NEW.evidence_path,'/',1) <> NEW.user_id::text THEN RAISE EXCEPTION 'Evidence must belong to owner'; END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.validate_formalization_record() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER merchant_tax_validate BEFORE INSERT OR UPDATE ON public.merchant_tax_profiles FOR EACH ROW EXECUTE FUNCTION public.validate_formalization_record();
CREATE TRIGGER formalization_validate BEFORE INSERT OR UPDATE ON public.formalization_progress FOR EACH ROW EXECUTE FUNCTION public.validate_formalization_record();
CREATE POLICY formalization_docs_read ON storage.objects FOR SELECT TO authenticated USING (bucket_id='formalizacion-documentos' AND (storage.foldername(name))[1]=(SELECT auth.uid())::text);
CREATE POLICY formalization_docs_create ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id='formalizacion-documentos' AND (storage.foldername(name))[1]=(SELECT auth.uid())::text AND lower(storage.extension(name)) IN ('pdf','jpg','jpeg','png'));
CREATE POLICY formalization_docs_delete ON storage.objects FOR DELETE TO authenticated USING (bucket_id='formalizacion-documentos' AND (storage.foldername(name))[1]=(SELECT auth.uid())::text);
ALTER PUBLICATION supabase_realtime ADD TABLE public.merchant_tax_profiles, public.formalization_progress;