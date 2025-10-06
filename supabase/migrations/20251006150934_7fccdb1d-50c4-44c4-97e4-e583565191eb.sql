-- Add consecutive number field to profiles table
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS consecutive_number SERIAL;

-- Create a sequence for consecutive numbers (if it doesn't exist)
CREATE SEQUENCE IF NOT EXISTS profiles_consecutive_number_seq;

-- Update existing profiles to have consecutive numbers based on creation date
DO $$
DECLARE
  profile_record RECORD;
  counter INTEGER := 1;
BEGIN
  FOR profile_record IN 
    SELECT id FROM profiles ORDER BY created_at ASC
  LOOP
    UPDATE profiles 
    SET consecutive_number = counter 
    WHERE id = profile_record.id;
    counter := counter + 1;
  END LOOP;
END $$;

-- Set the sequence to start from the next number
SELECT setval('profiles_consecutive_number_seq', (SELECT COALESCE(MAX(consecutive_number), 0) + 1 FROM profiles));

-- Alter the column to use the sequence as default
ALTER TABLE profiles ALTER COLUMN consecutive_number SET DEFAULT nextval('profiles_consecutive_number_seq');