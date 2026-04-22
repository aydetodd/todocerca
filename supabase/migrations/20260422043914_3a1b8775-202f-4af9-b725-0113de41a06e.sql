ALTER TABLE public.verificaciones_descuento DROP CONSTRAINT IF EXISTS verificaciones_descuento_tipo_check;
ALTER TABLE public.verificaciones_descuento ADD CONSTRAINT verificaciones_descuento_tipo_check CHECK (
  tipo = ANY (ARRAY[
    'estudiante'::text,
    'tercera_edad'::text,
    'nino_menor_5'::text,
    'nino_5_10'::text,
    'discapacitado'::text,
    'embarazada'::text,
    'ceguera_total'::text
  ])
);

ALTER TABLE public.verificaciones_descuento DROP CONSTRAINT IF EXISTS verificaciones_descuento_estado_check;
ALTER TABLE public.verificaciones_descuento ADD CONSTRAINT verificaciones_descuento_estado_check CHECK (
  estado = ANY (ARRAY[
    'pendiente'::text,
    'aprobado'::text,
    'rechazado'::text,
    'incompleto'::text
  ])
);