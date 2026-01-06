-- Tabla pública (sin PII) para mostrar horarios ocupados a todos los usuarios
-- Se mantiene sincronizada con public.citas vía trigger

CREATE TABLE IF NOT EXISTS public.citas_publicas (
  id uuid PRIMARY KEY REFERENCES public.citas(id) ON DELETE CASCADE,
  proveedor_id uuid NOT NULL,
  fecha date NOT NULL,
  hora_inicio time NOT NULL,
  hora_fin time NOT NULL,
  estado text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Índices para consultas por proveedor/fecha
CREATE INDEX IF NOT EXISTS idx_citas_publicas_proveedor_fecha
  ON public.citas_publicas (proveedor_id, fecha);

CREATE INDEX IF NOT EXISTS idx_citas_publicas_proveedor_fecha_hora
  ON public.citas_publicas (proveedor_id, fecha, hora_inicio);

-- Backfill inicial (solo no canceladas)
INSERT INTO public.citas_publicas (id, proveedor_id, fecha, hora_inicio, hora_fin, estado, created_at, updated_at)
SELECT c.id, c.proveedor_id, c.fecha, c.hora_inicio, c.hora_fin, c.estado, c.created_at, c.updated_at
FROM public.citas c
WHERE c.estado <> 'cancelada'
ON CONFLICT (id) DO UPDATE SET
  proveedor_id = EXCLUDED.proveedor_id,
  fecha = EXCLUDED.fecha,
  hora_inicio = EXCLUDED.hora_inicio,
  hora_fin = EXCLUDED.hora_fin,
  estado = EXCLUDED.estado,
  updated_at = now();

-- Trigger function para sincronizar
CREATE OR REPLACE FUNCTION public.sync_citas_publicas_from_citas()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    DELETE FROM public.citas_publicas WHERE id = OLD.id;
    RETURN OLD;
  END IF;

  -- INSERT / UPDATE
  IF NEW.estado = 'cancelada' THEN
    DELETE FROM public.citas_publicas WHERE id = NEW.id;
    RETURN NEW;
  END IF;

  INSERT INTO public.citas_publicas (id, proveedor_id, fecha, hora_inicio, hora_fin, estado, created_at, updated_at)
  VALUES (NEW.id, NEW.proveedor_id, NEW.fecha, NEW.hora_inicio, NEW.hora_fin, NEW.estado, NEW.created_at, now())
  ON CONFLICT (id) DO UPDATE SET
    proveedor_id = EXCLUDED.proveedor_id,
    fecha = EXCLUDED.fecha,
    hora_inicio = EXCLUDED.hora_inicio,
    hora_fin = EXCLUDED.hora_fin,
    estado = EXCLUDED.estado,
    updated_at = now();

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_citas_publicas_from_citas ON public.citas;
CREATE TRIGGER trg_sync_citas_publicas_from_citas
AFTER INSERT OR UPDATE OR DELETE ON public.citas
FOR EACH ROW
EXECUTE FUNCTION public.sync_citas_publicas_from_citas();

-- Seguridad: RLS habilitado, solo lectura pública (sin PII)
ALTER TABLE public.citas_publicas ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'citas_publicas'
      AND policyname = 'Lectura pública de citas_publicas'
  ) THEN
    CREATE POLICY "Lectura pública de citas_publicas"
    ON public.citas_publicas
    FOR SELECT
    USING (true);
  END IF;
END $$;

-- Realtime: asegurar replica identity y publicación
ALTER TABLE public.citas_publicas REPLICA IDENTITY FULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'citas_publicas'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.citas_publicas;
  END IF;
END $$;