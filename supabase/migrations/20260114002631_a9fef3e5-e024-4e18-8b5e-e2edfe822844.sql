-- La tabla votos ya tiene: user_id, opcion_id, fecha_voto, telefono, observacion
-- Solo necesitamos asegurarnos de que 'telefono' y 'observacion' estén disponibles
-- y añadir constraint si no existe

-- Verificar que las columnas existan (ya existen según types.ts)
-- telefono: últimos 3 dígitos del teléfono
-- observacion: campo para observaciones del votante

-- No hay cambios de schema necesarios, las columnas ya existen en la tabla votos