import { Property } from "@/types/property";

const SOURCE_PRIORITY = ["rightmove", "onthemarket", "zoopla"];

export function normalizeAddress(addr: string): string {
  return addr
    .toLowerCase()
    .replace(/^(flat|apartment|unit|studio)\s+\w+[,\s]*/i, "")
    .replace(/[^a-z0-9\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Deduplicate properties that appear on multiple sources.
 * Groups by normalized address and picks the preferred source (Rightmove first).
 */
export function deduplicateProperties(properties: Property[]): Property[] {
  const groups = new Map<string, Property[]>();

  for (const p of properties) {
    const key = normalizeAddress(p.address);
    const group = groups.get(key) ?? [];
    group.push(p);
    groups.set(key, group);
  }

  return Array.from(groups.values()).map((group) => {
    group.sort((a, b) => {
      const aPri = SOURCE_PRIORITY.indexOf(a.source);
      const bPri = SOURCE_PRIORITY.indexOf(b.source);
      if (aPri !== bPri) return aPri - bPri;
      return (
        new Date(a.first_seen_at).getTime() - new Date(b.first_seen_at).getTime()
      );
    });
    return group[0];
  });
}
