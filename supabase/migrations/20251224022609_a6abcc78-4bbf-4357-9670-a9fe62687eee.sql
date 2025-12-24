-- Tabla de comentarios públicos para listings (chat abierto)
CREATE TABLE public.listing_comments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  listing_id UUID NOT NULL REFERENCES public.listings(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  message TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Índices para mejor rendimiento
CREATE INDEX idx_listing_comments_listing_id ON public.listing_comments(listing_id);
CREATE INDEX idx_listing_comments_created_at ON public.listing_comments(created_at);

-- Habilitar RLS
ALTER TABLE public.listing_comments ENABLE ROW LEVEL SECURITY;

-- Políticas RLS: Todos pueden ver comentarios (chat público)
CREATE POLICY "Cualquiera puede ver comentarios de listings"
  ON public.listing_comments
  FOR SELECT
  USING (true);

-- Solo usuarios autenticados pueden comentar
CREATE POLICY "Usuarios autenticados pueden crear comentarios"
  ON public.listing_comments
  FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL AND auth.uid() = user_id);

-- Usuarios pueden eliminar sus propios comentarios
CREATE POLICY "Usuarios pueden eliminar sus propios comentarios"
  ON public.listing_comments
  FOR DELETE
  USING (auth.uid() = user_id);

-- Habilitar realtime para actualizaciones en vivo
ALTER PUBLICATION supabase_realtime ADD TABLE public.listing_comments;