-- Normalizar municipio en reportes existentes
UPDATE public.citizen_reports
SET city = 'Cajeme'
WHERE city ILIKE 'Ciudad Obregón' OR city ILIKE 'Ciudad Obregon';

-- Rellenar nulos en zona Cajeme (rango aproximado lat/lng)
UPDATE public.citizen_reports
SET city = 'Cajeme'
WHERE city IS NULL
  AND lat BETWEEN 27.30 AND 27.65
  AND lng BETWEEN -110.10 AND -109.75;

-- Rellenar nulos en zona Hermosillo
UPDATE public.citizen_reports
SET city = 'Hermosillo'
WHERE city IS NULL
  AND lat BETWEEN 28.95 AND 29.30
  AND lng BETWEEN -111.15 AND -110.80;