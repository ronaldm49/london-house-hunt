"""
Rightmove source module.
Fetches rental listings by scraping the embedded JSON from Rightmove search pages.
"""

import json
import re
import time
from datetime import datetime, timezone

import httpx

BASE_URL = "https://www.rightmove.co.uk"
SEARCH_URL = BASE_URL + "/property-to-rent/find.html"

HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/120.0.0.0 Safari/537.36"
    ),
    "Accept-Language": "en-GB,en;q=0.9",
}

_BASE_SEARCH_PARAMS = {
    "numberOfPropertiesPerPage": "24",
    "channel": "RENT",
    "currencyCode": "GBP",
    "sortType": "6",
}

MAX_PAGES = 42
PAGE_SIZE = 24
DELAY_SECONDS = 2

_EMBEDDED_JSON_RE = re.compile(
    r'<script[^>]*type="application/json"[^>]*>(.*?)</script>', re.DOTALL
)


def _fetch_page(client: httpx.Client, index: int, search_params: dict) -> tuple[list[dict], int]:
    params = {**search_params, "index": str(index)}
    response = client.get(SEARCH_URL, params=params, timeout=15)
    response.raise_for_status()

    match = _EMBEDDED_JSON_RE.search(response.text)
    if not match:
        raise ValueError(f"No embedded JSON found in Rightmove response (index={index})")

    data = json.loads(match.group(1))
    search_results = data["props"]["pageProps"]["searchResults"]

    properties = search_results.get("properties", [])
    total = search_results.get("resultCount", 0)
    if isinstance(total, str):
        total = int(total.replace(",", ""))

    return properties, total


def _get_monthly_price(price_data: dict) -> int:
    display_prices = price_data.get("displayPrices", [])
    for dp in display_prices:
        text = dp.get("displayPrice", "")
        if "pcm" in text:
            num = re.sub(r"[^\d]", "", text)
            if num:
                return int(num)

    amount = price_data.get("amount", 0)
    freq = price_data.get("frequency", "").lower()
    if freq == "weekly":
        return int(amount * 52 / 12)
    return amount


def _parse_property(prop: dict, now: str) -> dict:
    images = prop.get("images", [])
    first_image = None
    for img in images:
        if img.get("srcUrl"):
            first_image = img["srcUrl"]
            break

    if not first_image:
        pi_images = prop.get("propertyImages", {}).get("images", [])
        for img in pi_images:
            if img.get("srcUrl"):
                first_image = img["srcUrl"]
                break

    raw_url = prop.get("propertyUrl", "")
    listing_url = BASE_URL + raw_url if raw_url.startswith("/") else raw_url

    listing_update = prop.get("listingUpdate", {})
    first_visible = prop.get("firstVisibleDate") or listing_update.get("listingUpdateDate")
    listing_update_date = listing_update.get("listingUpdateDate")
    listing_update_reason = listing_update.get("listingUpdateReason")

    price = _get_monthly_price(prop.get("price", {}))

    return {
        "source": "rightmove",
        "source_id": str(prop["id"]),
        "address": prop.get("displayAddress", ""),
        "price": price,
        "bedrooms": prop.get("bedrooms") or 0,
        "bathrooms": prop.get("bathrooms"),
        "property_type": prop.get("propertySubType") or "",
        "description": prop.get("summary"),
        "image_url": first_image,
        "listing_url": listing_url,
        "agent_name": prop.get("customer", {}).get("branchDisplayName"),
        "first_visible_date": first_visible,
        "listing_update_date": listing_update_date,
        "listing_update_reason": listing_update_reason,
        "last_seen_at": now,
    }


def scrape(
    location_code: str = "REGION^93965",
    min_price: int = 2000,
    max_price: int = 2700,
    min_bedrooms: int | None = None,
    max_bedrooms: int | None = None,
    furnished_only: bool = False,
) -> list[dict]:
    search_params = {
        **_BASE_SEARCH_PARAMS,
        "locationIdentifier": location_code,
        "minPrice": str(min_price),
        "maxPrice": str(max_price),
    }
    if min_bedrooms is not None:
        search_params["minBedrooms"] = str(min_bedrooms)
    if max_bedrooms is not None:
        search_params["maxBedrooms"] = str(max_bedrooms)
    if furnished_only:
        # httpx serialises a list as repeated params: furnishTypes=furnished&furnishTypes=partFurnished
        search_params["furnishTypes"] = ["furnished", "partFurnished"]

    now = datetime.now(timezone.utc).isoformat()
    all_raw: list[dict] = []

    with httpx.Client(headers=HEADERS, follow_redirects=True) as client:
        raw_props, total = _fetch_page(client, 0, search_params)
        all_raw.extend(raw_props)

        total_pages = min((total + PAGE_SIZE - 1) // PAGE_SIZE, MAX_PAGES)
        print(f"  Rightmove: {total} results across {total_pages} page(s)")

        for page in range(1, total_pages):
            time.sleep(DELAY_SECONDS)
            index = page * PAGE_SIZE
            raw_props, _ = _fetch_page(client, index, search_params)
            if not raw_props:
                break
            all_raw.extend(raw_props)
            print(f"  Fetched page {page + 1}/{total_pages} ({len(all_raw)} so far)")

    return [_parse_property(p, now) for p in all_raw]
