import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";

const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

export async function POST(request: NextRequest) {
  const { url } = await request.json();

  if (!url || typeof url !== "string") {
    return NextResponse.json({ error: "URL is required" }, { status: 400 });
  }

  try {
    let property;
    if (url.includes("rightmove.co.uk")) {
      property = await parseRightmove(url);
    } else if (url.includes("onthemarket.com")) {
      property = await parseOnTheMarket(url);
    } else {
      return NextResponse.json(
        { error: "URL must be from rightmove.co.uk or onthemarket.com" },
        { status: 400 }
      );
    }

    const { data, error } = await supabaseServer
      .from("properties")
      .upsert(property, { onConflict: "source,source_id" })
      .select()
      .single();

    if (error) throw new Error(error.message);
    return NextResponse.json(data);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to import";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// Extract a JSON object starting at `start` index in `html`, handling strings correctly
function extractJson(html: string, start: number): string {
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < html.length; i++) {
    const c = html[i];
    if (escaped) { escaped = false; continue; }
    if (c === "\\" && inString) { escaped = true; continue; }
    if (c === '"') { inString = !inString; continue; }
    if (inString) continue;
    if (c === "{") depth++;
    else if (c === "}") { depth--; if (depth === 0) return html.slice(start, i + 1); }
  }
  throw new Error("Could not find end of JSON object");
}

async function fetchPage(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: {
      "User-Agent": USER_AGENT,
      "Accept-Language": "en-GB,en;q=0.9",
      Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    },
  });
  if (!res.ok) throw new Error(`Failed to fetch page: ${res.status}`);
  return res.text();
}

async function parseRightmove(url: string): Promise<Record<string, unknown>> {
  const idMatch = url.match(/properties\/(\d+)/);
  if (!idMatch) throw new Error("Could not extract Rightmove property ID from URL");
  const sourceId = idMatch[1];

  const html = await fetchPage(url);

  const pageModelIdx = html.indexOf("window.PAGE_MODEL = ");
  if (pageModelIdx === -1) throw new Error("Could not find PAGE_MODEL on Rightmove page");

  const jsonStart = pageModelIdx + "window.PAGE_MODEL = ".length;
  const jsonStr = extractJson(html, jsonStart);
  const data = JSON.parse(jsonStr);
  const pd = data?.propertyData ?? null;

  if (!pd) throw new Error("Could not extract property data from Rightmove page");

  let price = 0;
  const priceInfo = pd.prices;
  if (priceInfo) {
    const primary = priceInfo.primaryPrice || "";
    const pcmMatch = primary.match(/£([\d,]+)\s*pcm/i);
    if (pcmMatch) {
      price = parseInt(pcmMatch[1].replace(/,/g, ""), 10);
    } else {
      const pwMatch = primary.match(/£([\d,]+)\s*pw/i);
      if (pwMatch) {
        price = Math.round((parseInt(pwMatch[1].replace(/,/g, ""), 10) * 52) / 12);
      }
    }
  }

  const images = pd.images || [];
  const firstImage =
    images[0]?.url || images[0]?.srcUrl || images[0]?.src || null;

  return {
    source: "rightmove",
    source_id: sourceId,
    address: pd.address?.displayAddress || pd.displayAddress || "",
    price,
    bedrooms: pd.bedrooms ?? null,
    bathrooms: pd.bathrooms ?? null,
    property_type: pd.propertySubType || pd.propertyType || "",
    description: pd.text?.description || pd.summary || null,
    image_url: firstImage,
    listing_url: url.split("?")[0].split("#")[0],
    agent_name:
      pd.customer?.branchDisplayName ||
      pd.customer?.displayName ||
      pd.branchName ||
      null,
    last_seen_at: new Date().toISOString(),
    is_active: true,
  };
}

async function parseOnTheMarket(
  url: string
): Promise<Record<string, unknown>> {
  const idMatch = url.match(/details\/(\d+)/);
  if (!idMatch) throw new Error("Could not extract OnTheMarket property ID from URL");
  const sourceId = idMatch[1];

  const html = await fetchPage(url);

  const jsonLdMatch = html.match(
    new RegExp('<script[^>]*type="application/ld\\+json"[^>]*>([\\s\\S]*?)</script>')
  );

  let address = "";
  let description: string | null = null;
  let firstImage: string | null = null;

  if (jsonLdMatch) {
    try {
      const ld = JSON.parse(jsonLdMatch[1]);
      if (ld["@type"] === "Residence" || ld["@type"] === "SingleFamilyResidence" || ld["@type"] === "Apartment") {
        address = ld.name || "";
        description = ld.description || null;
        firstImage = ld.image || ld.photo?.[0]?.contentUrl || null;
      }
    } catch {
      // JSON-LD parse failed, continue to Redux state
    }
  }

  let price = 0;
  let bedrooms: number | null = null;
  let bathrooms: number | null = null;
  let propertyType = "";
  let agentName: string | null = null;

  const scripts = html.match(new RegExp('<script[^>]*>[\\s\\S]*?</script>', 'g')) || [];
  for (const script of scripts) {
    if (!script.includes("initialReduxState") && !script.includes("property-details")) {
      continue;
    }

    const propsMatch = script.match(new RegExp('(\\{"props"[\\s\\S]*\\})'));
    if (!propsMatch) continue;

    try {
      const data = JSON.parse(propsMatch[1]);
      const pageProps = data?.props?.pageProps || {};
      const property = pageProps.property || pageProps.propertyDetails || {};

      if (property.price) {
        const pcm = property.price.match?.(/£([\d,]+)\s*pcm/i);
        if (pcm) price = parseInt(pcm[1].replace(/,/g, ""), 10);
        else {
          const pw = property.price.match?.(/£([\d,]+)\s*pw/i);
          if (pw) price = Math.round((parseInt(pw[1].replace(/,/g, ""), 10) * 52) / 12);
        }
      }
      if (typeof property.price === "number") price = property.price;

      address = address || property.address || property.displayAddress || "";
      bedrooms = property.bedrooms ?? null;
      bathrooms = property.bathrooms ?? null;
      propertyType = property["humanised-property-type"] || property.propertyType || "";
      agentName = property.agent?.name || property.agentName || null;
      description = description || property.description || null;

      if (!firstImage && property.images?.length) {
        firstImage = property.images[0]?.default || property.images[0]?.webp || property.images[0]?.url || null;
      }
      break;
    } catch {
      continue;
    }
  }

  if (!address) {
    const titleMatch = html.match(new RegExp('<title[^>]*>([\\s\\S]*?)</title>'));
    if (titleMatch) address = titleMatch[1].replace(/\s*[-|].*$/, "").trim();
  }
  if (!firstImage) {
    const ogImage = html.match(/<meta[^>]*property="og:image"[^>]*content="([^"]+)"/);
    if (ogImage) firstImage = ogImage[1];
  }
  if (price === 0) {
    const priceMatch = html.match(/£([\d,]+)\s*pcm/i);
    if (priceMatch) price = parseInt(priceMatch[1].replace(/,/g, ""), 10);
  }
  if (!description) {
    const descMatch = html.match(/<meta[^>]*name="description"[^>]*content="([^"]+)"/);
    if (descMatch) description = descMatch[1];
  }
  if (bedrooms === null) {
    const bedMatch = (address + " " + (description || "")).match(/(\d+)\s*bed/i);
    if (bedMatch) bedrooms = parseInt(bedMatch[1], 10);
  }
  if (bathrooms === null) {
    const bathMatch = (address + " " + (description || "")).match(/(\d+)\s*bath/i);
    if (bathMatch) bathrooms = parseInt(bathMatch[1], 10);
  }
  if (!propertyType) {
    const typeMatch = (address + " " + (description || "")).match(/\b(flat|apartment|house|studio|maisonette|duplex|penthouse|room)\b/i);
    if (typeMatch) propertyType = typeMatch[1].charAt(0).toUpperCase() + typeMatch[1].slice(1).toLowerCase();
  }
  if (!agentName) {
    const agentMatch = html.match(/marketed\s+by\s+([^<"]+)/i) || html.match(/"agent-name"[^>]*>([^<]+)</);
    if (agentMatch) agentName = agentMatch[1].trim();
  }

  return {
    source: "onthemarket",
    source_id: sourceId,
    address,
    price,
    bedrooms,
    bathrooms,
    property_type: propertyType,
    description,
    image_url: firstImage,
    listing_url: url.split("?")[0].split("#")[0],
    agent_name: agentName,
    last_seen_at: new Date().toISOString(),
    is_active: true,
  };
}
