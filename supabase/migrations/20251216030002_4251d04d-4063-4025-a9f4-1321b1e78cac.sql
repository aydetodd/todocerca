-- Tabla para almacenar contactos/amigos entre usuarios
CREATE TABLE public.user_contacts (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  contact_user_id uuid NOT NULL,
  nickname text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE(user_id, contact_user_id)
);

-- Agregar token de contacto único a profiles
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS contact_token uuid DEFAULT gen_random_uuid();

-- Índice para búsqueda por token
CREATE INDEX IF NOT EXISTS idx_profiles_contact_token ON profiles(contact_token);

-- Habilitar RLS
ALTER TABLE public.user_contacts ENABLE ROW LEVEL SECURITY;

-- Políticas RLS
CREATE POLICY "Users can view their own contacts"
ON public.user_contacts FOR SELECT
USING (auth.uid() = user_id OR auth.uid() = contact_user_id);

CREATE POLICY "Users can add contacts"
ON public.user_contacts FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their contacts"
ON public.user_contacts FOR DELETE
USING (auth.uid() = user_id);

-- Habilitar realtime para contactos
ALTER PUBLICATION supabase_realtime ADD TABLE user_contacts;