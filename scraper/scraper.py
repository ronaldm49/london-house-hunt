"""
London House Hunt — scraper orchestrator.
Runs all source modules (Rightmove, OnTheMarket), upserts results into Supabase,
enriches listings with furnished/parking status, and sends notifications.

Profile-level features supported:
  - min_bedrooms / max_bedrooms   — passed directly to scraper sources
  - furnished_only                — filters by furnished/part-furnished at source level;
                                    all listings are also enriched with detected furnished_status
  - growth_mode_areas             — adjacent areas scraped when primary-zone new count is low
  - growth_mode_threshold         — triggers growth mode when new primary listings < this value
  - notification_interval_hours   — 0 = notify immediately; N = digest at most once per N hours
"""

import os
import re
import httpx
from datetime import datetime, timedelta, timezone

from dotenv import load_dotenv
from supabase import create_client, Client

import rightmove
import onthemarket
from tube_lookup import enrich_with_tube_info, extract_postcode, geocode_postcode, find_nearest_tube, journey_time_to_royal_free

load_dotenv()

# ── Transit-time lookup (door-to-door, TfL public transport) ──────────────────
# Destination: Royal Free Hospital, Pond Street, Hampstead NW3
# Nearest tube: Hampstead (Northern line, Edgware branch)

TRANSIT_TO_ROYAL_FREE: dict[str, str] = {
    "Golders Green":   "~15 min  (Northern line direct → Hampstead)",
    "Hendon Central":  "~22 min  (Northern line direct → Hampstead)",
    "Finchley Central":"~25 min  (Northern line direct → Hampstead)",
    "Colindale":       "~30 min  (Northern line direct → Hampstead)",
    "Bounds Green":    "~40 min  (Piccadilly → King's Cross · Northern → Hampstead)",
    "Wood Green":      "~45 min  (Piccadilly → King's Cross · Northern → Hampstead)",
    "Alexandra Park":  "~45 min  (bus/W7 → Wood Green · Piccadilly → King's Cross · Northern → Hampstead)",
    "Muswell Hill":    "~40 min  (bus to East Finchley · Northern line → Hampstead)",
}

_FURNISHED_KEYWORDS = ("furnished", "part furnished", "part-furnished")
_UNFURNISHED_KEYWORDS = ("unfurnished", "un-furnished", "not furnished")
_PARKING_KEYWORDS = ("parking", "garage", "car space", "car park", "off-street", "driveway", "allocated space")


def detect_furnished_status(description: str | None) -> str:
    """Return 'furnished', 'part-furnished', 'unfurnished', or 'unknown'."""
    if not description:
        return "unknown"
    d = description.lower()
    if "part furnished" in d or "part-furnished" in d:
        return "part-furnished"
    if any(k in d for k in _UNFURNISHED_KEYWORDS):
        return "unfurnished"
    if "furnished" in d:
        return "furnished"
    return "unknown"


def detect_parking_status(description: str | None) -> str:
    """Return 'bonus' if parking is mentioned, else 'unverified'."""
    if not description:
        return "unverified"
    d = description.lower()
    return "bonus" if any(k in d for k in _PARKING_KEYWORDS) else "unverified"


def enrich_listing(listing: dict, max_tube_walk: int | None = None) -> dict:
    """Enrich a listing with furnished/parking status and tube/commute info.
    If max_tube_walk is set and the listing's tube walk exceeds it, returns None."""
    desc = listing.get("description") or ""
    listing["furnished_status"] = detect_furnished_status(desc)
    listing["parking_status"] = detect_parking_status(desc)
    enrich_with_tube_info(listing)
    if max_tube_walk is not None:
        walk = listing.get("tube_walk_minutes")
        if walk is not None and walk > max_tube_walk:
            return None  # Filtered out — too far from tube
    return listing


def build_supabase_client() -> Client:
    return create_client(
        os.environ["SUPABASE_URL"],
        os.environ["SUPABASE_SERVICE_KEY"],
    )


def upsert_properties(supabase: Client, properties: list[dict]) -> list[dict]:
    if not properties:
        return []

    seen: dict[tuple[str, str], dict] = {}
    for p in properties:
        key = (p["source"], p["source_id"])
        seen[key] = p
    properties = list(seen.values())

    existing = supabase.table("properties").select("source, source_id").execute()
    existing_keys: set[tuple[str, str]] = set()
    if existing.data:
        existing_keys = {(r["source"], r["source_id"]) for r in existing.data}

    new = [p for p in properties if (p["source"], p["source_id"]) not in existing_keys]
    existing_props = [p for p in properties if (p["source"], p["source_id"]) in existing_keys]

    if new:
        supabase.table("properties").insert(new).execute()

    if existing_props:
        for p in existing_props:
            update = {k: v for k, v in p.items() if k != "search_profile_id"}
            supabase.table("properties").update(update).eq("source", p["source"]).eq("source_id", p["source_id"]).execute()

    return new


def should_send_notification(profile: dict) -> bool:
    """Return True if this profile is due for a notification."""
    interval = profile.get("notification_interval_hours") or 0
    if interval <= 0:
        return True
    last_notified = profile.get("last_notified_at")
    if not last_notified:
        return True
    last_dt = datetime.fromisoformat(last_notified.replace("Z", "+00:00"))
    return datetime.now(timezone.utc) >= last_dt + timedelta(hours=interval)


def get_listings_since_last_notification(supabase: Client, profile: dict) -> list[dict]:
    """For interval-based profiles, fetch all new listings since the last notification."""
    interval = profile.get("notification_interval_hours") or 0
    profile_id = profile.get("id")
    last_notified = profile.get("last_notified_at")

    if last_notified:
        since = last_notified
    else:
        since = (datetime.now(timezone.utc) - timedelta(hours=max(interval, 24))).isoformat()

    result = (
        supabase.table("properties")
        .select("*")
        .eq("search_profile_id", profile_id)
        .gte("first_seen_at", since)
        .execute()
    )
    return result.data or []


def update_last_notified(supabase: Client, profile_id: str) -> None:
    supabase.table("search_profiles").update(
        {"last_notified_at": datetime.now(timezone.utc).isoformat()}
    ).eq("id", profile_id).execute()


def send_email_notification(
    new_listings: list[dict],
    profiles: list[dict] | None = None,
    transit_lookup: dict[str, str] | None = None,
) -> None:
    api_key = os.environ.get("RESEND_API_KEY")
    notify_email = os.environ.get("NOTIFY_EMAIL", "")
    to_emails = [e.strip() for e in notify_email.split(",") if e.strip()]
    from_email = os.environ.get("RESEND_FROM_EMAIL") or "London House Hunt <onboarding@resend.dev>"
    if not api_key or not to_emails:
        print("  No RESEND_API_KEY or NOTIFY_EMAIL set — skipping email.")
        return

    rows = ""
    for p in new_listings:
        beds = f"{p['bedrooms']}bed · " if p.get("bedrooms") else ""
        price = f"£{p['price']:,}/mo"
        agent = p.get("agent_name") or p["source"]

        furnished = p.get("furnished_status") or "unknown"
        furnished_label = {
            "furnished": "✔ Furnished",
            "part-furnished": "✔ Part-furnished",
            "unfurnished": "✘ Unfurnished",
            "unknown": "? Furnished status unverified",
        }.get(furnished, furnished)

        parking = p.get("parking_status") or "unverified"
        parking_label = "★ Parking (Bonus)" if parking == "bonus" else "– Parking: Unverified"

        growth = " · <em>Growth Mode</em>" if p.get("is_growth_mode") else ""

        # Look up transit time by address area name if available
        transit = ""
        if transit_lookup:
            for area_name, duration in transit_lookup.items():
                if area_name.lower() in (p.get("address") or "").lower():
                    transit = f"<br><span style='font-size:12px;color:#6b7280;'>🚇 Royal Free: {duration}</span>"
                    break

        rows += f"""
        <tr>
          <td style="padding:12px 0;border-bottom:1px solid #e5e0da;">
            <a href="{p['listing_url']}" style="font-size:15px;font-weight:600;color:#1a1715;text-decoration:none;">
              {p['address']}
            </a><br>
            <span style="font-size:13px;color:#5a534e;">{beds}{price} · {agent}{growth}</span><br>
            <span style="font-size:12px;color:#6b7280;">{furnished_label} &nbsp;·&nbsp; {parking_label}</span>
            {transit}
          </td>
        </tr>"""

    if profiles:
        all_areas = [a["name"] for p in profiles for a in p.get("areas", [])]
        unique_areas = list(dict.fromkeys(all_areas))
        min_price = min(p["min_price"] for p in profiles)
        max_price = max(p["max_price"] for p in profiles)
        search_subtitle = f"{', '.join(unique_areas)} · £{min_price:,}–£{max_price:,}/mo"
    else:
        search_subtitle = "London House Hunt"

    count = len(new_listings)
    html = f"""
    <div style="font-family:sans-serif;max-width:560px;margin:0 auto;color:#1a1715;">
      <h2 style="font-size:20px;margin-bottom:4px;">
        {count} new listing{'s' if count != 1 else ''} on London House Hunt
      </h2>
      <p style="font-size:13px;color:#9a928c;margin-top:0;">
        {search_subtitle}
      </p>
      <table style="width:100%;border-collapse:collapse;">{rows}</table>
      <p style="margin-top:24px;">
        <a href="YOUR_VERCEL_URL/dashboard"
           style="background:#c45a3c;color:#fff;padding:10px 20px;border-radius:6px;text-decoration:none;font-size:14px;">
          View dashboard
        </a>
      </p>
    </div>"""

    subject = f"{count} new listing{'s' if count != 1 else ''} — London House Hunt"
    headers = {"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"}

    for email in to_emails:
        resp = httpx.post(
            "https://api.resend.com/emails",
            headers=headers,
            json={
                "from": from_email,
                "to": [email],
                "subject": subject,
                "html": html,
            },
            timeout=15,
        )
        if resp.status_code == 200:
            print(f"  Email sent to {email}")
        else:
            print(f"  Email to {email} failed: {resp.status_code} {resp.text}")


def refresh_commute_times(supabase: Client) -> None:
    """
    Re-run TfL Journey Planner for every active property in the DB and update
    the royal_free_commute_minutes field.  Runs once per scraper invocation so
    times stay accurate as TfL timetables change.
    """
    try:
        result = supabase.table("properties").select("id, address").execute()
        rows = result.data or []
        if not rows:
            print("  No properties found to refresh.")
            return

        print(f"\n  Refreshing commute times for {len(rows)} properties...")
        updated = 0
        for row in rows:
            address = row.get("address", "")
            pc = extract_postcode(address)
            if not pc:
                print(f"    No postcode found for: {address}")
                continue
            postcode, is_full = pc
            coords = geocode_postcode(postcode, is_full=is_full)
            if not coords:
                print(f"    Could not geocode: {postcode}")
                continue
            lat, lon = coords
            commute = journey_time_to_royal_free(lat, lon)
            if commute is None:
                print(f"    TfL Journey Planner returned no result for: {address}")
                continue
            tube_result = find_nearest_tube(lat, lon)
            update_payload = {"royal_free_commute_minutes": commute}
            if tube_result:
                station, walk_min = tube_result
                update_payload["nearest_tube_station"] = station
                update_payload["tube_walk_minutes"] = walk_min
            supabase.table("properties").update(update_payload).eq("id", row["id"]).execute()
            print(f"    ✓ {address} → {commute} min to Royal Free")
            updated += 1

        print(f"  Commute times refreshed for {updated}/{len(rows)} properties.")
    except Exception as e:
        print(f"  ERROR in refresh_commute_times: {e}")


def scrape_areas(
    areas: list[dict],
    profile_id: str | None,
    min_price: int,
    max_price: int,
    min_bedrooms: int | None,
    max_bedrooms: int | None,
    furnished_only: bool,
    is_growth_mode: bool = False,
    max_tube_walk: int | None = 15,
) -> list[dict]:
    """Scrape Rightmove + OnTheMarket for a list of areas and return enriched listings."""
    listings: list[dict] = []

    for area in areas:
        area_name = area["name"]
        rightmove_code = area["rightmove_code"]
        otm_slug = area["otm_slug"]
        label = f"{area_name}{'  [Growth Mode]' if is_growth_mode else ''}"

        print(f"  Area: {label}")

        print(f"    Fetching from Rightmove ({area_name})...")
        try:
            raw = rightmove.scrape(
                location_code=rightmove_code,
                min_price=min_price,
                max_price=max_price,
                min_bedrooms=min_bedrooms,
                max_bedrooms=max_bedrooms,
                furnished_only=furnished_only,
            )
            for item in raw:
                item["search_profile_id"] = profile_id
                item["is_growth_mode"] = is_growth_mode
                enriched = enrich_listing(item, max_tube_walk=max_tube_walk)
                if enriched is not None:
                    listings.append(enriched)
                else:
                    print(f"      ↳ Skipped (>{max_tube_walk} min walk to tube): {item.get('address')}")
        except Exception as e:
            print(f"    Rightmove failed for {area_name}: {e}")

        print(f"    Fetching from OnTheMarket ({area_name})...")
        try:
            raw = onthemarket.scrape(
                location_slug=otm_slug,
                min_price=min_price,
                max_price=max_price,
                min_bedrooms=min_bedrooms,
                max_bedrooms=max_bedrooms,
                furnished_only=furnished_only,
            )
            for item in raw:
                item["search_profile_id"] = profile_id
                item["is_growth_mode"] = is_growth_mode
                enriched = enrich_listing(item, max_tube_walk=max_tube_walk)
                if enriched is not None:
                    listings.append(enriched)
                else:
                    print(f"      ↳ Skipped (>{max_tube_walk} min walk to tube): {item.get('address')}")
        except Exception as e:
            print(f"    OnTheMarket failed for {area_name}: {e}")

    return listings


if __name__ == "__main__":
    print(f"[{datetime.now(timezone.utc).isoformat()}] Starting scrape...")

    supabase_client = build_supabase_client()

    # ── API connectivity check ────────────────────────────────────────────────
    print("\n  Checking external API connectivity...")
    try:
        r = httpx.get("https://api.postcodes.io/postcodes/NW32QG", timeout=10)
        print(f"  postcodes.io: {r.status_code} {'OK' if r.status_code == 200 else 'FAIL'}")
    except Exception as e:
        print(f"  postcodes.io: ERROR — {e}")
    try:
        r = httpx.get("https://api.tfl.gov.uk/StopPoint", params={"lat": 51.55, "lon": -0.18, "stopTypes": "NaptanMetroStation", "radius": 500, "modes": "tube"}, timeout=10)
        print(f"  TfL StopPoint: {r.status_code} {'OK' if r.status_code == 200 else 'FAIL'}")
    except Exception as e:
        print(f"  TfL StopPoint: ERROR — {e}")
    try:
        r = httpx.get("https://api.tfl.gov.uk/journey/journeyresults/51.55,-0.18/to/51.5534,-0.1630", params={"time": "0730", "timeIs": "Departing"}, timeout=10)
        print(f"  TfL Journey Planner: {r.status_code} {'OK' if r.status_code == 200 else 'FAIL — ' + r.text[:100]}")
    except Exception as e:
        print(f"  TfL Journey Planner: ERROR — {e}")

    refresh_commute_times(supabase_client)

    DEFAULT_PROFILE = {
        "id": None,
        "name": "Default",
        "areas": [{"name": "Islington", "rightmove_code": "REGION^93965", "otm_slug": "islington"}],
        "min_price": 2000,
        "max_price": 2700,
    }
    try:
        profiles_res = supabase_client.table("search_profiles").select("*").eq("is_active", True).execute()
        profiles = profiles_res.data or []
    except Exception as e:
        print(f"  Could not fetch search profiles ({e}) — using default profile.")
        profiles = [DEFAULT_PROFILE]

    if not profiles:
        print("No active search profiles found — using default profile.")
        profiles = [DEFAULT_PROFILE]

    print(f"Found {len(profiles)} active profile(s).")

    all_new_listings: list[dict] = []

    for profile in profiles:
        profile_id = profile["id"]
        profile_name = profile["name"]
        areas = profile.get("areas") or []
        min_price = profile["min_price"]
        max_price = profile["max_price"]
        min_bedrooms = profile.get("min_bedrooms")
        max_bedrooms = profile.get("max_bedrooms")
        furnished_only = bool(profile.get("furnished_only", False))
        growth_mode_areas = profile.get("growth_mode_areas") or []
        growth_mode_threshold = profile.get("growth_mode_threshold") or 3
        max_tube_walk = profile.get("max_tube_walk_minutes") or 15

        if not areas:
            print(f"  Profile '{profile_name}' has no areas — skipping.")
            continue

        bed_label = f"{min_bedrooms}–{max_bedrooms}bed · " if min_bedrooms or max_bedrooms else ""
        fur_label = "furnished · " if furnished_only else ""
        print(f"\nProfile: {profile_name} ({bed_label}{fur_label}£{min_price:,}–£{max_price:,}/mo)")

        # ── Scrape primary zones ──────────────────────────────────────────────
        primary_listings = scrape_areas(
            areas=areas,
            profile_id=profile_id,
            min_price=min_price,
            max_price=max_price,
            min_bedrooms=min_bedrooms,
            max_bedrooms=max_bedrooms,
            furnished_only=furnished_only,
            is_growth_mode=False,
            max_tube_walk=max_tube_walk,
        )

        print(f"\n  Upserting {len(primary_listings)} primary listings...")
        new_primary = upsert_properties(supabase_client, primary_listings)
        print(f"  {len(new_primary)} new in primary zones.")

        growth_listings: list[dict] = []

        # ── Growth Mode — activate if primary new stock is thin ───────────────
        if growth_mode_areas and len(new_primary) < growth_mode_threshold:
            print(f"  → Growth Mode activated ({len(new_primary)} new < threshold {growth_mode_threshold})")
            print(f"    Scraping up to {min(3, len(growth_mode_areas))} adjacent areas...")
            growth_listings = scrape_areas(
                areas=growth_mode_areas[:3],
                profile_id=profile_id,
                min_price=min_price,
                max_price=max_price,
                min_bedrooms=min_bedrooms,
                max_bedrooms=max_bedrooms,
                furnished_only=furnished_only,
                is_growth_mode=True,
                max_tube_walk=max_tube_walk,
            )
            print(f"  Upserting {len(growth_listings)} growth-mode listings...")
            new_growth = upsert_properties(supabase_client, growth_listings)
            print(f"  {len(new_growth)} new in growth-mode zones.")
            all_new_listings.extend(new_growth)

        all_new_listings.extend(new_primary)

        # ── Notification (immediate or interval-based digest) ─────────────────
        if not should_send_notification(profile):
            interval = profile.get("notification_interval_hours") or 0
            print(f"  Notification throttled — next digest in < {interval}h.")
            continue

        # For interval profiles, collect all listings since last notification
        interval = profile.get("notification_interval_hours") or 0
        if interval > 0:
            notify_listings = get_listings_since_last_notification(supabase_client, profile)
            digest_label = f"(48h digest: {len(notify_listings)} listing(s))"
        else:
            notify_listings = new_primary + [p for p in growth_listings if p.get("is_growth_mode")]
            digest_label = f"({len(notify_listings)} new listing(s))"

        if not notify_listings:
            print(f"  No listings to notify for '{profile_name}'.")
            continue

        print(f"  Sending notification for '{profile_name}' {digest_label}...")
        send_email_notification(
            notify_listings,
            profiles=[profile],
            transit_lookup=TRANSIT_TO_ROYAL_FREE,
        )

        if profile_id and interval > 0:
            update_last_notified(supabase_client, profile_id)

    total_new = len(all_new_listings)
    print(f"\nDone. {total_new} new listing(s) found across all profiles.")
    if total_new:
        for p in all_new_listings:
            growth_tag = " [growth]" if p.get("is_growth_mode") else ""
            print(f"  {p['listing_url']}{growth_tag}")
