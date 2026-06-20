-- Renumerar viajes del 18-jun que comenzaron en #9 por el bug de cruce de medianoche.
-- Hacemos -8 para que queden #1..#6 (eran #9..#14).
-- Paso intermedio en negativo para no chocar con el unique (chofer, fecha, numero_viaje) si existiera.
UPDATE public.viajes_realizados
SET numero_viaje = -numero_viaje
WHERE fecha = '2026-06-18'
  AND chofer_id = 'a15cbd9e-b993-4020-a457-cf4d8bb9b4b3'
  AND numero_viaje BETWEEN 9 AND 14;

UPDATE public.viajes_realizados
SET numero_viaje = (-numero_viaje) - 8
WHERE fecha = '2026-06-18'
  AND chofer_id = 'a15cbd9e-b993-4020-a457-cf4d8bb9b4b3'
  AND numero_viaje BETWEEN -14 AND -9;