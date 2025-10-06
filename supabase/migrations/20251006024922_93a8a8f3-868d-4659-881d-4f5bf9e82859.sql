-- Borrar todos los registros de las tablas en el orden correcto para respetar foreign keys

-- 1. Tablas sin dependencias o tablas que dependen de otras
DELETE FROM fotos_productos;
DELETE FROM productos;
DELETE FROM chats;
DELETE FROM listings;
DELETE FROM job_postings;
DELETE FROM tracking_devices;
DELETE FROM tracking_groups;
DELETE FROM subscriptions;

-- 2. Tablas de usuarios
DELETE FROM proveedores;
DELETE FROM clientes;

-- 3. No borramos profiles ni auth.users ya que podrían causar problemas con la autenticación
-- Si deseas borrar profiles también, descomenta la siguiente línea:
-- DELETE FROM profiles;

-- Confirmar que las tablas están vacías
SELECT 'fotos_productos' as tabla, COUNT(*) as registros FROM fotos_productos
UNION ALL
SELECT 'productos', COUNT(*) FROM productos
UNION ALL
SELECT 'proveedores', COUNT(*) FROM proveedores
UNION ALL
SELECT 'clientes', COUNT(*) FROM clientes
UNION ALL
SELECT 'subscriptions', COUNT(*) FROM subscriptions
UNION ALL
SELECT 'chats', COUNT(*) FROM chats
UNION ALL
SELECT 'listings', COUNT(*) FROM listings
UNION ALL
SELECT 'job_postings', COUNT(*) FROM job_postings
UNION ALL
SELECT 'tracking_devices', COUNT(*) FROM tracking_devices
UNION ALL
SELECT 'tracking_groups', COUNT(*) FROM tracking_groups;