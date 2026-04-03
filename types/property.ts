export type PropertyCategory = 'bin' | 'wishlist' | 'called' | 'offered';

export interface AreaConfig {
  name: string;
  rightmove_code: string;
  otm_slug: string;
}

export interface SearchProfile {
  id: string;
  name: string;
  areas: AreaConfig[];
  min_price: number;
  max_price: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface Property {
  id: string;
  source: string;
  source_id: string;
  address: string;
  price: number;
  bedrooms: number | null;
  bathrooms: number | null;
  property_type: string | null;
  description: string | null;
  image_url: string | null;
  listing_url: string;
  agent_name: string | null;
  first_visible_date: string | null;
  listing_update_date: string | null;
  listing_update_reason: string | null;
  last_activity_date: string | null;
  first_seen_at: string;
  last_seen_at: string;
  is_active: boolean;
  category: PropertyCategory | null;
  notes: string | null;
  search_profile_id: string | null;
}

export interface PropertyFilters {
  min_price?: number;
  max_price?: number;
  min_bedrooms?: number;
  max_bedrooms?: number;
  property_type?: string;
  source?: string;
}
