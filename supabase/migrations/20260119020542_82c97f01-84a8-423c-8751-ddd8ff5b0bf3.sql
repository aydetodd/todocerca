-- Add is_sos_trusted column to user_contacts table
ALTER TABLE public.user_contacts 
ADD COLUMN is_sos_trusted BOOLEAN DEFAULT false;

-- Add comment explaining the column
COMMENT ON COLUMN public.user_contacts.is_sos_trusted IS 'Whether this contact should receive SOS emergency alerts';