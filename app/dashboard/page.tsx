import { supabase } from "@/lib/supabase";
import { deduplicateProperties, normalizeAddress } from "@/lib/dedup";
import PropertyDashboard from "@/components/properties/PropertyDashboard";
import { SearchProfile } from "@/types/property";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Dashboard | London House Hunt",
};

export default async function DashboardPage() {
  const oneDayAgo = new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString();

  const [newRes, wishlistRes, calledRes, offeredRes, binRes, lastScrapedRes, allAddressesRes, profilesRes] = await Promise.all([
    supabase
      .from("properties")
      .select("*")
      .eq("is_active", true)
      .is("category", null)
      .gte("first_seen_at", oneDayAgo)
      .order("last_activity_date", { ascending: false, nullsFirst: false }),
    supabase
      .from("properties")
      .select("*")
      .eq("is_active", true)
      .eq("category", "wishlist")
      .order("last_activity_date", { ascending: false, nullsFirst: false }),
    supabase
      .from("properties")
      .select("*")
      .eq("is_active", true)
      .eq("category", "called")
      .order("last_activity_date", { ascending: false, nullsFirst: false }),
    supabase
      .from("properties")
      .select("*")
      .eq("is_active", true)
      .eq("category", "offered")
      .order("last_activity_date", { ascending: false, nullsFirst: false }),
    supabase
      .from("properties")
      .select("*")
      .eq("is_active", true)
      .eq("category", "bin")
      .order("last_activity_date", { ascending: false, nullsFirst: false }),
    supabase
      .from("properties")
      .select("last_seen_at")
      .order("last_seen_at", { ascending: false })
      .limit(1),
    // Fetch all categorised property addresses to filter cross-source duplicates
    supabase
      .from("properties")
      .select("address")
      .eq("is_active", true)
      .not("category", "is", null),
    // Fetch active search profiles for the header summary
    supabase
      .from("search_profiles")
      .select("*")
      .eq("is_active", true)
      .order("created_at", { ascending: true }),
  ]);

  const lastScraped = lastScrapedRes.data?.[0]?.last_seen_at ?? null;

  // Build dynamic header summary from active search profiles
  const activeProfiles = (profilesRes.data ?? []) as SearchProfile[];
  const searchSummary = activeProfiles.length > 0
    ? (() => {
        const allAreas = activeProfiles.flatMap((p) => p.areas.map((a) => a.name));
        const uniqueAreas = allAreas.filter((a, i) => allAreas.indexOf(a) === i);
        const prices = activeProfiles.map((p) => ({ min: p.min_price, max: p.max_price }));
        const minPrice = Math.min(...prices.map((p) => p.min));
        const maxPrice = Math.max(...prices.map((p) => p.max));
        return `${uniqueAreas.join(", ")}\u2002\u00b7\u2002\u00a3${minPrice.toLocaleString()}\u2013\u00a3${maxPrice.toLocaleString()}/mo`;
      })()
    : undefined;

  // Build a set of normalized addresses for all categorised properties
  // so we can exclude OTM/Zoopla dupes of already-seen Rightmove listings
  const categorisedAddresses = new Set(
    (allAddressesRes.data ?? []).map((p: { address: string }) => normalizeAddress(p.address))
  );

  return (
    <div className="min-h-screen relative z-10">
      <PropertyDashboard
          initialNew={deduplicateProperties(
            (newRes.data ?? []).filter(
              (p) => !categorisedAddresses.has(normalizeAddress(p.address))
            )
          )}
          initialWishlist={wishlistRes.data ?? []}
          initialCalled={calledRes.data ?? []}
          initialOffered={offeredRes.data ?? []}
          initialBin={binRes.data ?? []}
          lastScraped={lastScraped}
          searchSummary={searchSummary}
          profiles={activeProfiles}
        />
    </div>
  );
}
