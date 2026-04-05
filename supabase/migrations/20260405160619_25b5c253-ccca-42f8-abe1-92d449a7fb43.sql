-- Tabla de verificaciones de descuento social (estudiante / tercera edad)
CREATE TABLE public.verificaciones_descuento (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  tipo text NOT NULL CHECK (tipo IN ('estudiante', 'tercera_edad')),
  estado text NOT NULL DEFAULT 'pendiente' CHECK (estado IN ('pendiente', 'aprobado', 'rechazado')),
  url_credencial text NOT NULL,
  device_id text,
  admin_notas text,
  aprobado_por uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, tipo)
);

ALTER TABLE public.verificaciones_descuento ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Usuarios ven sus verificaciones descuento"
  ON public.verificaciones_descuento FOR SELECT
  TO public
  USING (auth.uid() = user_id OR is_admin());

CREATE POLICY "Usuarios crean verificaciones descuento"
  ON public.verificaciones_descuento FOR INSERT
  TO public
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Admins gestionan verificaciones descuento"
  ON public.verificaciones_descuento FOR UPDATE
  TO public
  USING (is_admin());

-- Agregar ticket_type y device_id a qr_tickets
ALTER TABLE public.qr_tickets 
  ADD COLUMN IF NOT EXISTS ticket_type text NOT NULL DEFAULT 'normal',
  ADD COLUMN IF NOT EXISTS device_id text;