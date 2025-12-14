-- Ensure REPLICA IDENTITY FULL for profiles table (required for realtime updates)
ALTER TABLE public.profiles REPLICA IDENTITY FULL;