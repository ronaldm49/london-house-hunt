-- Migration: Add search_profiles table and search_profile_id to properties
-- Run this in the Supabase SQL editor.

-- 1. Create the search_profiles table
create table if not exists search_profiles (
  id          uuid        primary key default gen_random_uuid(),
  name        text        not null,
  areas       jsonb       not null default '[]'::jsonb,
  min_price   integer     not null default 2000,
  max_price   integer     not null default 2700,
  is_active   boolean     not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists idx_search_profiles_active
  on search_profiles (is_active) where is_active = true;

-- 2. Add search_profile_id to properties
alter table properties
  add column if not exists search_profile_id uuid references search_profiles(id);

create index if not exists idx_properties_profile
  on properties (search_profile_id);

-- 3. Seed the default Islington profile
insert into search_profiles (name, areas, min_price, max_price, is_active)
values (
  'Islington',
  '[{"name": "Islington", "rightmove_code": "REGION^93965", "otm_slug": "islington"}]'::jsonb,
  2000,
  2700,
  true
)
on conflict do nothing;

-- 4. Backfill existing properties with the default profile
update properties
set search_profile_id = (
  select id from search_profiles where name = 'Islington' limit 1
)
where search_profile_id is null;
