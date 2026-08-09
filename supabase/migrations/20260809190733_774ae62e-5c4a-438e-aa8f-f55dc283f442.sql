ALTER VIEW public.citizen_reports_public SET (security_invoker = off);
GRANT SELECT ON public.citizen_reports_public TO authenticated, anon;