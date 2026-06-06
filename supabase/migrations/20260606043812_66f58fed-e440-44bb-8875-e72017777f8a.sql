ALTER TABLE public.unidades_empresa
  ADD COLUMN IF NOT EXISTS esp32_wifi_ssid text,
  ADD COLUMN IF NOT EXISTS esp32_wifi_password text;