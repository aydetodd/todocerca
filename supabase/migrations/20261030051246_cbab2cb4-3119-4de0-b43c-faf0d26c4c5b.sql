REVOKE ALL ON public.merchant_tax_profiles, public.formalization_progress FROM anon, PUBLIC;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.merchant_tax_profiles, public.formalization_progress TO authenticated;
GRANT ALL ON public.merchant_tax_profiles, public.formalization_progress TO service_role;