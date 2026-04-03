"""
tube_lookup.py — resolve nearest Underground station and commute time to Royal Free Hospital.

Pipeline per listing:
  1. Extract UK postcode from address string (regex)
  2. Geocode postcode → lat/lon via postcodes.io (free, no key)
  3. Find nearest tube station within 1,200 m via TfL StopPoint API (anonymous, no key)
  4. Compute walk time: distance / 80 m/min  (brisk 4.8 km/h)
  5. Look up static commute table: station → minutes to Royal Free Hospital (Hampstead NW3)

All network calls time out at 8 s and fail gracefully — a None result means the
listing is kept but displayed without transport info.
"""

import re
import httpx

# ── Walk-speed constant ───────────────────────────────────────────────────────
WALK_SPEED_M_PER_MIN = 80          # ~4.8 km/h
MAX_TUBE_RADIUS_M    = 1_200       # 15 min walk at 80 m/min
TIMEOUT              = 8

# ── Static commute to Royal Free Hospital (Hampstead NW3) ────────────────────
# Times are door-to-door in minutes (tube ride + ~5 min walk from Hampstead stn).
# Northern line Edgware branch is the direct route; other lines require a change.

ROYAL_FREE_COMMUTE_MINUTES: dict[str, int] = {
    # Northern line — Edgware branch (direct to Hampstead)
    "Hampstead":                    5,
    "Golders Green":                8,
    "Brent Cross":                 12,
    "Hendon Central":              16,
    "Colindale":                   20,
    "Burnt Oak":                   25,
    "Edgware":                     30,
    # Northern line — south of Hampstead (one or two stops back)
    "Belsize Park":                 8,
    "Chalk Farm":                  12,
    "Camden Town":                 16,
    "Kentish Town":                20,
    "Tufnell Park":                23,
    "Archway":                     26,
    # Northern line — High Barnet branch (change at Camden Town → Edgware branch)
    "Highgate":                    30,
    "East Finchley":               33,
    "Finchley Central":            36,
    "West Finchley":               39,
    "Woodside Park":               42,
    "Totteridge & Whetstone":      45,
    "High Barnet":                 48,
    # Northern line — Mill Hill East spur
    "Mill Hill East":              38,
    # Piccadilly line (change at King's Cross → Northern → Hampstead)
    "Bounds Green":                42,
    "Wood Green":                  40,
    "Turnpike Lane":               44,
    "Manor House":                 47,
    "Finsbury Park":               35,
    "Arsenal":                     38,
    "Holloway Road":               36,
    "Caledonian Road":             33,
    "King's Cross St. Pancras":    22,
    # Victoria line (change at Warren Street → Northern → Hampstead)
    "Warren Street":               20,
    "Euston":                      18,
    "Seven Sisters":               45,
    "Tottenham Hale":              48,
    # Overground / Elizabeth line extras
    "Alexandra Palace":            38,
    "New Southgate":               40,
}

_POSTCODE_RE = re.compile(
    r"\b([A-Z]{1,2}\d{1,2}[A-Z]?\s*\d[A-Z]{2})\b", re.IGNORECASE
)


def extract_postcode(address: str) -> str | None:
    """Pull the first UK postcode out of an address string."""
    m = _POSTCODE_RE.search(address or "")
    return m.group(1).upper().replace(" ", "") if m else None


def geocode_postcode(postcode: str) -> tuple[float, float] | None:
    """Return (latitude, longitude) for a UK postcode via postcodes.io."""
    try:
        r = httpx.get(
            f"https://api.postcodes.io/postcodes/{postcode}",
            timeout=TIMEOUT,
        )
        if r.status_code == 200:
            data = r.json().get("result") or {}
            lat, lon = data.get("latitude"), data.get("longitude")
            if lat and lon:
                return float(lat), float(lon)
    except Exception:
        pass
    return None


def find_nearest_tube(lat: float, lon: float) -> tuple[str, int] | None:
    """
    Query TfL StopPoint API for the nearest Underground station within MAX_TUBE_RADIUS_M.
    Returns (station_name, walk_minutes) or None if nothing found.
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
            return None

        stops = r.json().get("stopPoints", [])
        if not stops:
            return None

        # TfL returns stops sorted by distance ascending
        nearest = stops[0]
        distance_m = nearest.get("distance", 0)
        name = nearest.get("commonName", "")
        # Strip " Underground Station" suffix for display
        name = re.sub(r"\s*(Underground|Station)\s*$", "", name, flags=re.IGNORECASE).strip()

        walk_min = max(1, round(distance_m / WALK_SPEED_M_PER_MIN))
        return name, walk_min

    except Exception:
        return None


def commute_to_royal_free(station_name: str) -> int | None:
    """Look up estimated commute time (minutes) from a tube station to Royal Free Hospital."""
    # Exact match first
    if station_name in ROYAL_FREE_COMMUTE_MINUTES:
        return ROYAL_FREE_COMMUTE_MINUTES[station_name]
    # Partial match (e.g. "Golders Green Underground Station" → "Golders Green")
    for key, mins in ROYAL_FREE_COMMUTE_MINUTES.items():
        if key.lower() in station_name.lower() or station_name.lower() in key.lower():
            return mins
    return None


def enrich_with_tube_info(listing: dict) -> dict:
    """
    Resolve nearest tube station + walk time + Royal Free commute for a listing.
    Sets nearest_tube_station, tube_walk_minutes, royal_free_commute_minutes.
    Returns the listing dict (mutated in place).
    """
    address = listing.get("address", "")
    postcode = extract_postcode(address)
    if not postcode:
        return listing

    coords = geocode_postcode(postcode)
    if not coords:
        return listing

    lat, lon = coords
    result = find_nearest_tube(lat, lon)
    if not result:
        return listing

    station, walk_min = result
    listing["nearest_tube_station"] = station
    listing["tube_walk_minutes"] = walk_min
    listing["royal_free_commute_minutes"] = commute_to_royal_free(station)

    return listing
