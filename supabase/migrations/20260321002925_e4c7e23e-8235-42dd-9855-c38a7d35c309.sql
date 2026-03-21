
SELECT cron.schedule(
  'expire-transferred-tickets',
  '0 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://kijwxiumskwztbjahuhv.supabase.co/functions/v1/expire-transferred-tickets',
    headers := '{"Authorization": "Bearer ' || current_setting('supabase.service_role_key', true) || '", "Content-Type": "application/json"}'::jsonb,
    body := '{}'::jsonb
  );
  $$
);
