ALTER TABLE public.qard_viajes_pasajero
  ADD COLUMN IF NOT EXISTS retirado_at timestamptz,
  ADD COLUMN IF NOT EXISTS retiro_referencia text;

ALTER TABLE public.cobros_qr_tramo
  ADD COLUMN IF NOT EXISTS retirado_at timestamptz,
  ADD COLUMN IF NOT EXISTS retiro_referencia text;

CREATE INDEX IF NOT EXISTS idx_qvp_viaje_retiro ON public.qard_viajes_pasajero (viaje_id, retirado_at);
CREATE INDEX IF NOT EXISTS idx_cqt_viaje_retiro ON public.cobros_qr_tramo (viaje_id, retirado_at);

-- Backfill: los cobros ocurridos ANTES del retiro previo del viaje ya fueron pagados
UPDATE public.qard_viajes_pasajero p
SET retirado_at = v.retirado_at,
    retiro_referencia = v.retiro_referencia
FROM public.viajes_realizados v
WHERE p.viaje_id = v.id
  AND v.retirado_at IS NOT NULL
  AND p.retirado_at IS NULL
  AND COALESCE(p.bajada_at, p.subida_at, p.created_at) <= v.retirado_at;

UPDATE public.cobros_qr_tramo c
SET retirado_at = v.retirado_at,
    retiro_referencia = v.retiro_referencia
FROM public.viajes_realizados v
WHERE c.viaje_id = v.id
  AND v.retirado_at IS NOT NULL
  AND c.retirado_at IS NULL
  AND COALESCE(c.bajada_at, c.subida_at, c.created_at) <= v.retirado_at;

-- Los viajes en curso vuelven a quedar disponibles: el control ahora es por cobro
UPDATE public.viajes_realizados
SET retirado_at = NULL
WHERE estado = 'en_curso' AND retirado_at IS NOT NULL;