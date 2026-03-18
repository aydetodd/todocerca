-- Fix: Replace self-referencing subquery in profiles UPDATE policy
-- with the existing SECURITY DEFINER function get_current_user_role()

DROP POLICY IF EXISTS "Users can update their own profile" ON public.profiles;

CREATE POLICY "Users can update their own profile"
  ON public.profiles FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (
    user_id = auth.uid()
    AND role = public.get_current_user_role()
  );