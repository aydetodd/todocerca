ALTER TABLE cuentas_conectadas 
ADD COLUMN frecuencia_liquidacion text NOT NULL DEFAULT 'daily' 
CHECK (frecuencia_liquidacion IN ('daily', 'weekly', 'monthly'));