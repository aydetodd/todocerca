-- Add invite_token column for link-based invitations
ALTER TABLE tracking_invitations 
ADD COLUMN invite_token uuid DEFAULT gen_random_uuid() UNIQUE;

-- Make phone_number nullable for link invitations
ALTER TABLE tracking_invitations 
ALTER COLUMN phone_number DROP NOT NULL;

-- Update RLS to allow viewing invitations by token
CREATE POLICY "Anyone can view invitation by token"
ON tracking_invitations
FOR SELECT
USING (invite_token IS NOT NULL);

-- Policy for accepting via token
CREATE POLICY "Users can update invitation status by token"
ON tracking_invitations
FOR UPDATE
USING (invite_token IS NOT NULL AND status = 'pending');