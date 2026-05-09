
ALTER TABLE public.citizen_reports
  ADD COLUMN IF NOT EXISTS city text,
  ADD COLUMN IF NOT EXISTS resolved_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_citizen_reports_city ON public.citizen_reports (lower(city));

DROP VIEW IF EXISTS public.citizen_reports_public;
CREATE VIEW public.citizen_reports_public AS
SELECT id, category, lat, lng, note, phone_last4, status,
       confirm_count, resolve_count, city, resolved_at, created_at
FROM public.citizen_reports;

CREATE OR REPLACE FUNCTION public.handle_citizen_report_vote()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.vote_type = 'confirm' THEN
    UPDATE public.citizen_reports
    SET confirm_count = confirm_count + 1
    WHERE id = NEW.report_id;
  ELSIF NEW.vote_type = 'resolve' THEN
    UPDATE public.citizen_reports
    SET resolve_count = resolve_count + 1,
        status = CASE WHEN resolve_count + 1 >= 3 THEN 'hidden'::citizen_report_status ELSE status END,
        resolved_at = CASE WHEN resolve_count + 1 >= 3 AND resolved_at IS NULL THEN now() ELSE resolved_at END
    WHERE id = NEW.report_id;
  END IF;
  RETURN NEW;
END;
$function$;
