-- Add is_read column to listing_comments for tracking if owner has read the comment
ALTER TABLE public.listing_comments ADD COLUMN is_read boolean DEFAULT false;

-- Enable realtime for this table
ALTER TABLE public.listing_comments REPLICA IDENTITY FULL;

-- Add table to realtime publication if not already added
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND tablename = 'listing_comments'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE listing_comments;
  END IF;
END $$;