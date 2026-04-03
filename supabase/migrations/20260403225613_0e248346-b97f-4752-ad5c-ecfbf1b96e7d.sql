SELECT cron.unschedule('expire-transferred-tickets');

SELECT cron.schedule(
  'expire-transferred-tickets',
  '0 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://kijwxiumskwztbjahuhv.supabase.co/functions/v1/expire-transferred-tickets',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || current_setting('supabase.service_role_key', true),
      'Content-Type', 'application/json'
    ),
    body := '{}'::jsonb
  );
  $$
);
