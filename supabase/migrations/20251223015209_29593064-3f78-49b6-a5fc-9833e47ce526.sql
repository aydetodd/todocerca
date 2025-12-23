-- Remove duplicate profile (consecutive_number = 36) for phone +526442296973
-- Keeping consecutive_number = 1

begin;

-- Safety check: only delete the specific duplicate profile row
delete from public.profiles
where id = '1f6843c8-f5d7-4427-bcec-acc285491047'
  and consecutive_number = 36
  and telefono = '+526442296973';

commit;