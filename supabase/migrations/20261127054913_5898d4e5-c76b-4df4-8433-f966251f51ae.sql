REVOKE ALL ON TABLE public.qard_domicilios,public.qard_documentos FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT ON TABLE public.qard_domicilios,public.qard_documentos TO authenticated;
GRANT ALL ON TABLE public.qard_domicilios TO service_role;
GRANT SELECT,INSERT ON TABLE public.qard_documentos TO service_role;