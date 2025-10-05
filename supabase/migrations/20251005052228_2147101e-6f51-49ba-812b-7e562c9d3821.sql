-- Agregar columnas de ubicación a la tabla proveedores
ALTER TABLE public.proveedores
ADD COLUMN IF NOT EXISTS business_address text,
ADD COLUMN IF NOT EXISTS business_phone text,
ADD COLUMN IF NOT EXISTS latitude numeric(10, 8),
ADD COLUMN IF NOT EXISTS longitude numeric(11, 8),
ADD COLUMN IF NOT EXISTS description text;

-- Comentario sobre las columnas
COMMENT ON COLUMN public.proveedores.business_address IS 'Dirección completa del negocio';
COMMENT ON COLUMN public.proveedores.business_phone IS 'Teléfono del negocio (puede ser diferente al personal)';
COMMENT ON COLUMN public.proveedores.latitude IS 'Latitud de la ubicación del negocio';
COMMENT ON COLUMN public.proveedores.longitude IS 'Longitud de la ubicación del negocio';
COMMENT ON COLUMN public.proveedores.description IS 'Descripción del negocio';

-- Migrar datos existentes de providers a proveedores si existen
DO $$
DECLARE
  provider_record RECORD;
  proveedor_id_match uuid;
BEGIN
  FOR provider_record IN 
    SELECT p.*, pr.user_id 
    FROM providers p
    JOIN profiles pr ON p.profile_id = pr.id
  LOOP
    -- Buscar el proveedor correspondiente por user_id
    SELECT id INTO proveedor_id_match
    FROM proveedores
    WHERE user_id = provider_record.user_id
    LIMIT 1;
    
    -- Si existe, actualizar con los datos de ubicación
    IF proveedor_id_match IS NOT NULL THEN
      UPDATE proveedores
      SET 
        business_address = provider_record.business_address,
        business_phone = provider_record.business_phone,
        latitude = provider_record.latitude,
        longitude = provider_record.longitude,
        description = provider_record.description
      WHERE id = proveedor_id_match;
    END IF;
  END LOOP;
END $$;

-- Eliminar relaciones que dependen de providers
DROP TABLE IF EXISTS public.provider_categories CASCADE;
DROP TABLE IF EXISTS public.services_products CASCADE;
DROP TABLE IF EXISTS public.photos CASCADE;

-- Eliminar la tabla providers
DROP TABLE IF EXISTS public.providers CASCADE;