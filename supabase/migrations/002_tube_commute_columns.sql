-- Migration 002 — Add tube station & Royal Free commute columns to properties
-- Run this in the Supabase SQL editor.

ALTER TABLE properties
  ADD COLUMN IF NOT EXISTS nearest_tube_station       text,
  ADD COLUMN IF NOT EXISTS tube_walk_minutes          integer,
  ADD COLUMN IF NOT EXISTS royal_free_commute_minutes integer,
  ADD COLUMN IF NOT EXISTS listing_update_date        timestamptz;

comment on column properties.nearest_tube_station is
  'Name of the closest Underground/Overground station within 1,200 m, resolved via TfL StopPoint API.';
comment on column properties.tube_walk_minutes is
  'Estimated walk time to nearest_tube_station in minutes (distance / 80 m/min).';
comment on column properties.royal_free_commute_minutes is
  'Door-to-door public-transport journey time to Royal Free Hospital (Mon ~08:00 departure), via TfL Journey Planner.';
comment on column properties.listing_update_date is
  'Date of the most recent listing update event from the source site.';
