-- Eliminar completamente TODOS los usuarios de auth.users
-- ADVERTENCIA: Esto eliminará permanentemente todos los usuarios incluidos los soft-deleted

-- Primero, eliminar los usuarios de forma permanente
DELETE FROM auth.users;

-- Limpiar sesiones activas
DELETE FROM auth.sessions;

-- Limpiar refresh tokens
DELETE FROM auth.refresh_tokens;

-- Limpiar identidades
DELETE FROM auth.identities;

-- Nota: Esto es una limpieza COMPLETA de autenticación