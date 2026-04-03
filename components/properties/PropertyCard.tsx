"use client";

import { useState, useRef, useEffect } from "react";
import { Property, PropertyCategory } from "@/types/property";

interface PropertyCardProps {
  property: Property;
  index: number;
  onCategoryChange: (id: string, category: PropertyCategory | null) => void;
  onNotesChange: (id: string, notes: string | null) => void;
}

function relativeTime(dateStr: string | null): string {
  if (!dateStr) return "";
  const diff = Date.now() - new Date(dateStr).getTime();
  const hours = Math.floor(diff / 3_600_000);
  if (hours < 1) return "Just now";
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
  });
}

const SOURCE_LABEL: Record<string, string> = {
  rightmove: "Rightmove",
  onthemarket: "OnTheMarket",
  zoopla: "Zoopla",
};

const SOURCE_COLOR: Record<string, string> = {
  rightmove: "bg-[#0061a2]/70",
  onthemarket: "bg-[#4a7c59]/70",
  zoopla: "bg-[#7c3aed]/70",
};

const DAY_MS = 24 * 60 * 60 * 1000;

const IconBin = () => (
  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6M9 7h6m-7 0a1 1 0 01-1-1V5a1 1 0 011-1h8a1 1 0 011 1v1a1 1 0 01-1 1H9z" />
  </svg>
);

const IconStar = ({ filled }: { filled: boolean }) => (
  <svg className="w-3.5 h-3.5" fill={filled ? "currentColor" : "none"} stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.8}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M11.48 3.499a.562.562 0 011.04 0l2.125 5.111a.563.563 0 00.475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 00-.182.557l1.285 5.385a.562.562 0 01-.84.61l-4.725-2.885a.563.563 0 00-.586 0L6.982 20.54a.562.562 0 01-.84-.61l1.285-5.386a.562.562 0 00-.182-.557l-4.204-3.602a.562.562 0 01.321-.988l5.518-.442a.563.563 0 00.475-.345L11.48 3.5z" />
  </svg>
);

const IconCheck = () => (
  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
  </svg>
);

const IconOffer = () => (
  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
  </svg>
);

const IconBed = () => (
  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12l8.954-8.955c.44-.439 1.152-.439 1.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75M8.25 21h8.25" />
  </svg>
);

export default function PropertyCard({
  property,
  index,
  onCategoryChange,
  onNotesChange,
}: PropertyCardProps) {
  const [editingNotes, setEditingNotes] = useState(false);
  const [notesDraft, setNotesDraft] = useState(property.notes ?? "");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const isNew =
    mounted &&
    !property.category &&
    Date.now() - new Date(property.first_seen_at).getTime() < DAY_MS;

  const listedTime = mounted ? relativeTime(property.first_visible_date) : "";
  const staggerClass = `stagger-${Math.min(index + 1, 9)}`;

  const handleNotesBlur = () => {
    setEditingNotes(false);
    const trimmed = notesDraft.trim() || null;
    if (trimmed !== property.notes) {
      onNotesChange(property.id, trimmed);
    }
  };

  const handleNotesClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    setEditingNotes(true);
    setNotesDraft(property.notes ?? "");
    setTimeout(() => textareaRef.current?.focus(), 0);
  };

  const sourceBadgeClass = SOURCE_COLOR[property.source] ?? "bg-black/50";
  const sourceLabel = SOURCE_LABEL[property.source] ?? property.source;

  const categoryBtn = (
    cat: PropertyCategory,
    label: string,
    Icon: React.ReactNode,
    activeBg: string,
    activeBorder: string,
    activeText: string,
    hoverClass: string
  ) => {
    const isActive = property.category === cat;
    return (
      <button
        onClick={(e) => {
          e.stopPropagation();
          e.preventDefault();
          onCategoryChange(property.id, isActive ? null : cat);
        }}
        style={isActive ? { backgroundColor: activeBg, borderColor: activeBorder } : {}}
        className={`
          flex-1 flex items-center justify-center gap-1.5 py-2 rounded-md text-xs font-medium
          border transition-all duration-150
          ${isActive
            ? `${activeText} scale-[0.97] border-transparent`
            : `text-text-muted border-transparent ${hoverClass}`
          }
        `}
        title={isActive ? `Remove from ${label}` : label}
      >
        {Icon}
        <span>{label}</span>
      </button>
    );
  };

  return (
    <div
      className={`animate-fade-in-up ${staggerClass} group bg-bg-card rounded-xl border border-border hover:border-border-hover hover:shadow-md transition-all duration-200 overflow-hidden flex flex-col`}
    >
      <a
        href={property.listing_url}
        target="_blank"
        rel="noopener noreferrer"
        className="block relative h-48 bg-bg-secondary overflow-hidden"
      >
        {property.image_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={property.image_url}
            alt={property.address}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <svg className="w-10 h-10 text-border" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909M3 21l6.75-6.75a2.25 2.25 0 013.182 0L21 21M15 11.25a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0z" />
            </svg>
          </div>
        )}
        <div className="absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-black/60 to-transparent" />

        {property.category === "wishlist" ? (
          <span className="absolute top-3 left-3 bg-accent-gold text-white text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded">
            Wish List
          </span>
        ) : property.category === "called" ? (
          <span className="absolute top-3 left-3 bg-accent-blue text-white text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded">
            Called
          </span>
        ) : property.category === "offered" ? (
          <span className="absolute top-3 left-3 bg-accent-purple text-white text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded">
            Offered
          </span>
        ) : property.listing_update_reason?.toLowerCase().includes("price") ? (
          <span className="absolute top-3 left-3 bg-accent text-white text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded">
            Price reduced
          </span>
        ) : isNew ? (
          <span className="absolute top-3 left-3 bg-accent-green text-white text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded animate-pulse-subtle">
            New
          </span>
        ) : null}

        <span className={`absolute top-3 right-3 ${sourceBadgeClass} backdrop-blur-sm text-white text-[10px] uppercase tracking-wider px-2 py-1 rounded`}>
          {sourceLabel}
        </span>

        <div className="absolute bottom-3 left-3 right-3 flex items-end justify-between">
          <span className="text-2xl font-display text-white drop-shadow-lg">
            £{property.price.toLocaleString()}
            <span className="text-sm text-white/70 font-body">/mo</span>
          </span>
          {listedTime && (
            <span className="text-[11px] text-white/60 font-body">{listedTime}</span>
          )}
        </div>
      </a>

      <div className="p-4 flex-1 flex flex-col gap-3">
        <div>
          <div className="flex items-center gap-3 text-sm text-text-secondary font-body">
            {property.bedrooms != null && (
              <span className="flex items-center gap-1">
                <IconBed />
                {property.bedrooms} bed
              </span>
            )}
            {property.bathrooms != null && <span>{property.bathrooms} bath</span>}
            {property.property_type && (
              <span className="text-text-muted capitalize">{property.property_type}</span>
            )}
          </div>
          <a
            href={property.listing_url}
            target="_blank"
            rel="noopener noreferrer"
            className="block mt-1.5 text-text-primary font-body text-sm leading-snug hover:text-accent transition-colors truncate"
          >
            {property.address}
          </a>
          {property.agent_name && (
            <p className="text-text-muted text-xs mt-1 truncate font-body">
              {property.agent_name}
            </p>
          )}
        </div>

        <div onClick={handleNotesClick} className="min-h-[32px]">
          {editingNotes ? (
            <textarea
              ref={textareaRef}
              value={notesDraft}
              onChange={(e) => setNotesDraft(e.target.value)}
              onBlur={handleNotesBlur}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleNotesBlur();
                }
                if (e.key === "Escape") {
                  setEditingNotes(false);
                  setNotesDraft(property.notes ?? "");
                }
              }}
              placeholder="Add a note..."
              rows={2}
              className="w-full bg-bg-input text-text-primary text-xs font-body p-2 rounded border border-border focus:border-accent focus:outline-none resize-none"
            />
          ) : property.notes ? (
            <p className="text-xs text-text-secondary italic font-body p-2 bg-bg-secondary rounded border border-transparent hover:border-border-hover cursor-text transition-colors">
              {property.notes}
            </p>
          ) : (
            <p className="text-xs text-text-muted font-body p-2 rounded border border-transparent hover:border-border-hover cursor-text transition-colors">
              Add note...
            </p>
          )}
        </div>

        <div className="flex gap-1 mt-auto pt-1 border-t border-border">
          {categoryBtn(
            "bin", "Bin", <IconBin />,
            "var(--btn-bin-bg)", "var(--btn-bin-border)", "text-accent-red",
            "hover:bg-[#fdf0ec] hover:text-accent-red"
          )}
          {categoryBtn(
            "wishlist", "Wish List", <IconStar filled={property.category === "wishlist"} />,
            "var(--btn-wishlist-bg)", "var(--btn-wishlist-border)", "text-accent-gold",
            "hover:bg-[#faf5e4] hover:text-accent-gold"
          )}
          {categoryBtn(
            "called", "Called", <IconCheck />,
            "var(--btn-called-bg)", "var(--btn-called-border)", "text-accent-blue",
            "hover:bg-[#edf3fa] hover:text-accent-blue"
          )}
          {categoryBtn(
            "offered", "Offered", <IconOffer />,
            "var(--btn-offered-bg)", "var(--btn-offered-border)", "text-accent-purple",
            "hover:bg-[#f3effe] hover:text-accent-purple"
          )}
        </div>
      </div>
    </div>
  );
}
