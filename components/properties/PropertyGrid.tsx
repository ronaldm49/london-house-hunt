"use client";

import { Property, PropertyCategory } from "@/types/property";
import PropertyCard from "./PropertyCard";

interface PropertyGridProps {
  properties: Property[];
  onCategoryChange: (id: string, category: PropertyCategory | null) => void;
  onNotesChange: (id: string, notes: string | null) => void;
  emptyMessage: string;
  emptySubtext?: string;
  groupByDate?: boolean;
}

function dateLabel(iso: string | null): string {
  if (!iso) return "Unknown date";
  const d = new Date(iso);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);

  const same = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate();

  if (same(d, today)) return "Today";
  if (same(d, yesterday)) return "Yesterday";
  return d.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" });
}

function groupProperties(properties: Property[]): { label: string; items: Property[] }[] {
  const groups = new Map<string, Property[]>();
  for (const p of properties) {
    const label = dateLabel(p.first_seen_at ?? null);
    if (!groups.has(label)) groups.set(label, []);
    groups.get(label)!.push(p);
  }
  return Array.from(groups.entries()).map(([label, items]) => ({ label, items }));
}

export default function PropertyGrid({
  properties,
  onCategoryChange,
  onNotesChange,
  emptyMessage,
  emptySubtext,
  groupByDate = false,
}: PropertyGridProps) {
  if (properties.length === 0) {
    return (
      <div className="text-center py-20">
        <p className="text-text-secondary text-lg font-display">{emptyMessage}</p>
        {emptySubtext && (
          <p className="text-text-muted text-sm mt-2 font-body">{emptySubtext}</p>
        )}
      </div>
    );
  }

  if (!groupByDate) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
        {properties.map((property, i) => (
          <PropertyCard
            key={property.id}
            property={property}
            index={i}
            onCategoryChange={onCategoryChange}
            onNotesChange={onNotesChange}
          />
        ))}
      </div>
    );
  }

  const groups = groupProperties(properties);

  return (
    <div className="space-y-8">
      {groups.map(({ label, items }) => (
        <div key={label}>
          <div className="flex items-center gap-3 mb-4">
            <h3 className="text-sm font-display font-semibold text-text-secondary uppercase tracking-wider whitespace-nowrap">
              {label}
            </h3>
            <span className="text-xs font-body text-text-muted">
              {items.length} listing{items.length !== 1 ? "s" : ""}
            </span>
            <div className="flex-1 h-px bg-border" />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {items.map((property, i) => (
              <PropertyCard
                key={property.id}
                property={property}
                index={i}
                onCategoryChange={onCategoryChange}
                onNotesChange={onNotesChange}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
