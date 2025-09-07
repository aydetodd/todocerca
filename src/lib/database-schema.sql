-- ===== TODOCERCA DATABASE SCHEMA =====
-- Run this SQL in your Supabase SQL Editor

-- Enable necessary extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "postgis";

-- Create enums
CREATE TYPE user_role AS ENUM ('cliente', 'proveedor');
CREATE TYPE availability_status AS ENUM ('disponible', 'ocupado', 'no_disponible');
CREATE TYPE subscription_status AS ENUM ('activa', 'vencida', 'cancelada');

-- User profiles table (extends Supabase auth.users)
CREATE TABLE user_profiles (
    id UUID REFERENCES auth.users(id) PRIMARY KEY,
    user_id_number SERIAL UNIQUE NOT NULL, -- Consecutive numeric ID
    phone_number VARCHAR(20) UNIQUE NOT NULL,
    role user_role NOT NULL DEFAULT 'cliente',
    postal_code VARCHAR(10) NOT NULL,
    is_verified BOOLEAN DEFAULT FALSE,
    two_factor_enabled BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Provider business information table
CREATE TABLE provider_profiles (
    id UUID REFERENCES user_profiles(id) PRIMARY KEY,
    business_name VARCHAR(255) NOT NULL,
    business_address TEXT NOT NULL,
    business_phone VARCHAR(20) NOT NULL,
    business_description TEXT,
    location GEOGRAPHY(POINT, 4326), -- PostGIS for geolocation
    availability_status availability_status DEFAULT 'disponible',
    subscription_status subscription_status DEFAULT 'vencida',
    subscription_start_date TIMESTAMP WITH TIME ZONE,
    subscription_end_date TIMESTAMP WITH TIME ZONE,
    document_url VARCHAR(500), -- URL to uploaded business document
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Service categories table (hierarchical structure)
CREATE TABLE service_categories (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    slug VARCHAR(255) UNIQUE NOT NULL,
    parent_id UUID REFERENCES service_categories(id),
    category_type VARCHAR(50) NOT NULL CHECK (category_type IN ('bien', 'servicio')),
    is_active BOOLEAN DEFAULT TRUE,
    sort_order INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Provider services (many-to-many relationship)
CREATE TABLE provider_services (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    provider_id UUID REFERENCES provider_profiles(id) ON DELETE CASCADE,
    category_id UUID REFERENCES service_categories(id),
    price_min DECIMAL(10,2),
    price_max DECIMAL(10,2),
    description TEXT,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Provider photos table
CREATE TABLE provider_photos (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    provider_id UUID REFERENCES provider_profiles(id) ON DELETE CASCADE,
    photo_url VARCHAR(500) NOT NULL,
    caption VARCHAR(255),
    sort_order INTEGER DEFAULT 0,
    is_primary BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Subscription payments table
CREATE TABLE subscription_payments (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    provider_id UUID REFERENCES provider_profiles(id) ON DELETE CASCADE,
    amount DECIMAL(10,2) NOT NULL DEFAULT 200.00,
    payment_method VARCHAR(50) NOT NULL, -- 'tarjeta', 'oxxo', 'paypal'
    payment_reference VARCHAR(255),
    payment_status VARCHAR(50) DEFAULT 'pendiente', -- 'pendiente', 'completado', 'fallido'
    payment_date TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Tracking groups table (for device tracking feature)
CREATE TABLE tracking_groups (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    provider_id UUID REFERENCES provider_profiles(id) ON DELETE CASCADE,
    group_name VARCHAR(255) NOT NULL,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Tracking group members table
CREATE TABLE tracking_group_members (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    group_id UUID REFERENCES tracking_groups(id) ON DELETE CASCADE,
    phone_number VARCHAR(20) NOT NULL,
    user_id UUID REFERENCES user_profiles(id) NULL, -- NULL if not registered
    is_accepted BOOLEAN DEFAULT FALSE,
    last_location GEOGRAPHY(POINT, 4326),
    last_seen TIMESTAMP WITH TIME ZONE,
    is_visible BOOLEAN DEFAULT TRUE, -- For "stealth mode"
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for better performance
CREATE INDEX idx_user_profiles_phone ON user_profiles(phone_number);
CREATE INDEX idx_user_profiles_postal_code ON user_profiles(postal_code);
CREATE INDEX idx_user_profiles_role ON user_profiles(role);
CREATE INDEX idx_provider_profiles_location ON provider_profiles USING GIST(location);
CREATE INDEX idx_provider_profiles_availability ON provider_profiles(availability_status);
CREATE INDEX idx_provider_profiles_subscription ON provider_profiles(subscription_status);
CREATE INDEX idx_service_categories_parent ON service_categories(parent_id);
CREATE INDEX idx_service_categories_type ON service_categories(category_type);
CREATE INDEX idx_provider_services_provider ON provider_services(provider_id);
CREATE INDEX idx_provider_services_category ON provider_services(category_id);
CREATE INDEX idx_tracking_group_members_location ON tracking_group_members USING GIST(last_location);

-- Enable Row Level Security (RLS)
ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE provider_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE provider_services ENABLE ROW LEVEL SECURITY;
ALTER TABLE provider_photos ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscription_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE tracking_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE tracking_group_members ENABLE ROW LEVEL SECURITY;

-- RLS Policies for user_profiles
CREATE POLICY "Users can view own profile" ON user_profiles
    FOR SELECT USING (auth.uid() = id);

CREATE POLICY "Users can update own profile" ON user_profiles
    FOR UPDATE USING (auth.uid() = id);

CREATE POLICY "Public profiles viewable by all" ON user_profiles
    FOR SELECT USING (role = 'proveedor');

-- RLS Policies for provider_profiles
CREATE POLICY "Providers can manage own profile" ON provider_profiles
    FOR ALL USING (auth.uid() = id);

CREATE POLICY "Public can view active providers" ON provider_profiles
    FOR SELECT USING (subscription_status = 'activa');

-- RLS Policies for provider_services
CREATE POLICY "Providers can manage own services" ON provider_services
    FOR ALL USING (
        auth.uid() IN (
            SELECT id FROM provider_profiles WHERE id = provider_id
        )
    );

CREATE POLICY "Public can view active services" ON provider_services
    FOR SELECT USING (is_active = true);

-- RLS Policies for provider_photos
CREATE POLICY "Providers can manage own photos" ON provider_photos
    FOR ALL USING (
        auth.uid() IN (
            SELECT id FROM provider_profiles WHERE id = provider_id
        )
    );

CREATE POLICY "Public can view photos" ON provider_photos
    FOR SELECT USING (true);

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Triggers for updated_at
CREATE TRIGGER update_user_profiles_updated_at BEFORE UPDATE ON user_profiles
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_provider_profiles_updated_at BEFORE UPDATE ON provider_profiles
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Function to create provider profile when user role is 'proveedor'
CREATE OR REPLACE FUNCTION create_provider_profile()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.role = 'proveedor' THEN
        INSERT INTO provider_profiles (id)
        VALUES (NEW.id);
    END IF;
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER trigger_create_provider_profile
    AFTER INSERT ON user_profiles
    FOR EACH ROW EXECUTE FUNCTION create_provider_profile();