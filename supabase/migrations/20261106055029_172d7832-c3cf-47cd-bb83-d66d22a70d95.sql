ALTER TABLE public.terminal_agent_requests
  ADD COLUMN IF NOT EXISTS efirma_validada boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS efirma_nombre text,
  ADD COLUMN IF NOT EXISTS efirma_vence timestamp with time zone;

ALTER TABLE public.terminal_agent_requests ALTER COLUMN curp_document DROP NOT NULL;
ALTER TABLE public.terminal_agent_requests ALTER COLUMN ine_front_document DROP NOT NULL;
ALTER TABLE public.terminal_agent_requests ALTER COLUMN ine_back_document DROP NOT NULL;

CREATE POLICY terminal_requests_insert ON public.terminal_agent_requests
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY terminal_requests_update ON public.terminal_agent_requests
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());