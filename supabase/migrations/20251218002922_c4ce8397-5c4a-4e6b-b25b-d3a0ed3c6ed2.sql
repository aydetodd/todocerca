-- Enable full row data for realtime on profiles table
ALTER TABLE public.profiles REPLICA IDENTITY FULL;