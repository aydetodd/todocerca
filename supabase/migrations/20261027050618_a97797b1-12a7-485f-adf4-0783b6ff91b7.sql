CREATE TABLE public.qard_verification_results (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL, kind text NOT NULL, input_hash text NOT NULL, response_enc text NOT NULL, status text NOT NULL DEFAULT 'pending', created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), UNIQUE(user_id,kind,input_hash));
GRANT ALL ON public.qard_verification_results TO service_role;
ALTER TABLE public.qard_verification_results ENABLE ROW LEVEL SECURITY;
CREATE POLICY service_verification_results ON public.qard_verification_results FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE TRIGGER verification_results_updated BEFORE UPDATE ON public.qard_verification_results FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();