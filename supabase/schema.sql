-- London House Hunt
-- Rental property tracker for London. Scrapes Rightmove & OnTheMarket.

-- Search profiles define what the scraper looks for (areas, price range).
create table search_profiles (
  id          uuid        primary key default gen_random_uuid(),
  name        text        not null,
  areas       jsonb       not null default '[]'::jsonb,
  min_price   integer     not null default 2000,
  max_price   integer     not null default 2700,
  is_active   boolean     not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

comment on table search_profiles is
  'Each profile defines a named search: one or more London areas + a price range. The scraper iterates over all active profiles.';

create index idx_search_profiles_active on search_profiles (is_active) where is_active = true;

drop table if exists properties;

create table properties (
  id                 uuid        primary key default gen_random_uuid(),
  source             text        not null default 'rightmove',
  source_id          text        not null,
  address            text        not null,
  price              integer     not null,
  bedrooms           integer,
  bathrooms          integer,
  property_type      text,
  description        text,
  image_url          text,
  listing_url        text        not null,
  agent_name         text,
  first_visible_date timestamptz,
  first_seen_at      timestamptz not null default now(),
  last_seen_at       timestamptz not null default now(),
  is_active          boolean     not null default true,
  category           text,
  notes              text,
  search_profile_id  uuid        references search_profiles(id),

  unique (source, source_id)
);

comment on table properties is
  'Rental listings scraped from estate agent sites. Keyed on (source, source_id) for upsert deduplication. Category: bin/wishlist/called/null.';

create index idx_properties_first_seen on properties (first_seen_at desc);
create index idx_properties_source on properties (source);
create index idx_properties_category on properties (category);
create index idx_properties_profile on properties (search_profile_id);
