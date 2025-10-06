-- Set default estado to 'offline' for new users
ALTER TABLE profiles 
ALTER COLUMN estado SET DEFAULT 'offline'::user_status;

-- Update existing users without a status to offline
UPDATE profiles 
SET estado = 'offline'::user_status 
WHERE estado IS NULL;