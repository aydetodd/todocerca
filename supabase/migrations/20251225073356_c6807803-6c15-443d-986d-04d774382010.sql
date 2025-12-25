-- Agregar campo de tarifa por kilómetro en profiles (para taxistas)
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS tarifa_km NUMERIC(10, 2) DEFAULT 15.00;

-- Crear tabla para solicitudes de taxi
CREATE TABLE public.taxi_requests (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  passenger_id UUID NOT NULL,
  driver_id UUID NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  
  -- Ubicaciones
  pickup_lat NUMERIC(10, 7) NOT NULL,
  pickup_lng NUMERIC(10, 7) NOT NULL,
  pickup_address TEXT,
  destination_lat NUMERIC(10, 7) NOT NULL,
  destination_lng NUMERIC(10, 7) NOT NULL,
  destination_address TEXT,
  driver_start_lat NUMERIC(10, 7),
  driver_start_lng NUMERIC(10, 7),
  
  -- Kilometraje y tarifa pactados
  distance_km NUMERIC(10, 2) NOT NULL,
  tarifa_km NUMERIC(10, 2) NOT NULL,
  total_fare NUMERIC(10, 2) NOT NULL,
  
  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  accepted_at TIMESTAMP WITH TIME ZONE,
  completed_at TIMESTAMP WITH TIME ZONE,
  cancelled_at TIMESTAMP WITH TIME ZONE
);

-- Índices para búsqueda eficiente
CREATE INDEX idx_taxi_requests_passenger ON public.taxi_requests(passenger_id);
CREATE INDEX idx_taxi_requests_driver ON public.taxi_requests(driver_id);
CREATE INDEX idx_taxi_requests_status ON public.taxi_requests(status);
CREATE INDEX idx_taxi_requests_created ON public.taxi_requests(created_at DESC);

-- Enable RLS
ALTER TABLE public.taxi_requests ENABLE ROW LEVEL SECURITY;

-- Políticas RLS
CREATE POLICY "Usuarios pueden ver sus propias solicitudes como pasajero"
ON public.taxi_requests FOR SELECT
USING (auth.uid() = passenger_id);

CREATE POLICY "Conductores pueden ver solicitudes dirigidas a ellos"
ON public.taxi_requests FOR SELECT
USING (auth.uid() = driver_id);

CREATE POLICY "Usuarios pueden crear solicitudes de taxi"
ON public.taxi_requests FOR INSERT
WITH CHECK (auth.uid() = passenger_id);

CREATE POLICY "Pasajeros pueden actualizar sus solicitudes pendientes"
ON public.taxi_requests FOR UPDATE
USING (auth.uid() = passenger_id AND status = 'pending');

CREATE POLICY "Conductores pueden actualizar solicitudes dirigidas a ellos"
ON public.taxi_requests FOR UPDATE
USING (auth.uid() = driver_id);

COMMENT ON TABLE public.taxi_requests IS 'Solicitudes de viaje de taxi con kilometraje pactado';
COMMENT ON COLUMN public.taxi_requests.distance_km IS 'Kilometraje total pactado: taxi->pasajero->destino';
COMMENT ON COLUMN public.taxi_requests.tarifa_km IS 'Tarifa por km al momento del viaje';
COMMENT ON COLUMN public.taxi_requests.total_fare IS 'Costo total = distance_km * tarifa_km';