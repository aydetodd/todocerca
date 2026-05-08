
-- Enum de categorías
CREATE TYPE public.citizen_report_category AS ENUM (
  'bache','fuga_agua','fuga_drenaje','alumbrado','basura','semaforo'
);

CREATE TYPE public.citizen_report_status AS ENUM ('active','resolved','hidden');
CREATE TYPE public.citizen_vote_type AS ENUM ('confirm','resolve');

-- Tabla principal
CREATE TABLE public.citizen_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  category public.citizen_report_category NOT NULL,
  lat double precision NOT NULL,
  lng double precision NOT NULL,
  note text,
  phone_last4 text NOT NULL,
  status public.citizen_report_status NOT NULL DEFAULT 'active',
  confirm_count int NOT NULL DEFAULT 0,
  resolve_count int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_citizen_reports_status ON public.citizen_reports(status);
CREATE INDEX idx_citizen_reports_category ON public.citizen_reports(category);
CREATE INDEX idx_citizen_reports_user ON public.citizen_reports(user_id);

-- Votos
CREATE TABLE public.citizen_report_votes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id uuid NOT NULL REFERENCES public.citizen_reports(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  vote_type public.citizen_vote_type NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(report_id, user_id)
);

-- Tramos cerrados
CREATE TABLE public.road_closures (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  reason text,
  polyline jsonb NOT NULL,
  reopen_estimated_at date,
  created_by uuid NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_road_closures_active ON public.road_closures(is_active);

-- Triggers updated_at
CREATE TRIGGER trg_citizen_reports_updated_at
  BEFORE UPDATE ON public.citizen_reports
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER trg_road_closures_updated_at
  BEFORE UPDATE ON public.road_closures
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Trigger: actualiza contadores y oculta reporte al alcanzar 3 votos de resolución
CREATE OR REPLACE FUNCTION public.handle_citizen_report_vote()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.vote_type = 'confirm' THEN
    UPDATE public.citizen_reports
    SET confirm_count = confirm_count + 1
    WHERE id = NEW.report_id;
  ELSIF NEW.vote_type = 'resolve' THEN
    UPDATE public.citizen_reports
    SET resolve_count = resolve_count + 1,
        status = CASE WHEN resolve_count + 1 >= 3 THEN 'hidden'::citizen_report_status ELSE status END
    WHERE id = NEW.report_id;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_handle_citizen_vote
  AFTER INSERT ON public.citizen_report_votes
  FOR EACH ROW EXECUTE FUNCTION public.handle_citizen_report_vote();

-- Trigger: forzar phone_last4 a partir del perfil del usuario que inserta
CREATE OR REPLACE FUNCTION public.enforce_citizen_report_phone()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_phone text;
BEGIN
  -- Forzar user_id al usuario autenticado
  NEW.user_id := auth.uid();

  SELECT telefono INTO v_phone FROM public.profiles WHERE user_id = auth.uid() LIMIT 1;
  IF v_phone IS NULL THEN
    NEW.phone_last4 := '0000';
  ELSE
    NEW.phone_last4 := RIGHT(regexp_replace(v_phone, '[^0-9]', '', 'g'), 4);
    IF length(NEW.phone_last4) < 4 THEN
      NEW.phone_last4 := lpad(NEW.phone_last4, 4, '0');
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_enforce_citizen_phone
  BEFORE INSERT ON public.citizen_reports
  FOR EACH ROW EXECUTE FUNCTION public.enforce_citizen_report_phone();

-- Vista pública (oculta user_id)
CREATE VIEW public.citizen_reports_public
WITH (security_invoker=on) AS
  SELECT id, category, lat, lng, note, phone_last4, status,
         confirm_count, resolve_count, created_at
  FROM public.citizen_reports;

-- RLS
ALTER TABLE public.citizen_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.citizen_report_votes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.road_closures ENABLE ROW LEVEL SECURITY;

-- citizen_reports: SELECT solo a través de la vista; permitir SELECT solo a admin/dueño en la tabla base
CREATE POLICY "Owner or admin can read base table"
  ON public.citizen_reports FOR SELECT
  TO authenticated
  USING (user_id = auth.uid() OR public.is_admin());

CREATE POLICY "Authenticated can read active reports via base"
  ON public.citizen_reports FOR SELECT
  TO authenticated
  USING (status = 'active');

CREATE POLICY "Authenticated can insert own report"
  ON public.citizen_reports FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Owner or admin can update report"
  ON public.citizen_reports FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid() OR public.is_admin())
  WITH CHECK (user_id = auth.uid() OR public.is_admin());

CREATE POLICY "Owner or admin can delete report"
  ON public.citizen_reports FOR DELETE
  TO authenticated
  USING (user_id = auth.uid() OR public.is_admin());

-- votos
CREATE POLICY "Authenticated can read votes"
  ON public.citizen_report_votes FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated can insert own vote"
  ON public.citizen_report_votes FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Owner or admin can delete vote"
  ON public.citizen_report_votes FOR DELETE
  TO authenticated
  USING (user_id = auth.uid() OR public.is_admin());

-- road_closures
CREATE POLICY "Authenticated can read closures"
  ON public.road_closures FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Admin can insert closures"
  ON public.road_closures FOR INSERT
  TO authenticated
  WITH CHECK (public.is_admin());

CREATE POLICY "Admin can update closures"
  ON public.road_closures FOR UPDATE
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

CREATE POLICY "Admin can delete closures"
  ON public.road_closures FOR DELETE
  TO authenticated
  USING (public.is_admin());

-- Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.citizen_reports;
ALTER PUBLICATION supabase_realtime ADD TABLE public.road_closures;
