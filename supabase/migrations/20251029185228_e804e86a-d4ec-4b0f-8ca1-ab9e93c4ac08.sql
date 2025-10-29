-- Agregar columnas faltantes a tracking_groups
ALTER TABLE public.tracking_groups 
ADD COLUMN IF NOT EXISTS subscription_status TEXT CHECK (subscription_status IN ('active', 'expired', 'cancelled')) DEFAULT 'expired',
ADD COLUMN IF NOT EXISTS subscription_end TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();

-- Trigger para updated_at si no existe
DROP TRIGGER IF EXISTS update_tracking_groups_updated_at ON public.tracking_groups;
CREATE TRIGGER update_tracking_groups_updated_at
  BEFORE UPDATE ON public.tracking_groups
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();