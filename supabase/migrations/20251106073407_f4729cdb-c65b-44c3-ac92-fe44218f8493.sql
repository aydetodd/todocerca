-- Limpiar ubicaciones de usuarios que ya no son miembros
DELETE FROM tracking_member_locations tml
WHERE NOT EXISTS (
  SELECT 1 FROM tracking_group_members tgm
  WHERE tgm.user_id = tml.user_id 
  AND tgm.group_id = tml.group_id
);

-- Crear función para limpiar ubicación cuando se elimina un miembro
CREATE OR REPLACE FUNCTION cleanup_member_location()
RETURNS TRIGGER AS $$
BEGIN
  -- Eliminar la ubicación del miembro cuando se elimina de un grupo
  DELETE FROM tracking_member_locations
  WHERE user_id = OLD.user_id
  AND group_id = OLD.group_id;
  
  RETURN OLD;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Crear trigger que se ejecuta al eliminar un miembro
DROP TRIGGER IF EXISTS cleanup_location_on_member_removal ON tracking_group_members;
CREATE TRIGGER cleanup_location_on_member_removal
AFTER DELETE ON tracking_group_members
FOR EACH ROW
EXECUTE FUNCTION cleanup_member_location();

-- Comentario explicativo
COMMENT ON FUNCTION cleanup_member_location() IS 'Limpia automáticamente la ubicación de un miembro cuando se elimina del grupo';