-- Limpiar completamente la base de datos
-- Eliminar todos los datos de las tablas en el orden correcto

TRUNCATE TABLE fotos_productos CASCADE;
TRUNCATE TABLE productos CASCADE;
TRUNCATE TABLE chats CASCADE;
TRUNCATE TABLE messages CASCADE;
TRUNCATE TABLE listings CASCADE;
TRUNCATE TABLE job_postings CASCADE;
TRUNCATE TABLE tracking_devices CASCADE;
TRUNCATE TABLE tracking_groups CASCADE;
TRUNCATE TABLE proveedor_locations CASCADE;
TRUNCATE TABLE subscriptions CASCADE;
TRUNCATE TABLE proveedores CASCADE;
TRUNCATE TABLE clientes CASCADE;
TRUNCATE TABLE password_recovery_codes CASCADE;
TRUNCATE TABLE profiles CASCADE;

-- Reiniciar la secuencia de consecutive_number
ALTER SEQUENCE profiles_consecutive_number_seq RESTART WITH 1;

-- Nota: Los usuarios en auth.users deben eliminarse manualmente desde el dashboard de Supabase
-- en Authentication > Users si deseas eliminarlos también