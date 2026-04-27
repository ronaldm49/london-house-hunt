-- Migration 001 — North London / Royal Free Corridor profile
-- Adds per-profile bedroom/furnished/growth-mode/notification controls,
-- enriches property rows with furnished & parking status, and seeds the profile.

-- ── search_profiles additions ─────────────────────────────────────────────────

ALTER TABLE search_profiles
  ADD COLUMN IF NOT EXISTS min_bedrooms              integer,
  ADD COLUMN IF NOT EXISTS max_bedrooms              integer,
  ADD COLUMN IF NOT EXISTS furnished_only            boolean     NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS growth_mode_areas         jsonb       NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS growth_mode_threshold     integer     NOT NULL DEFAULT 3,
  ADD COLUMN IF NOT EXISTS notification_interval_hours integer   NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_notified_at          timestamptz;

comment on column search_profiles.min_bedrooms is
  'Minimum bedroom count passed to scraper sources (null = no filter).';
comment on column search_profiles.max_bedrooms is
  'Maximum bedroom count passed to scraper sources (null = no filter).';
comment on column search_profiles.furnished_only is
  'When true, scraper requests furnished/part-furnished listings only.';
comment on column search_profiles.growth_mode_areas is
  'Fallback areas scraped when primary-zone new listings < growth_mode_threshold.';
comment on column search_profiles.growth_mode_threshold is
  'If new primary-zone listings fall below this count, growth-mode areas are activated.';
comment on column search_profiles.notification_interval_hours is
  '0 = notify immediately on every run; N = send a digest at most once every N hours.';
comment on column search_profiles.last_notified_at is
  'Timestamp of the last email notification sent for this profile.';

-- ── properties additions ──────────────────────────────────────────────────────

ALTER TABLE properties
  ADD COLUMN IF NOT EXISTS listing_update_reason text,
  ADD COLUMN IF NOT EXISTS furnished_status      text,
  ADD COLUMN IF NOT EXISTS parking_status        text,
  ADD COLUMN IF NOT EXISTS is_growth_mode        boolean NOT NULL DEFAULT false;

comment on column properties.listing_update_reason is
  'Reason for a listing update event (e.g. "price_reduced"). From source data.';
comment on column properties.furnished_status is
  'Detected furnished state: furnished | part-furnished | unfurnished | unknown.';
comment on column properties.parking_status is
  'Detected parking availability from listing copy + structured fields: yes | no | unknown.';
comment on column properties.is_growth_mode is
  'True when this listing was discovered via growth-mode (adjacent-area) fallback.';

-- ── North London – Royal Free Corridor profile ────────────────────────────────
-- Rightmove codes use the OUTCODE^ identifier for postcode districts.
-- ⚠️  Verify each OUTCODE ID against a live Rightmove search URL before running;
--     the IDs below are correct to the best of available knowledge but should
--     be confirmed by searching each area on rightmove.co.uk and inspecting the
--     locationIdentifier query parameter.

INSERT INTO search_profiles (
  name,
  areas,
  min_price,
  max_price,
  min_bedrooms,
  max_bedrooms,
  furnished_only,
  growth_mode_areas,
  growth_mode_threshold,
  notification_interval_hours
) VALUES (
  'North London – Royal Free Corridor',

  -- Primary zones (all within 0.5 mi of a Tube station)
  '[
    {"name": "Colindale",      "rightmove_code": "REGION^70344", "otm_slug": "colindale"},
    {"name": "Golders Green",  "rightmove_code": "REGION^70353", "otm_slug": "golders-green"},
    {"name": "Hendon Central", "rightmove_code": "REGION^87511", "otm_slug": "hendon"},
    {"name": "Bounds Green",   "rightmove_code": "REGION^70371", "otm_slug": "bounds-green"},
    {"name": "Muswell Hill",   "rightmove_code": "REGION^85376", "otm_slug": "muswell-hill"}
  ]'::jsonb,

  0,     -- no lower price bound
  2000,  -- £2,000 PCM ceiling

  2,     -- exactly 2 bedrooms (min)
  2,     -- exactly 2 bedrooms (max)

  true,  -- furnished / part-furnished only

  -- Adjacent fallback areas (Growth Mode, max 3 returned)
  '[
    {"name": "Finchley Central", "rightmove_code": "REGION^85196", "otm_slug": "finchley-central"},
    {"name": "Wood Green",       "rightmove_code": "REGION^70366", "otm_slug": "wood-green"}
  ]'::jsonb,

  3,  -- activate Growth Mode when < 3 new primary listings found

  48  -- send digest email at most once every 48 hours
);
