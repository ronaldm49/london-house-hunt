"use client";

import { useState, useCallback, useMemo, useEffect } from "react";
import { Property, PropertyCategory, SearchProfile } from "@/types/property";
import DashboardHeader from "@/components/ui/DashboardHeader";
import TabBar, { TabId } from "@/components/ui/TabBar";
import StatsBar from "@/components/ui/StatsBar";
import PropertyGrid from "./PropertyGrid";

const PROFILE_STORAGE_KEY = "lhh_selected_profile";

interface PropertyDashboardProps {
  initialNew: Property[];
  initialWishlist: Property[];
  initialCalled: Property[];
  initialOffered: Property[];
  initialBin: Property[];
  lastScraped: string | null;
  searchSummary?: string;
  profiles?: SearchProfile[];
}

function matchesSearch(p: Property, q: string): boolean {
  const lower = q.toLowerCase();
  return [p.address, p.notes, p.agent_name, p.property_type, p.description]
    .some((field) => field?.toLowerCase().includes(lower));
}

function buildSummary(profile: SearchProfile): string {
  const areas = profile.areas.map((a) => a.name).join(", ");
  return `${areas}\u2002\u00b7\u2002\u00a3${profile.min_price.toLocaleString()}\u2013\u00a3${profile.max_price.toLocaleString()}/mo`;
}

export default function PropertyDashboard({
  initialNew,
  initialWishlist,
  initialCalled,
  initialOffered,
  initialBin,
  lastScraped,
  searchSummary,
  profiles = [],
}: PropertyDashboardProps) {
  const [activeTab, setActiveTab] = useState<TabId>("new");
  const [search, setSearch] = useState("");
  const [selectedProfileId, setSelectedProfileId] = useState<string>("all");
  const [profileMounted, setProfileMounted] = useState(false);
  const [newProperties, setNewProperties] = useState(initialNew);
  const [wishlistProperties, setWishlistProperties] = useState(initialWishlist);
  const [calledProperties, setCalledProperties] = useState(initialCalled);
  const [offeredProperties, setOfferedProperties] = useState(initialOffered);
  const [binProperties, setBinProperties] = useState(initialBin);

  useEffect(() => {
    const stored = localStorage.getItem(PROFILE_STORAGE_KEY);
    if (stored && (stored === "all" || profiles.some((p) => p.id === stored))) {
      setSelectedProfileId(stored);
    }
    setProfileMounted(true);
  }, [profiles]);

  const selectProfile = (id: string) => {
    setSelectedProfileId(id);
    localStorage.setItem(PROFILE_STORAGE_KEY, id);
  };

  const filterByProfile = useCallback(
    (list: Property[]) => {
      if (selectedProfileId === "all") return list;
      return list.filter((p) => p.search_profile_id === selectedProfileId);
    },
    [selectedProfileId]
  );

  const selectedProfile = profiles.find((p) => p.id === selectedProfileId);
  const activeSearchSummary = selectedProfile ? buildSummary(selectedProfile) : searchSummary;

  const allArrays = {
    new: newProperties,
    wishlist: wishlistProperties,
    called: calledProperties,
    offered: offeredProperties,
    bin: binProperties,
  };
  const setters = {
    new: setNewProperties,
    wishlist: setWishlistProperties,
    called: setCalledProperties,
    offered: setOfferedProperties,
    bin: setBinProperties,
  };

  const findProperty = (id: string): { property: Property; tab: TabId } | null => {
    for (const tab of ["new", "wishlist", "called", "offered", "bin"] as TabId[]) {
      const p = allArrays[tab].find((p) => p.id === id);
      if (p) return { property: p, tab };
    }
    return null;
  };

  const updateCategory = useCallback(
    async (id: string, category: PropertyCategory | null) => {
      const found = findProperty(id);
      if (!found) return;

      const { property: prop, tab: fromTab } = found;
      const updated = { ...prop, category };

      setters[fromTab]((prev) => prev.filter((p) => p.id !== id));

      if (category === null) {
        setters.new((prev) => [updated, ...prev]);
      } else if (category === "wishlist") {
        setters.wishlist((prev) => [updated, ...prev]);
      } else if (category === "called") {
        setters.called((prev) => [updated, ...prev]);
      } else if (category === "offered") {
        setters.offered((prev) => [updated, ...prev]);
      } else if (category === "bin") {
        setters.bin((prev) => [updated, ...prev]);
      }

      try {
        const res = await fetch(`/api/properties/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ category }),
        });
        if (!res.ok) throw new Error("Failed to update");
      } catch {
        if (category !== null) {
          const targetTab = category === "wishlist" ? "wishlist"
            : category === "called" ? "called"
            : category === "offered" ? "offered"
            : "bin";
          setters[targetTab]((prev) => prev.filter((p) => p.id !== id));
        }
        setters[fromTab]((prev) => [prop, ...prev]);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [newProperties, wishlistProperties, calledProperties, offeredProperties, binProperties]
  );

  const updateNotes = useCallback(
    async (id: string, notes: string | null) => {
      for (const tab of ["new", "wishlist", "called", "offered", "bin"] as TabId[]) {
        setters[tab]((prev) =>
          prev.map((p) => (p.id === id ? { ...p, notes } : p))
        );
      }
      try {
        const res = await fetch(`/api/properties/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ notes }),
        });
        if (!res.ok) throw new Error("Failed to save notes");
      } catch {
        // Silent fail
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  const profileFiltered = useMemo(() => ({
    new: filterByProfile(newProperties),
    wishlist: filterByProfile(wishlistProperties),
    called: filterByProfile(calledProperties),
    offered: filterByProfile(offeredProperties),
    bin: filterByProfile(binProperties),
  }), [filterByProfile, newProperties, wishlistProperties, calledProperties, offeredProperties, binProperties]);

  const filteredProperties = useMemo(() => {
    const base = profileFiltered[activeTab];
    if (!search.trim()) return base;
    return base.filter((p) => matchesSearch(p, search));
  }, [activeTab, search, profileFiltered]);

  const tabs = [
    { id: "new" as TabId, label: "New", count: profileFiltered.new.length },
    { id: "wishlist" as TabId, label: "Wish List", count: profileFiltered.wishlist.length },
    { id: "called" as TabId, label: "Called", count: profileFiltered.called.length },
    { id: "offered" as TabId, label: "Offered", count: profileFiltered.offered.length },
    { id: "bin" as TabId, label: "Bin", count: profileFiltered.bin.length },
  ];

  const totalForTab = profileFiltered[activeTab].length;

  const emptyMessages: Record<TabId, { msg: string; sub?: string }> = {
    new: {
      msg: search ? "No listings match your search" : "Nothing new right now",
      sub: search ? undefined : "You're up to date. The scraper runs every 4 hours.",
    },
    wishlist: {
      msg: search ? "No listings match your search" : "Your wish list is empty",
      sub: search ? undefined : "Star a property to save it here.",
    },
    called: {
      msg: search ? "No listings match your search" : "No called properties yet",
      sub: search ? undefined : "Mark a property as called after contacting the agent.",
    },
    offered: {
      msg: search ? "No listings match your search" : "No offers made yet",
      sub: search ? undefined : "Properties you've made an offer on appear here.",
    },
    bin: {
      msg: search ? "No listings match your search" : "Your bin is empty",
      sub: search ? undefined : "Binned properties appear here.",
    },
  };

  const handleImport = useCallback((property: Property) => {
    setNewProperties((prev) => [property, ...prev]);
  }, []);

  return (
    <>
    <DashboardHeader onImport={handleImport} searchSummary={activeSearchSummary} />
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
      <StatsBar
        newCount={profileFiltered.new.length}
        wishlistCount={profileFiltered.wishlist.length}
        calledCount={profileFiltered.called.length}
        lastScraped={lastScraped}
      />

      {profileMounted && profiles.length > 1 && (
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-text-muted text-xs font-body mr-1">View:</span>
          <button
            onClick={() => selectProfile("all")}
            className={`text-xs font-body px-3 py-1 rounded-full border transition-colors ${
              selectedProfileId === "all"
                ? "bg-accent text-white border-accent"
                : "bg-bg-card text-text-secondary border-border hover:border-border-hover"
            }`}
          >
            All
          </button>
          {profiles.map((profile) => (
            <button
              key={profile.id}
              onClick={() => selectProfile(profile.id)}
              className={`text-xs font-body px-3 py-1 rounded-full border transition-colors ${
                selectedProfileId === profile.id
                  ? "bg-accent text-white border-accent"
                  : "bg-bg-card text-text-secondary border-border hover:border-border-hover"
              }`}
            >
              {profile.name}
            </button>
          ))}
        </div>
      )}

      <div className="relative">
        <svg
          className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-text-muted"
          fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z" />
        </svg>
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by location, notes, agent..."
          className="w-full pl-8 pr-16 py-2 bg-bg-card border border-border rounded-lg text-sm font-body text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent transition-colors"
        />
        <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-2">
          {search.trim() && (
            <span className="text-text-muted text-xs font-body">
              {filteredProperties.length}/{totalForTab}
            </span>
          )}
          {search && (
            <button
              onClick={() => setSearch("")}
              className="text-text-muted hover:text-text-secondary transition-colors"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>
      </div>

      <TabBar activeTab={activeTab} onTabChange={setActiveTab} tabs={tabs} />

      <PropertyGrid
        properties={filteredProperties}
        onCategoryChange={updateCategory}
        onNotesChange={updateNotes}
        emptyMessage={emptyMessages[activeTab].msg}
        emptySubtext={emptyMessages[activeTab].sub}
      />
    </div>
    </>
  );
}
