-- Add is_read column to messages table
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS is_read boolean DEFAULT false;

-- Update existing messages as read (since they've likely been seen)
UPDATE public.messages SET is_read = true WHERE is_read IS NULL OR is_read = false;