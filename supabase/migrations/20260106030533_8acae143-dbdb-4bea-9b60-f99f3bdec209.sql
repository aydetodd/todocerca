-- Allow post owners to mark public listing comments as read
-- (Needed so unread counters clear when the owner opens the chat.)

ALTER TABLE public.listing_comments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Owner can update listing comments" ON public.listing_comments;

CREATE POLICY "Owner can update listing comments"
ON public.listing_comments
FOR UPDATE
USING (
  EXISTS (
    SELECT 1
    FROM public.listings l
    JOIN public.profiles p ON p.id = l.profile_id
    WHERE l.id = public.listing_comments.listing_id
      AND p.user_id = auth.uid()
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.listings l
    JOIN public.profiles p ON p.id = l.profile_id
    WHERE l.id = public.listing_comments.listing_id
      AND p.user_id = auth.uid()
  )
);
