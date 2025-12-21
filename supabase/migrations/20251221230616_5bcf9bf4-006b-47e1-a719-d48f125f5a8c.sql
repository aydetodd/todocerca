-- ===== SISTEMA GEOGRÁFICO PARA LATAM =====

-- Tabla de países
CREATE TABLE paises (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    nombre VARCHAR(100) NOT NULL,
    codigo_iso VARCHAR(2) NOT NULL UNIQUE,
    codigo_iso3 VARCHAR(3),
    codigo_telefono VARCHAR(10),
    moneda VARCHAR(3),
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Tabla de subdivisiones nivel 1 (estados, departamentos, provincias, etc.)
CREATE TABLE subdivisiones_nivel1 (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    pais_id UUID REFERENCES paises(id) ON DELETE CASCADE NOT NULL,
    nombre VARCHAR(255) NOT NULL,
    slug VARCHAR(255) NOT NULL,
    tipo VARCHAR(50) NOT NULL DEFAULT 'estado', -- estado, departamento, provincia, region
    codigo VARCHAR(10),
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(pais_id, slug)
);

-- Tabla de subdivisiones nivel 2 (municipios, distritos, comunas, etc.)
CREATE TABLE subdivisiones_nivel2 (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    nivel1_id UUID REFERENCES subdivisiones_nivel1(id) ON DELETE CASCADE NOT NULL,
    nombre VARCHAR(255) NOT NULL,
    slug VARCHAR(255) NOT NULL,
    tipo VARCHAR(50) NOT NULL DEFAULT 'municipio', -- municipio, distrito, comuna, canton
    codigo_postal VARCHAR(20),
    latitud DECIMAL(10, 8),
    longitud DECIMAL(11, 8),
    poblacion INTEGER,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(nivel1_id, slug)
);

-- Índices para búsquedas rápidas
CREATE INDEX idx_subdivisiones_nivel1_pais ON subdivisiones_nivel1(pais_id);
CREATE INDEX idx_subdivisiones_nivel1_slug ON subdivisiones_nivel1(slug);
CREATE INDEX idx_subdivisiones_nivel1_nombre ON subdivisiones_nivel1(nombre);

CREATE INDEX idx_subdivisiones_nivel2_nivel1 ON subdivisiones_nivel2(nivel1_id);
CREATE INDEX idx_subdivisiones_nivel2_slug ON subdivisiones_nivel2(slug);
CREATE INDEX idx_subdivisiones_nivel2_nombre ON subdivisiones_nivel2(nombre);

-- Índice compuesto para búsquedas por ubicación
CREATE INDEX idx_subdivisiones_nivel2_location ON subdivisiones_nivel2(latitud, longitud) WHERE latitud IS NOT NULL AND longitud IS NOT NULL;

-- Habilitar RLS
ALTER TABLE paises ENABLE ROW LEVEL SECURITY;
ALTER TABLE subdivisiones_nivel1 ENABLE ROW LEVEL SECURITY;
ALTER TABLE subdivisiones_nivel2 ENABLE ROW LEVEL SECURITY;

-- Políticas RLS (lectura pública, escritura solo admin)
CREATE POLICY "Anyone can view paises" ON paises
    FOR SELECT USING (true);

CREATE POLICY "Anyone can view subdivisiones_nivel1" ON subdivisiones_nivel1
    FOR SELECT USING (true);

CREATE POLICY "Anyone can view subdivisiones_nivel2" ON subdivisiones_nivel2
    FOR SELECT USING (true);

-- Políticas para admins
CREATE POLICY "Admins can manage paises" ON paises
    FOR ALL USING (is_admin());

CREATE POLICY "Admins can manage subdivisiones_nivel1" ON subdivisiones_nivel1
    FOR ALL USING (is_admin());

CREATE POLICY "Admins can manage subdivisiones_nivel2" ON subdivisiones_nivel2
    FOR ALL USING (is_admin());

-- Insertar países de Latinoamérica
INSERT INTO paises (nombre, codigo_iso, codigo_iso3, codigo_telefono, moneda) VALUES
    ('México', 'MX', 'MEX', '+52', 'MXN'),
    ('Colombia', 'CO', 'COL', '+57', 'COP'),
    ('Argentina', 'AR', 'ARG', '+54', 'ARS'),
    ('Perú', 'PE', 'PER', '+51', 'PEN'),
    ('Chile', 'CL', 'CHL', '+56', 'CLP'),
    ('Ecuador', 'EC', 'ECU', '+593', 'USD'),
    ('Guatemala', 'GT', 'GTM', '+502', 'GTQ'),
    ('Cuba', 'CU', 'CUB', '+53', 'CUP'),
    ('Bolivia', 'BO', 'BOL', '+591', 'BOB'),
    ('República Dominicana', 'DO', 'DOM', '+1', 'DOP'),
    ('Honduras', 'HN', 'HND', '+504', 'HNL'),
    ('Paraguay', 'PY', 'PRY', '+595', 'PYG'),
    ('El Salvador', 'SV', 'SLV', '+503', 'USD'),
    ('Nicaragua', 'NI', 'NIC', '+505', 'NIO'),
    ('Costa Rica', 'CR', 'CRI', '+506', 'CRC'),
    ('Panamá', 'PA', 'PAN', '+507', 'PAB'),
    ('Uruguay', 'UY', 'URY', '+598', 'UYU'),
    ('Puerto Rico', 'PR', 'PRI', '+1', 'USD'),
    ('Venezuela', 'VE', 'VEN', '+58', 'VES'),
    ('Brasil', 'BR', 'BRA', '+55', 'BRL');

-- Función helper para obtener la jerarquía completa
CREATE OR REPLACE FUNCTION get_geografia_completa(p_nivel2_id UUID)
RETURNS TABLE (
    pais_id UUID,
    pais_nombre VARCHAR,
    pais_codigo VARCHAR,
    nivel1_id UUID,
    nivel1_nombre VARCHAR,
    nivel1_slug VARCHAR,
    nivel1_tipo VARCHAR,
    nivel2_id UUID,
    nivel2_nombre VARCHAR,
    nivel2_slug VARCHAR,
    nivel2_tipo VARCHAR
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        p.id,
        p.nombre,
        p.codigo_iso,
        n1.id,
        n1.nombre,
        n1.slug,
        n1.tipo,
        n2.id,
        n2.nombre,
        n2.slug,
        n2.tipo
    FROM subdivisiones_nivel2 n2
    JOIN subdivisiones_nivel1 n1 ON n2.nivel1_id = n1.id
    JOIN paises p ON n1.pais_id = p.id
    WHERE n2.id = p_nivel2_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Función para buscar por slug (URLs amigables)
CREATE OR REPLACE FUNCTION get_nivel2_by_slugs(
    p_pais_codigo VARCHAR,
    p_nivel1_slug VARCHAR,
    p_nivel2_slug VARCHAR
)
RETURNS TABLE (
    nivel2_id UUID,
    nivel2_nombre VARCHAR,
    nivel1_id UUID,
    nivel1_nombre VARCHAR,
    pais_id UUID,
    pais_nombre VARCHAR,
    latitud DECIMAL,
    longitud DECIMAL
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        n2.id,
        n2.nombre,
        n1.id,
        n1.nombre,
        p.id,
        p.nombre,
        n2.latitud,
        n2.longitud
    FROM subdivisiones_nivel2 n2
    JOIN subdivisiones_nivel1 n1 ON n2.nivel1_id = n1.id
    JOIN paises p ON n1.pais_id = p.id
    WHERE LOWER(p.codigo_iso) = LOWER(p_pais_codigo)
      AND LOWER(n1.slug) = LOWER(p_nivel1_slug)
      AND LOWER(n2.slug) = LOWER(p_nivel2_slug)
      AND n2.is_active = true;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;