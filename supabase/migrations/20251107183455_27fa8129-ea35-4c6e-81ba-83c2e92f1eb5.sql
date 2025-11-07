-- Cambiar el estado por defecto de los proveedores a 'available' (verde)
-- Esto hace que los taxis aparezcan en el mapa desde el inicio

-- 1. Actualizar el estado por defecto de la columna
ALTER TABLE profiles 
ALTER COLUMN estado SET DEFAULT 'available'::user_status;

-- 2. Actualizar todos los proveedores existentes que estén en offline a available
UPDATE profiles 
SET estado = 'available'
WHERE role = 'proveedor' AND estado = 'offline';

-- 3. Crear una función para auto-activar proveedores al crear su registro
CREATE OR REPLACE FUNCTION auto_activate_proveedor()
RETURNS TRIGGER AS $$
BEGIN
  -- Si el nuevo usuario es proveedor, asegurarse de que inicie en 'available'
  IF NEW.role = 'proveedor' AND NEW.estado = 'offline' THEN
    NEW.estado := 'available';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 4. Crear trigger para auto-activar proveedores
DROP TRIGGER IF EXISTS trigger_auto_activate_proveedor ON profiles;
CREATE TRIGGER trigger_auto_activate_proveedor
  BEFORE INSERT ON profiles
  FOR EACH ROW
  EXECUTE FUNCTION auto_activate_proveedor();