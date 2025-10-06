
-- Limpiar todos los datos de usuarios y tablas relacionadas
-- Orden: de tablas dependientes a principales

-- 1. Eliminar fotos de productos
DELETE FROM fotos_productos;

-- 2. Eliminar productos
DELETE FROM productos;

-- 3. Eliminar chats
DELETE FROM chats;

-- 4. Eliminar mensajes
DELETE FROM messages;

-- 5. Eliminar ubicaciones de proveedores
DELETE FROM proveedor_locations;

-- 6. Eliminar suscripciones
DELETE FROM subscriptions;

-- 7. Eliminar clientes
DELETE FROM clientes;

-- 8. Eliminar proveedores
DELETE FROM proveedores;

-- 9. Eliminar perfiles (esto no elimina los usuarios de auth.users por el ON DELETE CASCADE)
DELETE FROM profiles;

-- 10. Eliminar todos los usuarios de autenticación
-- Nota: Esto eliminará en cascada los profiles automáticamente
DELETE FROM auth.users;
