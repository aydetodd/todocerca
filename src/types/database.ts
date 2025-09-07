// Local database types for todocerca marketplace
export type UserRole = 'cliente' | 'proveedor';
export type AvailabilityStatus = 'disponible' | 'ocupado' | 'no_disponible';
export type SubscriptionStatus = 'activa' | 'vencida' | 'cancelada';

export interface UserProfile {
  id: string;
  user_id_number: number;
  phone_number: string;
  role: UserRole;
  postal_code: string;
  is_verified: boolean;
  two_factor_enabled: boolean;
  created_at: string;
  updated_at: string;
}

export interface ProviderProfile {
  id: string;
  business_name: string;
  business_address: string;
  business_phone: string;
  business_description?: string;
  location?: { latitude: number; longitude: number };
  availability_status: AvailabilityStatus;
  subscription_status: SubscriptionStatus;
  subscription_start_date?: string;
  subscription_end_date?: string;
  document_url?: string;
  created_at: string;
  updated_at: string;
}

export interface ServiceCategory {
  id: string;
  name: string;
  slug: string;
  parent_id?: string;
  category_type: 'bien' | 'servicio';
  is_active: boolean;
  sort_order: number;
  created_at: string;
  children?: ServiceCategory[];
}

export interface ProviderService {
  id: string;
  provider_id: string;
  category_id: string;
  price_min?: number;
  price_max?: number;
  description?: string;
  is_active: boolean;
  created_at: string;
  category?: ServiceCategory;
}

export interface ProviderPhoto {
  id: string;
  provider_id: string;
  photo_url: string;
  caption?: string;
  sort_order: number;
  is_primary: boolean;
  created_at: string;
}

export interface SubscriptionPayment {
  id: string;
  provider_id: string;
  amount: number;
  payment_method: 'tarjeta' | 'oxxo' | 'paypal';
  payment_reference?: string;
  payment_status: 'pendiente' | 'completado' | 'fallido';
  payment_date?: string;
  created_at: string;
}

export interface TrackingGroup {
  id: string;
  provider_id: string;
  group_name: string;
  is_active: boolean;
  created_at: string;
  members?: TrackingGroupMember[];
}

export interface TrackingGroupMember {
  id: string;
  group_id: string;
  phone_number: string;
  user_id?: string;
  is_accepted: boolean;
  last_location?: { latitude: number; longitude: number };
  last_seen?: string;
  is_visible: boolean;
  created_at: string;
  user_profile?: UserProfile;
}

// Utility types for forms and API responses
export interface UserRegistration {
  phone_number: string;
  role: UserRole;
  postal_code: string;
  password: string;
  otp_code?: string;
}

export interface ProviderRegistration extends UserRegistration {
  business_name: string;
  business_address: string;
  business_phone: string;
  business_description?: string;
  service_categories: string[];
  location: { latitude: number; longitude: number };
}

export interface MapProvider {
  id: string;
  business_name: string;
  location: { latitude: number; longitude: number };
  availability_status: AvailabilityStatus;
  subscription_status: SubscriptionStatus;
  services: ProviderService[];
  primary_photo?: string;
  price_range?: { min: number; max: number };
}

export interface CategoryTreeNode extends ServiceCategory {
  children: CategoryTreeNode[];
  provider_count?: number;
  average_price?: number;
}