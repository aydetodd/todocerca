
-- Trigger: when a user sends a message TO the system account, 
-- auto-forward a notification to admin (consecutive_number = 1)
CREATE OR REPLACE FUNCTION public.forward_system_reply_to_admin()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  system_user_id UUID := '00000000-0000-0000-0000-000000000001';
  admin_user_id UUID;
  sender_name TEXT;
BEGIN
  -- Only trigger when someone sends TO the system user
  IF NEW.receiver_id = system_user_id AND NEW.sender_id != system_user_id THEN
    -- Find the admin user (consecutive_number = 1)
    SELECT user_id INTO admin_user_id
    FROM profiles
    WHERE consecutive_number = 1
    LIMIT 1;

    -- Don't forward if admin is the sender
    IF admin_user_id IS NOT NULL AND admin_user_id != NEW.sender_id THEN
      -- Get sender name
      SELECT COALESCE(apodo, nombre, 'Usuario') INTO sender_name
      FROM profiles
      WHERE user_id = NEW.sender_id
      LIMIT 1;

      -- Send notification to admin's personal inbox
      INSERT INTO messages (sender_id, receiver_id, message, is_panic, is_read)
      VALUES (
        system_user_id,
        admin_user_id,
        '📩 Nuevo mensaje de ' || sender_name || ' en el canal TodoCerca:' || E'\n\n' || NEW.message,
        false,
        false
      );
    END IF;
  END IF;

  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    RAISE WARNING 'Error forwarding system reply: %', SQLERRM;
    RETURN NEW;
END;
$function$;

CREATE TRIGGER forward_system_replies
AFTER INSERT ON messages
FOR EACH ROW
EXECUTE FUNCTION forward_system_reply_to_admin();
