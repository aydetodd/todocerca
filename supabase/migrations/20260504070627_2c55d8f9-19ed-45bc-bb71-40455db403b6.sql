ALTER TABLE public.productos
  ADD COLUMN IF NOT EXISTS route_geojson jsonb,
  ADD COLUMN IF NOT EXISTS route_trace_filename text,
  ADD COLUMN IF NOT EXISTS route_trace_updated_at timestamptz;