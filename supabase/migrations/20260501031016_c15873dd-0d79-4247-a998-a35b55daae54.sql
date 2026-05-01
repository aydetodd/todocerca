-- Drop legacy unique index that prevented same phone from being registered
-- under different transport types (publico/foraneo/privado/taxi) for the same proveedor.
-- The canonical uniqueness is choferes_empresa_proveedor_telefono_type_key,
-- which correctly includes transport_type.
DROP INDEX IF EXISTS public.idx_choferes_empresa_telefono_proveedor;