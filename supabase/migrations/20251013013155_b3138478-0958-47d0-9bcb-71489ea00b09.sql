-- Crear secuencia para números de orden PRIMERO
CREATE SEQUENCE IF NOT EXISTS pedidos_numero_orden_seq START WITH 1;

-- Crear tabla de pedidos/órdenes
CREATE TABLE public.pedidos (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  numero_orden INTEGER NOT NULL DEFAULT nextval('pedidos_numero_orden_seq'::regclass),
  proveedor_id UUID NOT NULL REFERENCES public.proveedores(id) ON DELETE CASCADE,
  cliente_nombre TEXT NOT NULL,
  cliente_telefono TEXT NOT NULL,
  total NUMERIC(10,2) NOT NULL DEFAULT 0,
  estado TEXT NOT NULL DEFAULT 'pendiente' CHECK (estado IN ('pendiente', 'en_preparacion', 'listo', 'entregado', 'cancelado')),
  notas TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Crear tabla de items del pedido
CREATE TABLE public.items_pedido (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  pedido_id UUID NOT NULL REFERENCES public.pedidos(id) ON DELETE CASCADE,
  producto_id UUID NOT NULL REFERENCES public.productos(id) ON DELETE RESTRICT,
  cantidad INTEGER NOT NULL CHECK (cantidad > 0),
  precio_unitario NUMERIC(10,2) NOT NULL,
  subtotal NUMERIC(10,2) NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Índices para mejorar el rendimiento
CREATE INDEX idx_pedidos_proveedor ON public.pedidos(proveedor_id);
CREATE INDEX idx_pedidos_estado ON public.pedidos(estado);
CREATE INDEX idx_pedidos_created_at ON public.pedidos(created_at DESC);
CREATE INDEX idx_items_pedido_pedido_id ON public.items_pedido(pedido_id);

-- Habilitar Row Level Security
ALTER TABLE public.pedidos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.items_pedido ENABLE ROW LEVEL SECURITY;

-- Políticas RLS para pedidos
CREATE POLICY "Todos pueden crear pedidos"
ON public.pedidos
FOR INSERT
WITH CHECK (true);

CREATE POLICY "Todos pueden ver pedidos"
ON public.pedidos
FOR SELECT
USING (true);

CREATE POLICY "Proveedores pueden actualizar sus pedidos"
ON public.pedidos
FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM public.proveedores
    WHERE proveedores.id = pedidos.proveedor_id
    AND proveedores.user_id = auth.uid()
  )
);

-- Políticas RLS para items de pedido
CREATE POLICY "Todos pueden crear items de pedido"
ON public.items_pedido
FOR INSERT
WITH CHECK (true);

CREATE POLICY "Todos pueden ver items de pedido"
ON public.items_pedido
FOR SELECT
USING (true);

-- Trigger para actualizar updated_at en pedidos
CREATE TRIGGER update_pedidos_updated_at
BEFORE UPDATE ON public.pedidos
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Habilitar realtime para pedidos (para que proveedores vean nuevos pedidos en tiempo real)
ALTER PUBLICATION supabase_realtime ADD TABLE public.pedidos;