"""
London House Hunt — scraper orchestrator.
Runs all source modules (Rightmove, etc.), upserts results into Supabase,
and reports new listings.
"""

import os
import httpx
from datetime import datetime, timezone

from dotenv import load_dotenv
from supabase import create_client, Client

import rightmove
import onthemarket

load_dotenv()

# Expand the search corridor by this many miles around each configured area,
# so we don't only see listings strictly inside one Rightmove/OTM polygon.
# Rightmove snaps this to its nearest allowed value (0, 0.25, 0.5, 1, 3, 5, …).
SEARCH_RADIUS_MILES = float(os.environ.get("SEARCH_RADIUS_MILES", "0.5"))


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


def send_email_notification(new_listings: list[dict], profiles: list[dict] | None = None) -> None:
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
        rows += f"""
        <tr>
          <td style="padding:12px 0;border-bottom:1px solid #e5e0da;">
            <a href="{p['listing_url']}" style="font-size:15px;font-weight:600;color:#1a1715;text-decoration:none;">
              {p['address']}
            </a><br>
            <span style="font-size:13px;color:#5a534e;">{beds}{price} · {p.get('agent_name') or p['source']}</span>
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


if __name__ == "__main__":
    print(f"[{datetime.now(timezone.utc).isoformat()}] Starting scrape...")

    supabase_client = build_supabase_client()

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

    all_listings: list[dict] = []

    for profile in profiles:
        profile_id = profile["id"]
        profile_name = profile["name"]
        areas = profile.get("areas", [])
        min_price = profile["min_price"]
        max_price = profile["max_price"]
        min_bedrooms = profile.get("min_bedrooms")
        max_bedrooms = profile.get("max_bedrooms")
        furnished_only = bool(profile.get("furnished_only", False))

        if not areas:
            print(f"  Profile '{profile_name}' has no areas — skipping.")
            continue

        bed_filter = ""
        if min_bedrooms is not None or max_bedrooms is not None:
            if min_bedrooms == max_bedrooms and min_bedrooms is not None:
                bed_filter = f" · {min_bedrooms} bed"
            else:
                lo = min_bedrooms if min_bedrooms is not None else "any"
                hi = max_bedrooms if max_bedrooms is not None else "any"
                bed_filter = f" · {lo}-{hi} beds"
        furn_filter = " · furnished" if furnished_only else ""
        print(f"\nProfile: {profile_name} (£{min_price:,}–£{max_price:,}/mo{bed_filter}{furn_filter})")

        for area in areas:
            area_name = area["name"]
            rightmove_code = area["rightmove_code"]
            otm_slug = area["otm_slug"]

            print(f"  Area: {area_name}")

            print(f"    Fetching from Rightmove ({area_name}, +{SEARCH_RADIUS_MILES}mi)...")
            try:
                listings = rightmove.scrape(
                    location_code=rightmove_code,
                    min_price=min_price,
                    max_price=max_price,
                    radius_miles=SEARCH_RADIUS_MILES,
                    min_bedrooms=min_bedrooms,
                    max_bedrooms=max_bedrooms,
                    furnished_only=furnished_only,
                )
                for listing in listings:
                    listing["search_profile_id"] = profile_id
                all_listings.extend(listings)
            except Exception as e:
                print(f"    Rightmove failed for {area_name}: {e}")

            print(f"    Fetching from OnTheMarket ({area_name}, +{SEARCH_RADIUS_MILES}mi)...")
            try:
                listings = onthemarket.scrape(
                    location_slug=otm_slug,
                    min_price=min_price,
                    max_price=max_price,
                    radius_miles=SEARCH_RADIUS_MILES,
                    min_bedrooms=min_bedrooms,
                    max_bedrooms=max_bedrooms,
                    furnished_only=furnished_only,
                )
                for listing in listings:
                    listing["search_profile_id"] = profile_id
                all_listings.extend(listings)
            except Exception as e:
                print(f"    OnTheMarket failed for {area_name}: {e}")

    print(f"\nUpserting {len(all_listings)} listings into Supabase...")
    new_listings = upsert_properties(supabase_client, all_listings)

    print(f"\nFound {len(all_listings)} total, {len(new_listings)} new listings")
    if new_listings:
        print("New listings:")
        for p in new_listings:
            print(f"  {p['listing_url']}")
        print("Sending email notification...")
        send_email_notification(new_listings, profiles)
