"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { SearchProfile, AreaConfig } from "@/types/property";
import { LONDON_AREAS } from "@/lib/areas";

interface SearchProfileManagerProps {
  initialProfiles: SearchProfile[];
}

type FormState = {
  name: string;
  areas: AreaConfig[];
  min_price: string;
  max_price: string;
  min_bedrooms: string;
  max_bedrooms: string;
  furnished_only: boolean;
};

const emptyForm = (): FormState => ({
  name: "",
  areas: [],
  min_price: "2000",
  max_price: "2700",
  min_bedrooms: "",
  max_bedrooms: "",
  furnished_only: false,
});

function profileToForm(p: SearchProfile): FormState {
  return {
    name: p.name,
    areas: p.areas,
    min_price: String(p.min_price),
    max_price: String(p.max_price),
    min_bedrooms: p.min_bedrooms == null ? "" : String(p.min_bedrooms),
    max_bedrooms: p.max_bedrooms == null ? "" : String(p.max_bedrooms),
    furnished_only: Boolean(p.furnished_only),
  };
}

export default function SearchProfileManager({ initialProfiles }: SearchProfileManagerProps) {
  const [profiles, setProfiles] = useState<SearchProfile[]>(initialProfiles);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [showAreaDropdown, setShowAreaDropdown] = useState(false);
  const [areaSearch, setAreaSearch] = useState("");
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!showAreaDropdown) return;
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowAreaDropdown(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [showAreaDropdown]);

  const availableAreas = LONDON_AREAS.filter(
    (a) =>
      !form.areas.some((fa) => fa.name === a.name) &&
      a.name.toLowerCase().includes(areaSearch.toLowerCase())
  );

  const openAdd = () => {
    setEditingId("new");
    setForm(emptyForm());
    setError("");
  };

  const openEdit = (profile: SearchProfile) => {
    setEditingId(profile.id);
    setForm(profileToForm(profile));
    setError("");
  };

  const cancelEdit = () => {
    setEditingId(null);
    setError("");
  };

  const addArea = (area: AreaConfig) => {
    setForm((f) => ({ ...f, areas: [...f.areas, area] }));
    setShowAreaDropdown(false);
    setAreaSearch("");
  };

  const removeArea = (name: string) => {
    setForm((f) => ({ ...f, areas: f.areas.filter((a) => a.name !== name) }));
  };

  const save = async () => {
    setError("");
    const min = parseInt(form.min_price, 10);
    const max = parseInt(form.max_price, 10);
    const minBeds = form.min_bedrooms.trim() === "" ? null : parseInt(form.min_bedrooms, 10);
    const maxBeds = form.max_bedrooms.trim() === "" ? null : parseInt(form.max_bedrooms, 10);

    if (!form.name.trim()) { setError("Name is required"); return; }
    if (form.areas.length === 0) { setError("Add at least one area"); return; }
    if (isNaN(min) || isNaN(max) || min >= max) { setError("Enter a valid price range"); return; }
    if (minBeds !== null && (isNaN(minBeds) || minBeds < 0)) { setError("Min beds must be a non-negative number"); return; }
    if (maxBeds !== null && (isNaN(maxBeds) || maxBeds < 0)) { setError("Max beds must be a non-negative number"); return; }
    if (minBeds !== null && maxBeds !== null && minBeds > maxBeds) { setError("Min beds can't exceed max beds"); return; }

    setSaving(true);
    const body = {
      name: form.name.trim(),
      areas: form.areas,
      min_price: min,
      max_price: max,
      min_bedrooms: minBeds,
      max_bedrooms: maxBeds,
      furnished_only: form.furnished_only,
    };

    try {
      if (editingId === "new") {
        const res = await fetch("/api/search-profiles", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        if (!res.ok) { const d = await res.json(); setError(d.error || "Failed to create"); return; }
        const created: SearchProfile = await res.json();
        setProfiles((prev) => [...prev, created]);
      } else {
        const res = await fetch(`/api/search-profiles/${editingId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        if (!res.ok) { const d = await res.json(); setError(d.error || "Failed to save"); return; }
        const updated: SearchProfile = await res.json();
        setProfiles((prev) => prev.map((p) => (p.id === updated.id ? updated : p)));
      }
      setEditingId(null);
    } catch {
      setError("Network error");
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (profile: SearchProfile) => {
    const updated = { ...profile, is_active: !profile.is_active };
    setProfiles((prev) => prev.map((p) => (p.id === profile.id ? updated : p)));
    try {
      await fetch(`/api/search-profiles/${profile.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_active: !profile.is_active }),
      });
    } catch {
      setProfiles((prev) => prev.map((p) => (p.id === profile.id ? profile : p)));
    }
  };

  const deleteProfile = async (id: string) => {
    if (!confirm("Delete this search profile? Existing properties will not be removed.")) return;
    setProfiles((prev) => prev.filter((p) => p.id !== id));
    try {
      await fetch(`/api/search-profiles/${id}`, { method: "DELETE" });
    } catch {
      // Silent fail
    }
  };

  return (
    <>
      <header className="sticky top-0 z-50 backdrop-blur-xl bg-bg-primary/80 border-b border-border">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-5 flex items-end justify-between">
          <div>
            <h1 className="font-display text-3xl sm:text-4xl text-text-primary tracking-tight">
              Settings
            </h1>
            <p className="text-text-secondary text-sm mt-1 font-body">
              Manage your search profiles
            </p>
          </div>
          <Link
            href="/dashboard"
            className="text-text-muted hover:text-text-secondary transition-colors text-xs font-body flex items-center gap-1"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M19 12H5M12 5l-7 7 7 7" />
            </svg>
            Dashboard
          </Link>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="max-w-2xl space-y-4">

          {profiles.map((profile) => (
            <div key={profile.id} className="bg-bg-card border border-border rounded-xl">
              {editingId === profile.id ? (
                <ProfileForm
                  form={form}
                  setForm={setForm}
                  error={error}
                  saving={saving}
                  availableAreas={availableAreas}
                  showAreaDropdown={showAreaDropdown}
                  setShowAreaDropdown={setShowAreaDropdown}
                  areaSearch={areaSearch}
                  setAreaSearch={setAreaSearch}
                  dropdownRef={dropdownRef}
                  onAddArea={addArea}
                  onRemoveArea={removeArea}
                  onSave={save}
                  onCancel={cancelEdit}
                />
              ) : (
                <div className="p-5">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={`font-display text-lg ${profile.is_active ? "text-text-primary" : "text-text-muted"}`}>
                          {profile.name}
                        </span>
                        <span className={`inline-flex items-center gap-1.5 text-xs font-body px-2 py-0.5 rounded-full ${
                          profile.is_active
                            ? "bg-accent/10 text-accent"
                            : "bg-bg-secondary text-text-muted"
                        }`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${profile.is_active ? "bg-accent" : "bg-text-muted"}`} />
                          {profile.is_active ? "Active" : "Paused"}
                        </span>
                      </div>
                      <div className="flex items-center flex-wrap gap-1.5 mt-2">
                        {profile.areas.map((area) => (
                          <span
                            key={area.name}
                            className={`text-xs font-body px-2 py-0.5 rounded-full border ${
                              profile.is_active
                                ? "bg-bg-secondary text-text-secondary border-border"
                                : "bg-bg-secondary text-text-muted border-border opacity-50"
                            }`}
                          >
                            {area.name}
                          </span>
                        ))}
                        <span className="text-text-muted text-xs font-body">
                          &ensp;·&ensp;£{profile.min_price.toLocaleString()}–£{profile.max_price.toLocaleString()}/mo
                          {(profile.min_bedrooms != null || profile.max_bedrooms != null) && (
                            <>
                              &ensp;·&ensp;
                              {profile.min_bedrooms != null && profile.min_bedrooms === profile.max_bedrooms
                                ? `${profile.min_bedrooms} bed`
                                : `${profile.min_bedrooms ?? "any"}–${profile.max_bedrooms ?? "any"} beds`}
                            </>
                          )}
                          {profile.furnished_only && <>&ensp;·&ensp;furnished</>}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <button
                        onClick={() => toggleActive(profile)}
                        className="text-text-muted hover:text-text-secondary transition-colors text-xs font-body"
                      >
                        {profile.is_active ? "Pause" : "Resume"}
                      </button>
                      <button
                        onClick={() => openEdit(profile)}
                        className="text-text-muted hover:text-text-secondary transition-colors text-xs font-body"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => deleteProfile(profile.id)}
                        className="text-text-muted hover:text-accent-red transition-colors text-xs font-body"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          ))}

          {editingId === "new" ? (
            <div className="bg-bg-card border border-border rounded-xl">
              <ProfileForm
                form={form}
                setForm={setForm}
                error={error}
                saving={saving}
                availableAreas={availableAreas}
                showAreaDropdown={showAreaDropdown}
                setShowAreaDropdown={setShowAreaDropdown}
                areaSearch={areaSearch}
                setAreaSearch={setAreaSearch}
                dropdownRef={dropdownRef}
                onAddArea={addArea}
                onRemoveArea={removeArea}
                onSave={save}
                onCancel={cancelEdit}
              />
            </div>
          ) : (
            <button
              onClick={openAdd}
              className="w-full py-3 border border-dashed border-border rounded-xl text-text-muted hover:text-text-secondary hover:border-border-hover transition-colors text-sm font-body flex items-center justify-center gap-2"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="12" y1="5" x2="12" y2="19" />
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
              Add profile
            </button>
          )}

          {profiles.length === 0 && editingId !== "new" && (
            <p className="text-text-muted text-sm font-body text-center py-4">
              No search profiles yet. Add one to get started.
            </p>
          )}
        </div>
      </div>
    </>
  );
}

function ProfileForm({
  form,
  setForm,
  error,
  saving,
  availableAreas,
  showAreaDropdown,
  setShowAreaDropdown,
  areaSearch,
  setAreaSearch,
  dropdownRef,
  onAddArea,
  onRemoveArea,
  onSave,
  onCancel,
}: {
  form: FormState;
  setForm: React.Dispatch<React.SetStateAction<FormState>>;
  error: string;
  saving: boolean;
  availableAreas: AreaConfig[];
  showAreaDropdown: boolean;
  setShowAreaDropdown: (v: boolean) => void;
  areaSearch: string;
  setAreaSearch: (v: string) => void;
  dropdownRef: React.RefObject<HTMLDivElement>;
  onAddArea: (area: AreaConfig) => void;
  onRemoveArea: (name: string) => void;
  onSave: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="p-5 space-y-4">
      <div>
        <label className="block text-xs font-body text-text-muted mb-1.5">Profile name</label>
        <input
          type="text"
          value={form.name}
          onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
          placeholder="e.g. My Search"
          className="w-full bg-bg-input border border-border rounded-lg px-3 py-2 text-sm font-body text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent transition-colors"
        />
      </div>

      <div>
        <label className="block text-xs font-body text-text-muted mb-1.5">Areas</label>
        <div className="flex flex-wrap gap-1.5 mb-2">
          {form.areas.map((area) => (
            <span
              key={area.name}
              className="inline-flex items-center gap-1 bg-bg-secondary border border-border text-text-secondary text-xs font-body px-2 py-1 rounded-full"
            >
              {area.name}
              <button
                onClick={() => onRemoveArea(area.name)}
                className="text-text-muted hover:text-accent-red transition-colors ml-0.5"
              >
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </span>
          ))}
          {availableAreas.length > 0 && (
            <div className="relative" ref={dropdownRef}>
              <button
                onClick={() => setShowAreaDropdown(!showAreaDropdown)}
                className="inline-flex items-center gap-1 bg-bg-input border border-border text-text-muted hover:text-text-secondary hover:border-border-hover transition-colors text-xs font-body px-2 py-1 rounded-full"
              >
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
                </svg>
                Add area
              </button>
              {showAreaDropdown && (
                <div className="absolute left-0 top-full mt-1 w-56 bg-bg-card border border-border rounded-xl shadow-xl z-[100] flex flex-col">
                  <div className="p-2 border-b border-border">
                    <input
                      autoFocus
                      type="text"
                      value={areaSearch}
                      onChange={(e) => setAreaSearch(e.target.value)}
                      placeholder="Search areas..."
                      className="w-full bg-bg-input border border-border rounded-lg px-2.5 py-1.5 text-xs font-body text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent transition-colors"
                    />
                  </div>
                  <div className="overflow-y-auto max-h-52 py-1">
                    {availableAreas.length === 0 ? (
                      <p className="px-3 py-2 text-xs font-body text-text-muted">No areas found</p>
                    ) : (
                      availableAreas.map((area) => (
                        <button
                          key={area.name}
                          onClick={() => onAddArea(area)}
                          className="w-full text-left px-3 py-2 text-sm font-body text-text-secondary hover:bg-bg-secondary hover:text-text-primary transition-colors"
                        >
                          {area.name}
                        </button>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      <div>
        <label className="block text-xs font-body text-text-muted mb-1.5">Price range (per month)</label>
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted text-sm font-body">£</span>
            <input
              type="number"
              value={form.min_price}
              onChange={(e) => setForm((f) => ({ ...f, min_price: e.target.value }))}
              placeholder="2000"
              className="w-full bg-bg-input border border-border rounded-lg pl-7 pr-3 py-2 text-sm font-body text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent transition-colors"
            />
          </div>
          <span className="text-text-muted text-sm font-body">—</span>
          <div className="relative flex-1">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted text-sm font-body">£</span>
            <input
              type="number"
              value={form.max_price}
              onChange={(e) => setForm((f) => ({ ...f, max_price: e.target.value }))}
              placeholder="2700"
              className="w-full bg-bg-input border border-border rounded-lg pl-7 pr-3 py-2 text-sm font-body text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent transition-colors"
            />
          </div>
        </div>
      </div>

      <div>
        <label className="block text-xs font-body text-text-muted mb-1.5">
          Bedrooms <span className="text-text-muted/70">(leave blank for no limit)</span>
        </label>
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <input
              type="number"
              min="0"
              value={form.min_bedrooms}
              onChange={(e) => setForm((f) => ({ ...f, min_bedrooms: e.target.value }))}
              placeholder="Min"
              className="w-full bg-bg-input border border-border rounded-lg px-3 py-2 text-sm font-body text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent transition-colors"
            />
          </div>
          <span className="text-text-muted text-sm font-body">—</span>
          <div className="relative flex-1">
            <input
              type="number"
              min="0"
              value={form.max_bedrooms}
              onChange={(e) => setForm((f) => ({ ...f, max_bedrooms: e.target.value }))}
              placeholder="Max"
              className="w-full bg-bg-input border border-border rounded-lg px-3 py-2 text-sm font-body text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent transition-colors"
            />
          </div>
        </div>
      </div>

      <div>
        <label className="inline-flex items-center gap-2 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={form.furnished_only}
            onChange={(e) => setForm((f) => ({ ...f, furnished_only: e.target.checked }))}
            className="w-4 h-4 rounded border-border bg-bg-input accent-accent cursor-pointer"
          />
          <span className="text-sm font-body text-text-secondary">Furnished / part-furnished only</span>
        </label>
      </div>

      {error && (
        <p className="text-accent-red text-xs font-body">{error}</p>
      )}

      <div className="flex items-center justify-end gap-3 pt-1">
        <button
          onClick={onCancel}
          className="text-text-muted hover:text-text-secondary transition-colors text-sm font-body"
        >
          Cancel
        </button>
        <button
          onClick={onSave}
          disabled={saving}
          className="bg-accent hover:bg-accent-hover text-white rounded-lg px-4 py-2 text-sm font-body font-medium transition-colors disabled:opacity-50 flex items-center gap-1.5"
        >
          {saving ? (
            <>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="animate-spin">
                <path d="M21 12a9 9 0 1 1-6.22-8.56" />
              </svg>
              Saving
            </>
          ) : "Save"}
        </button>
      </div>
    </div>
  );
}
