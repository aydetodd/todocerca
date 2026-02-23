
-- ===== QR BOLETO DIGITAL - ESQUEMA COMPLETO (CORREGIDO) =====

-- =============================================
-- 1. VERIFICACIÓN DE CONCESIONARIOS
-- =============================================

CREATE TABLE public.verificaciones_concesionario (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  concesionario_id UUID NOT NULL REFERENCES public.proveedores(id) ON DELETE CASCADE,
  estado TEXT NOT NULL DEFAULT 'draft' CHECK (estado IN ('draft', 'pending', 'in_review', 'approved', 'rejected')),
  tipo_negocio TEXT CHECK (tipo_negocio IN ('persona_fisica', 'persona_moral')),
  razon_social TEXT,
  rfc TEXT,
  curp TEXT,
  telefono_verificado BOOLEAN DEFAULT false,
  admin_revisado_por UUID,
  admin_notas TEXT,
  motivo_rechazo TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX idx_verificaciones_rfc_unique 
ON public.verificaciones_concesionario(rfc) 
WHERE estado = 'approved' AND rfc IS NOT NULL;

ALTER TABLE public.verificaciones_concesionario ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Concesionarios ven su verificación"
ON public.verificaciones_concesionario FOR SELECT
USING (EXISTS (
  SELECT 1 FROM proveedores p WHERE p.id = concesionario_id AND p.user_id = auth.uid()
) OR public.is_admin());

CREATE POLICY "Concesionarios crean su verificación"
ON public.verificaciones_concesionario FOR INSERT
WITH CHECK (EXISTS (
  SELECT 1 FROM proveedores p WHERE p.id = concesionario_id AND p.user_id = auth.uid()
));

CREATE POLICY "Concesionarios actualizan su verificación en draft"
ON public.verificaciones_concesionario FOR UPDATE
USING (
  (EXISTS (SELECT 1 FROM proveedores p WHERE p.id = concesionario_id AND p.user_id = auth.uid()) AND estado IN ('draft', 'rejected'))
  OR public.is_admin()
);

CREATE TRIGGER update_verificaciones_updated_at
BEFORE UPDATE ON public.verificaciones_concesionario
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =============================================
-- 2. DOCUMENTOS DE CONCESIONARIO
-- =============================================

CREATE TABLE public.documentos_concesionario (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  concesionario_id UUID NOT NULL REFERENCES public.proveedores(id) ON DELETE CASCADE,
  verificacion_id UUID NOT NULL REFERENCES public.verificaciones_concesionario(id) ON DELETE CASCADE,
  tipo_documento TEXT NOT NULL CHECK (tipo_documento IN (
    'ine_frente', 'ine_reverso', 'concesion_imtes', 'constancia_rfc', 
    'comprobante_domicilio', 'tarjeta_circulacion', 'foto_unidad_frente', 'foto_unidad_lateral'
  )),
  url_archivo TEXT NOT NULL,
  hash_archivo TEXT,
  tamano_archivo INTEGER,
  tipo_mime TEXT,
  estado_verificacion TEXT DEFAULT 'pending' CHECK (estado_verificacion IN ('pending', 'approved', 'rejected')),
  verificado_por UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.documentos_concesionario ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Concesionarios gestionan sus documentos"
ON public.documentos_concesionario FOR ALL
USING (EXISTS (
  SELECT 1 FROM proveedores p WHERE p.id = concesionario_id AND p.user_id = auth.uid()
) OR public.is_admin());

CREATE TRIGGER update_documentos_updated_at
BEFORE UPDATE ON public.documentos_concesionario
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =============================================
-- 3. AUDIT LOG DE VERIFICACIÓN
-- =============================================

CREATE TABLE public.audit_log_verificacion (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  concesionario_id UUID NOT NULL REFERENCES public.proveedores(id) ON DELETE CASCADE,
  verificacion_id UUID REFERENCES public.verificaciones_concesionario(id) ON DELETE SET NULL,
  admin_id UUID,
  accion TEXT NOT NULL,
  detalles JSONB,
  ip TEXT,
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.audit_log_verificacion ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Solo admins ven audit logs"
ON public.audit_log_verificacion FOR SELECT
USING (public.is_admin());

CREATE POLICY "Sistema puede insertar audit logs"
ON public.audit_log_verificacion FOR INSERT
WITH CHECK (true);

-- =============================================
-- 4. DETALLES DE VERIFICACIÓN POR UNIDAD
-- =============================================

CREATE TABLE public.detalles_verificacion_unidad (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  verificacion_id UUID NOT NULL REFERENCES public.verificaciones_concesionario(id) ON DELETE CASCADE,
  unidad_id UUID REFERENCES public.unidades_empresa(id) ON DELETE SET NULL,
  numero_economico TEXT NOT NULL,
  placas TEXT NOT NULL,
  modelo TEXT,
  linea TEXT,
  urls_fotos JSONB DEFAULT '[]'::jsonb,
  estado_verificacion TEXT DEFAULT 'pending' CHECK (estado_verificacion IN ('pending', 'approved', 'rejected')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX idx_verificacion_unidad_numero_economico 
ON public.detalles_verificacion_unidad(numero_economico) 
WHERE estado_verificacion != 'rejected';

CREATE UNIQUE INDEX idx_verificacion_unidad_placas 
ON public.detalles_verificacion_unidad(placas) 
WHERE estado_verificacion != 'rejected';

ALTER TABLE public.detalles_verificacion_unidad ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Concesionarios ven detalles de sus unidades"
ON public.detalles_verificacion_unidad FOR ALL
USING (EXISTS (
  SELECT 1 FROM verificaciones_concesionario vc
  JOIN proveedores p ON p.id = vc.concesionario_id
  WHERE vc.id = verificacion_id AND (p.user_id = auth.uid() OR public.is_admin())
));

CREATE TRIGGER update_detalles_verificacion_updated_at
BEFORE UPDATE ON public.detalles_verificacion_unidad
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =============================================
-- 5. CUENTAS STRIPE CONNECT
-- =============================================

CREATE TABLE public.cuentas_conectadas (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  concesionario_id UUID NOT NULL REFERENCES public.proveedores(id) ON DELETE CASCADE UNIQUE,
  stripe_account_id TEXT UNIQUE,
  estado_stripe TEXT DEFAULT 'pending' CHECK (estado_stripe IN ('pending', 'onboarding', 'active', 'restricted', 'disabled')),
  pagos_habilitados BOOLEAN DEFAULT false,
  transferencias_habilitadas BOOLEAN DEFAULT false,
  info_bancaria JSONB,
  requisitos_pendientes JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.cuentas_conectadas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Concesionarios ven su cuenta conectada"
ON public.cuentas_conectadas FOR SELECT
USING (EXISTS (
  SELECT 1 FROM proveedores p WHERE p.id = concesionario_id AND p.user_id = auth.uid()
) OR public.is_admin());

CREATE POLICY "Concesionarios crean su cuenta conectada"
ON public.cuentas_conectadas FOR INSERT
WITH CHECK (EXISTS (
  SELECT 1 FROM proveedores p WHERE p.id = concesionario_id AND p.user_id = auth.uid()
));

CREATE POLICY "Admins gestionan cuentas conectadas"
ON public.cuentas_conectadas FOR ALL
USING (public.is_admin());

CREATE TRIGGER update_cuentas_conectadas_updated_at
BEFORE UPDATE ON public.cuentas_conectadas
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =============================================
-- 6. CUENTAS DE BOLETOS (NO SALDO)
-- =============================================

CREATE TABLE public.cuentas_boletos (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL UNIQUE,
  ticket_count INTEGER NOT NULL DEFAULT 0,
  total_comprado INTEGER NOT NULL DEFAULT 0,
  total_usado INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.cuentas_boletos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Usuarios ven su cuenta de boletos"
ON public.cuentas_boletos FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Usuarios gestionan su cuenta de boletos"
ON public.cuentas_boletos FOR ALL
USING (auth.uid() = user_id OR public.is_admin());

CREATE TRIGGER update_cuentas_boletos_updated_at
BEFORE UPDATE ON public.cuentas_boletos
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =============================================
-- 7. TICKETS QR
-- =============================================

CREATE TABLE public.qr_tickets (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  token UUID NOT NULL DEFAULT gen_random_uuid() UNIQUE,
  amount NUMERIC(10,2) NOT NULL DEFAULT 9.00,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'used', 'cancelled', 'expired')),
  generated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  used_at TIMESTAMPTZ,
  unidad_uso_id UUID,
  ruta_uso_id UUID,
  chofer_id UUID,
  dispositivo_uso TEXT,
  latitud_validacion DOUBLE PRECISION,
  longitud_validacion DOUBLE PRECISION,
  is_transferred BOOLEAN NOT NULL DEFAULT false,
  transferred_to TEXT,
  transfer_expires_at TIMESTAMPTZ,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_qr_tickets_user ON public.qr_tickets(user_id);
CREATE INDEX idx_qr_tickets_token ON public.qr_tickets(token);
CREATE INDEX idx_qr_tickets_status ON public.qr_tickets(status);
CREATE INDEX idx_qr_tickets_transfer_expires ON public.qr_tickets(transfer_expires_at) WHERE is_transferred = true AND status = 'active';

ALTER TABLE public.qr_tickets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Usuarios ven sus tickets"
ON public.qr_tickets FOR SELECT
USING (auth.uid() = user_id OR public.is_admin());

CREATE POLICY "Usuarios crean sus tickets"
ON public.qr_tickets FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Sistema actualiza tickets"
ON public.qr_tickets FOR UPDATE
USING (auth.uid() = user_id OR public.is_admin());

-- =============================================
-- 8. TRANSACCIONES DE BOLETOS
-- =============================================

CREATE TABLE public.transacciones_boletos (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  tipo TEXT NOT NULL CHECK (tipo IN ('compra', 'uso', 'transferencia_expirada', 'reembolso')),
  cantidad_boletos INTEGER NOT NULL,
  monto_total NUMERIC(10,2) NOT NULL,
  stripe_payment_id TEXT,
  qr_ticket_id UUID REFERENCES public.qr_tickets(id) ON DELETE SET NULL,
  estado TEXT NOT NULL DEFAULT 'completado' CHECK (estado IN ('pendiente', 'completado', 'fallido')),
  descripcion TEXT,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_transacciones_user ON public.transacciones_boletos(user_id);
CREATE INDEX idx_transacciones_tipo ON public.transacciones_boletos(tipo);

ALTER TABLE public.transacciones_boletos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Usuarios ven sus transacciones"
ON public.transacciones_boletos FOR SELECT
USING (auth.uid() = user_id OR public.is_admin());

CREATE POLICY "Sistema crea transacciones"
ON public.transacciones_boletos FOR INSERT
WITH CHECK (auth.uid() = user_id OR public.is_admin());

-- =============================================
-- 9. LIQUIDACIONES DIARIAS
-- =============================================

CREATE TABLE public.liquidaciones_diarias (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  cuenta_conectada_id UUID NOT NULL REFERENCES public.cuentas_conectadas(id) ON DELETE CASCADE,
  fecha_liquidacion DATE NOT NULL,
  total_boletos INTEGER NOT NULL DEFAULT 0,
  monto_valor_facial NUMERIC(10,2) NOT NULL DEFAULT 0,
  monto_comision_todocerca NUMERIC(10,2) NOT NULL DEFAULT 0,
  monto_fee_stripe_connect NUMERIC(10,2) NOT NULL DEFAULT 0,
  monto_neto NUMERIC(10,2) NOT NULL DEFAULT 0,
  stripe_transfer_id TEXT,
  estado TEXT NOT NULL DEFAULT 'pending' CHECK (estado IN ('pending', 'processing', 'completed', 'failed')),
  fecha_procesamiento TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX idx_liquidaciones_cuenta_fecha 
ON public.liquidaciones_diarias(cuenta_conectada_id, fecha_liquidacion);

ALTER TABLE public.liquidaciones_diarias ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Concesionarios ven sus liquidaciones"
ON public.liquidaciones_diarias FOR SELECT
USING (EXISTS (
  SELECT 1 FROM cuentas_conectadas cc
  JOIN proveedores p ON p.id = cc.concesionario_id
  WHERE cc.id = cuenta_conectada_id AND (p.user_id = auth.uid() OR public.is_admin())
));

CREATE TRIGGER update_liquidaciones_updated_at
BEFORE UPDATE ON public.liquidaciones_diarias
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =============================================
-- 10. LOGS DE VALIDACIÓN QR
-- =============================================

CREATE TABLE public.logs_validacion_qr (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  qr_ticket_id UUID REFERENCES public.qr_tickets(id) ON DELETE SET NULL,
  unidad_id UUID,
  chofer_id UUID,
  resultado TEXT NOT NULL CHECK (resultado IN ('valid', 'invalid', 'fraud', 'expired', 'error')),
  mensaje_error TEXT,
  latitud DOUBLE PRECISION,
  longitud DOUBLE PRECISION,
  dispositivo TEXT,
  ip TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_logs_validacion_ticket ON public.logs_validacion_qr(qr_ticket_id);
CREATE INDEX idx_logs_validacion_fecha ON public.logs_validacion_qr(created_at);

ALTER TABLE public.logs_validacion_qr ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins ven todos los logs"
ON public.logs_validacion_qr FOR SELECT
USING (public.is_admin());

CREATE POLICY "Sistema inserta logs"
ON public.logs_validacion_qr FOR INSERT
WITH CHECK (true);

-- =============================================
-- 11. INTENTOS DE FRAUDE
-- =============================================

CREATE TABLE public.intentos_fraude (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  qr_ticket_id UUID NOT NULL REFERENCES public.qr_tickets(id) ON DELETE CASCADE,
  usuario_id UUID,
  fecha_uso_original TIMESTAMPTZ,
  unidad_uso_original_id UUID,
  ruta_uso_original TEXT,
  lat_original DOUBLE PRECISION,
  lng_original DOUBLE PRECISION,
  fecha_intento TIMESTAMPTZ NOT NULL DEFAULT now(),
  unidad_detecto_id UUID,
  ruta_detecto TEXT,
  lat_detecto DOUBLE PRECISION,
  lng_detecto DOUBLE PRECISION,
  chofer_detecto_id UUID,
  tipo_fraude TEXT DEFAULT 'reuse' CHECK (tipo_fraude IN ('reuse', 'counterfeit', 'expired_transfer', 'impossible_speed', 'other')),
  severidad TEXT DEFAULT 'low' CHECK (severidad IN ('low', 'medium', 'high', 'critical')),
  distancia_km DOUBLE PRECISION,
  tiempo_transcurrido_minutos INTEGER,
  total_intentos_usuario INTEGER DEFAULT 1,
  total_intentos_qr INTEGER DEFAULT 1,
  evidencia JSONB,
  reportado_admin BOOLEAN DEFAULT false,
  fecha_reporte TIMESTAMPTZ,
  accion_tomada TEXT,
  resuelto BOOLEAN DEFAULT false,
  fecha_resolucion TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_intentos_fraude_usuario ON public.intentos_fraude(usuario_id);
CREATE INDEX idx_intentos_fraude_ticket ON public.intentos_fraude(qr_ticket_id);
CREATE INDEX idx_intentos_fraude_severidad ON public.intentos_fraude(severidad);

ALTER TABLE public.intentos_fraude ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins gestionan fraudes"
ON public.intentos_fraude FOR ALL
USING (public.is_admin());

CREATE POLICY "Sistema registra fraudes"
ON public.intentos_fraude FOR INSERT
WITH CHECK (true);

-- =============================================
-- 12. Agregar columnas faltantes a unidades_empresa
-- =============================================

ALTER TABLE public.unidades_empresa 
ADD COLUMN IF NOT EXISTS is_verified BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS anio INTEGER,
ADD COLUMN IF NOT EXISTS linea TEXT;

-- Políticas para unidades_empresa (si no existen)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'unidades_empresa' AND policyname = 'Lectura pública de unidades verificadas'
  ) THEN
    CREATE POLICY "Lectura pública de unidades verificadas"
    ON public.unidades_empresa FOR SELECT
    USING (is_active = true AND is_verified = true);
  END IF;
END $$;

-- =============================================
-- 13. Función: Crear cuenta de boletos automáticamente
-- =============================================

CREATE OR REPLACE FUNCTION public.ensure_boletos_account()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.cuentas_boletos (user_id, ticket_count)
  VALUES (NEW.user_id, 0)
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER trigger_create_boletos_account
AFTER INSERT ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.ensure_boletos_account();
