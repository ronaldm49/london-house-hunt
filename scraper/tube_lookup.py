"""
tube_lookup.py — resolve nearest Underground station and commute time to Royal Free Hospital.

Pipeline per listing:
  1. Extract UK postcode from address string (regex)
  2. Geocode postcode → lat/lon via postcodes.io (free, no key)
  3. Find nearest tube station within 1,200 m via TfL StopPoint API (anonymous, no key)
  4. Compute walk time: distance / 80 m/min  (brisk 4.8 km/h)
  5. Query TfL Journey Planner API for door-to-door commute to Royal Free Hospital,
     departing Monday 07:30 (rush-hour reference time)

All network calls time out at 8 s and fail gracefully — a None result means the
listing is kept but displayed without transport info.
"""

from __future__ import annotations

import re
from datetime import date, timedelta

import httpx

# ── Walk-speed constant ───────────────────────────────────────────────────────
WALK_SPEED_M_PER_MIN = 80          # ~4.8 km/h
MAX_TUBE_RADIUS_M    = 1_200       # 15 min walk at 80 m/min
TIMEOUT              = 10

# ── Royal Free Hospital (Pond Street, NW3 2QG) ───────────────────────────────
ROYAL_FREE_LAT = 51.5534
ROYAL_FREE_LON = -0.1630

_FULL_POSTCODE_RE = re.compile(
    r"\b([A-Z]{1,2}\d{1,2}[A-Z]?\s*\d[A-Z]{2})\b", re.IGNORECASE
)
_OUTCODE_RE = re.compile(
    r"\b([A-Z]{1,2}\d{1,2}[A-Z]?)\b(?!\s*\d)", re.IGNORECASE
)


def _next_monday() -> str:
    """Return the date of the next Monday as YYYYMMDD."""
    today = date.today()
    days_ahead = (7 - today.weekday()) % 7
    next_mon = today + timedelta(days=days_ahead if days_ahead else 7)
    return next_mon.strftime("%Y%m%d")


def extract_postcode(address: str):
    """
    Pull the best UK postcode out of an address string.
    Returns (code, is_full_postcode) or None.
    """
    addr = address or ""
    m = _FULL_POSTCODE_RE.search(addr)
    if m:
        return m.group(1).upper().replace(" ", ""), True
    m = _OUTCODE_RE.search(addr)
    if m:
        return m.group(1).upper(), False
    return None


def geocode_postcode(postcode: str, is_full: bool = True):
    """Return (latitude, longitude) via postcodes.io or None."""
    try:
        endpoint = "postcodes" if is_full else "outcodes"
        r = httpx.get(
            f"https://api.postcodes.io/{endpoint}/{postcode}",
            timeout=TIMEOUT,
        )
        if r.status_code == 200:
            data = r.json().get("result") or {}
            lat, lon = data.get("latitude"), data.get("longitude")
            if lat and lon:
                return float(lat), float(lon)
        else:
            print(f"      [tube] postcodes.io {r.status_code} for {postcode}")
    except Exception as e:
        print(f"      [tube] geocode error for {postcode}: {e}")
    return None


def find_nearest_tube(lat: float, lon: float):
    """
    Query TfL StopPoint API for the nearest Underground station within MAX_TUBE_RADIUS_M.
    Returns (station_name, walk_minutes) or None.
    """
    try:
        r = httpx.get(
            "https://api.tfl.gov.uk/StopPoint",
            params={
                "lat": lat,
                "lon": lon,
                "stopTypes": "NaptanMetroStation",
                "radius": MAX_TUBE_RADIUS_M,
                "useStopPointHierarchy": "true",
                "modes": "tube",
            },
            timeout=TIMEOUT,
        )
        if r.status_code != 200:
            print(f"      [tube] TfL StopPoint {r.status_code} for ({lat},{lon})")
            return None

        stops = r.json().get("stopPoints", [])
        if not stops:
            print(f"      [tube] No tube station within {MAX_TUBE_RADIUS_M}m of ({lat},{lon})")
            return None

        nearest = stops[0]
        distance_m = nearest.get("distance", 0)
        name = nearest.get("commonName", "")
        name = re.sub(r"\s*(Underground|Station)\s*$", "", name, flags=re.IGNORECASE).strip()
        walk_min = max(1, round(distance_m / WALK_SPEED_M_PER_MIN))
        return name, walk_min

    except Exception as e:
        print(f"      [tube] StopPoint error for ({lat},{lon}): {e}")
        return None


def journey_time_to_royal_free(from_lat: float, from_lon: float):
    """
    Query TfL Journey Planner for door-to-door journey to Royal Free Hospital,
    departing Monday 07:30. Returns minutes or None.
    """
    try:
        from_str = f"{from_lat},{from_lon}"
        to_str   = f"{ROYAL_FREE_LAT},{ROYAL_FREE_LON}"
        monday   = _next_monday()
        r = httpx.get(
            f"https://api.tfl.gov.uk/journey/journeyresults/{from_str}/to/{to_str}",
            params={"time": "0730", "timeIs": "Departing", "date": monday},
            timeout=TIMEOUT,
        )
        if r.status_code != 200:
            print(f"      [tube] TfL Journey Planner {r.status_code} for ({from_lat},{from_lon}): {r.text[:200]}")
            return None

        journeys = r.json().get("journeys", [])
        if not journeys:
            print(f"      [tube] No journeys returned for ({from_lat},{from_lon})")
            return None

        return min(j["duration"] for j in journeys)

    except Exception as e:
        print(f"      [tube] Journey Planner error for ({from_lat},{from_lon}): {e}")
        return None


def enrich_with_tube_info(listing: dict) -> dict:
    """
    Resolve nearest tube station + walk time + Royal Free commute for a listing.
    Mutates the listing dict in place and returns it.
    """
    address = listing.get("address", "")
    result = extract_postcode(address)
    if not result:
        print(f"      [tube] No postcode found in: {address!r}")
        return listing

    postcode, is_full = result
    coords = geocode_postcode(postcode, is_full=is_full)
    if not coords:
        print(f"      [tube] Could not geocode: {postcode}")
        return listing

    lat, lon = coords

    tube_result = find_nearest_tube(lat, lon)
    if tube_result:
        station, walk_min = tube_result
        listing["nearest_tube_station"] = station
        listing["tube_walk_minutes"] = walk_min
        print(f"      [tube] {address!r} → {station} ({walk_min} min walk)")

    commute = journey_time_to_royal_free(lat, lon)
    if commute is not None:
        listing["royal_free_commute_minutes"] = commute
        print(f"      [tube] Royal Free commute: {commute} min")

    return listing
