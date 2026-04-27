"""
OnTheMarket source module.
Fetches rental listings by extracting the embedded Redux state from search pages.
"""

import json
import re
import time
from datetime import datetime, timezone

import httpx

BASE_URL = "https://www.onthemarket.com"

HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/131.0.0.0 Safari/537.36"
    ),
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-GB,en;q=0.9",
}

MAX_PAGES = 10
DELAY_SECONDS = 2

_REDUX_RE = re.compile(
    r'"initialReduxState"\s*:\s*(\{.*\})\s*,\s*"initialProps"', re.DOTALL
)


def _fetch_page(client: httpx.Client, page: int, search_url: str, search_params: dict) -> tuple[list[dict], int]:
    params = {**search_params}
    if page > 1:
        params["page"] = str(page)

    response = client.get(search_url, params=params, timeout=15)
    response.raise_for_status()

    scripts = re.findall(r"<script[^>]*>(.*?)</script>", response.text, re.DOTALL)

    results_list = []
    total = 0

    for script in scripts:
        if "initialReduxState" not in script:
            continue

        json_match = re.search(r'(\{"props".*\})', script)
        if not json_match:
            continue

        data = json.loads(json_match.group(1))
        redux = data.get("props", {}).get("initialReduxState", {})
        results = redux.get("results", {})

        results_list = results.get("list", [])
        total_str = results.get("totalResults", "0")
        if isinstance(total_str, str):
            total = int(total_str.replace(",", ""))
        else:
            total = int(total_str)
        break

    return results_list, total


def _get_monthly_price(price_str: str) -> int:
    pcm_match = re.search(r"£([\d,]+)\s*pcm", price_str)
    if pcm_match:
        return int(pcm_match.group(1).replace(",", ""))

    pw_match = re.search(r"£([\d,]+)\s*pw", price_str)
    if pw_match:
        weekly = int(pw_match.group(1).replace(",", ""))
        return int(weekly * 52 / 12)

    num = re.sub(r"[^\d]", "", price_str)
    return int(num) if num else 0


def _parse_property(prop: dict, now: str) -> dict:
    images = prop.get("images", [])
    first_image = None
    if images:
        first_image = images[0].get("default") or images[0].get("webp")

    details_url = prop.get("details-url", "")
    listing_url = BASE_URL + details_url if details_url.startswith("/") else details_url

    price = _get_monthly_price(prop.get("price", ""))

    agent = prop.get("agent", {})
    agent_name = agent.get("name")

    days_info = prop.get("days-since-added-reduced", "")
    is_reduced = prop.get("reduced?", False)
    listing_update_reason = "price_reduced" if is_reduced else None

    first_visible_date = now
    listing_update_date = None
    if is_reduced:
        listing_update_date = now

    return {
        "source": "onthemarket",
        "source_id": str(prop.get("id", "")),
        "address": prop.get("address", ""),
        "price": price,
        "bedrooms": prop.get("bedrooms"),
        "bathrooms": prop.get("bathrooms"),
        "property_type": prop.get("humanised-property-type") or "",
        "description": ", ".join(prop.get("features", [])) if prop.get("features") else None,
        "image_url": first_image,
        "listing_url": listing_url,
        "agent_name": agent_name,
        "first_visible_date": first_visible_date,
        "listing_update_date": listing_update_date,
        "listing_update_reason": listing_update_reason,
        "last_seen_at": now,
    }


def scrape(
    location_slug: str = "islington",
    min_price: int = 2000,
    max_price: int = 2700,
    radius_miles: float = 0.5,
) -> list[dict]:
    search_url = BASE_URL + f"/to-rent/property/{location_slug}/"
    search_params = {
        "min-price": str(min_price),
        "max-price": str(max_price),
        "recently-added": "24-hours",
        # Expand the corridor around the named area so we don't only see
        # listings strictly inside the slug's polygon.
        "radius": f"{radius_miles:g}",
    }

    now = datetime.now(timezone.utc).isoformat()
    all_raw: list[dict] = []

    with httpx.Client(headers=HEADERS, follow_redirects=True) as client:
        raw_props, total = _fetch_page(client, 1, search_url, search_params)
        all_raw.extend(raw_props)

        page_size = len(raw_props) or 30
        total_pages = min((total + page_size - 1) // page_size, MAX_PAGES)
        print(f"  OnTheMarket: {total} results across {total_pages} page(s)")

        for page in range(2, total_pages + 1):
            time.sleep(DELAY_SECONDS)
            raw_props, _ = _fetch_page(client, page, search_url, search_params)
            if not raw_props:
                break
            all_raw.extend(raw_props)
            print(f"  Fetched page {page}/{total_pages} ({len(all_raw)} so far)")

    return [_parse_property(p, now) for p in all_raw]
