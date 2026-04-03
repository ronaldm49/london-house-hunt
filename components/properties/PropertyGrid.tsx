"use client";

import { Property, PropertyCategory } from "@/types/property";
import PropertyCard from "./PropertyCard";

interface PropertyGridProps {
  properties: Property[];
  onCategoryChange: (id: string, category: PropertyCategory | null) => void;
  onNotesChange: (id: string, notes: string | null) => void;
  emptyMessage: string;
  emptySubtext?: string;
}

export default function PropertyGrid({
  properties,
  onCategoryChange,
  onNotesChange,
  emptyMessage,
  emptySubtext,
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
