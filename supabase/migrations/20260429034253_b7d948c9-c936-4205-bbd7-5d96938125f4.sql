-- Eliminar cron previo si existe (idempotente)
DO $$
BEGIN
  PERFORM cron.unschedule('process-daily-settlements');
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

-- Agendar cron diario 06:00 UTC = 23:00 Hermosillo (UTC-7)
SELECT cron.schedule(
  'process-daily-settlements',
  '0 6 * * *',
  $$
  SELECT net.http_post(
    url := 'https://kijwxiumskwztbjahuhv.supabase.co/functions/v1/process-daily-settlements',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imtpand4aXVtc2t3enRiamFodWh2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTcyNjc0NTYsImV4cCI6MjA3Mjg0MzQ1Nn0.28ZL0pxC00F8AZ4roMVLXdUsNG0Gdn53gxlunscGcKc'
    ),
    body := '{}'::jsonb
  );
  $$
);