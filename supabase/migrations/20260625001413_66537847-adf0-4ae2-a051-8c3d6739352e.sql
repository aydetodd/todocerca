-- Agregar soporte dual (Teléfono del chofer / Raspberry Pi) a unidades_empresa
-- No rompe nada: por defecto toda unidad sigue usando teléfono.

ALTER TABLE public.unidades_empresa
  ADD COLUMN IF NOT EXISTS raspberry_pi_id text UNIQUE,
  ADD COLUMN IF NOT EXISTS usa_telefono boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS usa_raspberry boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS fecha_migracion_pi timestamptz,
  ADD COLUMN IF NOT EXISTS pi_last_seen timestamptz;

-- Invariante: una unidad no puede tener AMBOS sistemas activos simultáneamente.
-- (puede estar en transición con ambos = false momentáneamente, eso sí se permite)
ALTER TABLE public.unidades_empresa
  DROP CONSTRAINT IF EXISTS unidades_empresa_dual_system_check;

ALTER TABLE public.unidades_empresa
  ADD CONSTRAINT unidades_empresa_dual_system_check
  CHECK (NOT (usa_telefono = true AND usa_raspberry = true));

-- Índice para filtrar rápido en el dashboard de flota.
CREATE INDEX IF NOT EXISTS idx_unidades_empresa_sistema
  ON public.unidades_empresa (usa_raspberry, usa_telefono)
  WHERE is_active = true;
