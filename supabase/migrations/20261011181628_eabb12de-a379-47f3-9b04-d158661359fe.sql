CREATE TABLE public.fletes_proveedores (
  user_id uuid PRIMARY KEY,
  nombre_negocio text NOT NULL,
  rfc text NOT NULL,
  rfc_verificado boolean NOT NULL DEFAULT false,
  verificado_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.fletes_proveedores TO authenticated;
GRANT ALL ON public.fletes_proveedores TO service_role;
ALTER TABLE public.fletes_proveedores ENABLE ROW LEVEL SECURITY;
CREATE POLICY "fletero ve su registro" ON public.fletes_proveedores FOR SELECT TO authenticated USING (user_id = auth.uid());

CREATE OR REPLACE FUNCTION public.fletes_tiene_acceso(_uid uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.fletes_proveedores f WHERE f.user_id = _uid AND f.rfc_verificado)
     AND EXISTS (SELECT 1 FROM public.profiles p WHERE p.user_id = _uid AND p.suscripcion_activa
                 AND (p.suscripcion_expira_en IS NULL OR p.suscripcion_expira_en > now()));
$$;
GRANT EXECUTE ON FUNCTION public.fletes_tiene_acceso(uuid) TO authenticated;

CREATE TABLE public.fletes_anuncios (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  tipo text NOT NULL CHECK (tipo IN ('transportista','remitente')),
  titulo text NOT NULL,
  marca text, modelo int, condiciones text, remolque text, dimensiones text,
  ciudad_estado text, ciudad_municipio text,
  destinos_preferidos text[] NOT NULL DEFAULT '{}',
  tipo_carga text, lugar_carga text, temperatura text, tamano text,
  destino_estado text, destino_municipio text,
  telefono text,
  nombre_contacto text,
  disponible boolean NOT NULL DEFAULT true,
  editado_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.fletes_anuncios TO authenticated;
GRANT ALL ON public.fletes_anuncios TO service_role;
ALTER TABLE public.fletes_anuncios ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ver anuncios fletes" ON public.fletes_anuncios FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR (disponible AND public.fletes_tiene_acceso(auth.uid())));
CREATE POLICY "crear anuncio fletes" ON public.fletes_anuncios FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() AND public.fletes_tiene_acceso(auth.uid()));
CREATE POLICY "editar anuncio fletes" ON public.fletes_anuncios FOR UPDATE TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "borrar anuncio fletes" ON public.fletes_anuncios FOR DELETE TO authenticated
  USING (user_id = auth.uid());

CREATE OR REPLACE FUNCTION public.tg_fletes_anuncio_before()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  NEW.updated_at := now();
  IF TG_OP = 'INSERT' THEN
    SELECT COALESCE(p.telefono, p.phone), COALESCE(f.nombre_negocio, p.nombre)
      INTO NEW.telefono, NEW.nombre_contacto
      FROM public.profiles p LEFT JOIN public.fletes_proveedores f ON f.user_id = p.user_id
      WHERE p.user_id = NEW.user_id;
    NEW.editado_at := now();
  ELSE
    NEW.telefono := OLD.telefono; NEW.nombre_contacto := OLD.nombre_contacto;
    NEW.user_id := OLD.user_id; NEW.created_at := OLD.created_at;
    -- Editar datos o volver a encender cuenta como "editado"
    IF (to_jsonb(NEW) - 'disponible' - 'updated_at' - 'editado_at') IS DISTINCT FROM (to_jsonb(OLD) - 'disponible' - 'updated_at' - 'editado_at')
       OR (NEW.disponible AND NOT OLD.disponible) THEN
      NEW.editado_at := now();
    ELSE
      NEW.editado_at := OLD.editado_at;
    END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_fletes_anuncio_before BEFORE INSERT OR UPDATE ON public.fletes_anuncios
  FOR EACH ROW EXECUTE FUNCTION public.tg_fletes_anuncio_before();

CREATE INDEX idx_fletes_anuncios_tipo ON public.fletes_anuncios (tipo, disponible);

SELECT cron.schedule('fletes-apagar-30-dias', '15 7 * * *',
  $$UPDATE public.fletes_anuncios SET disponible = false WHERE disponible AND editado_at < now() - interval '30 days'$$);