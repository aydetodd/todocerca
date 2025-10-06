-- Add status enum type for user availability
CREATE TYPE user_status AS ENUM ('available', 'busy', 'offline');

-- Add new fields to profiles table
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS apodo TEXT,
ADD COLUMN IF NOT EXISTS estado user_status DEFAULT 'offline';

-- Create proveedor_locations table for real-time location tracking
CREATE TABLE IF NOT EXISTS public.proveedor_locations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  latitude NUMERIC(10, 7) NOT NULL,
  longitude NUMERIC(10, 7) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  UNIQUE(user_id)
);

-- Create messages table for direct messaging and panic alerts
CREATE TABLE IF NOT EXISTS public.messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  receiver_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  message TEXT NOT NULL,
  is_panic BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Enable RLS on new tables
ALTER TABLE public.proveedor_locations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

-- RLS Policies for proveedor_locations
CREATE POLICY "Everyone can view proveedor_locations"
  ON public.proveedor_locations
  FOR SELECT
  USING (true);

CREATE POLICY "Users can insert their own location"
  ON public.proveedor_locations
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own location"
  ON public.proveedor_locations
  FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own location"
  ON public.proveedor_locations
  FOR DELETE
  USING (auth.uid() = user_id);

-- RLS Policies for messages
CREATE POLICY "Users can view their own messages and panic messages"
  ON public.messages
  FOR SELECT
  USING (
    auth.uid() = sender_id 
    OR auth.uid() = receiver_id 
    OR is_panic = true
  );

CREATE POLICY "Users can send messages"
  ON public.messages
  FOR INSERT
  WITH CHECK (auth.uid() = sender_id);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_proveedor_locations_user_id ON public.proveedor_locations(user_id);
CREATE INDEX IF NOT EXISTS idx_proveedor_locations_updated_at ON public.proveedor_locations(updated_at);
CREATE INDEX IF NOT EXISTS idx_messages_sender_id ON public.messages(sender_id);
CREATE INDEX IF NOT EXISTS idx_messages_receiver_id ON public.messages(receiver_id);
CREATE INDEX IF NOT EXISTS idx_messages_is_panic ON public.messages(is_panic);
CREATE INDEX IF NOT EXISTS idx_messages_created_at ON public.messages(created_at DESC);

-- Trigger to update proveedor_locations timestamp
CREATE TRIGGER update_proveedor_locations_updated_at
  BEFORE UPDATE ON public.proveedor_locations
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Enable realtime for new tables
ALTER PUBLICATION supabase_realtime ADD TABLE public.proveedor_locations;
ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;
ALTER PUBLICATION supabase_realtime ADD TABLE public.profiles;