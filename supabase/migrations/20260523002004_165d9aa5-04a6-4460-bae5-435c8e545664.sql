SELECT cron.unschedule('close-overnight-trips-daily')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'close-overnight-trips-daily');

SELECT cron.schedule(
  'close-overnight-trips-daily',
  '5 7 * * *',
  $$select net.http_post(
    url:='https://kijwxiumskwztbjahuhv.supabase.co/functions/v1/close-overnight-trips',
    headers:='{"Content-Type":"application/json","apikey":"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imtpand4aXVtc2t3enRiamFodWh2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTcyNjc0NTYsImV4cCI6MjA3Mjg0MzQ1Nn0.28ZL0pxC00F8AZ4roMVLXdUsNG0Gdn53gxlunscGcKc"}'::jsonb,
    body:='{}'::jsonb
  ) as request_id;$$
);