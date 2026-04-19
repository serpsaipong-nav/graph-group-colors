import type { CachedMetadata } from "obsidian";

/**
 * Collects tags for graph color-group matching from Obsidian `CachedMetadata`.
 * Read-only; mirrors common tag sources (inline + frontmatter) so `GroupResolver` stays aligned
 * with how users tag notes. Full search-query parity with core remains a separate milestone.
 */

function normalizeTagToken(raw: string): string | null {
  const t = raw.trim();
  if (!t.length) {
    return null;
  }
  return t.startsWith("#") ? t : `#${t}`;
}

function pushTag(out: string[], seen: Set<string>, raw: string): void {
  const n = normalizeTagToken(raw);
  if (!n || seen.has(n)) {
    return;
  }
  seen.add(n);
  out.push(n);
}

function addStringOrListTags(s: string, out: string[], seen: Set<string>): void {
  const trimmed = s.trim();
  if (!trimmed.length) {
    return;
  }
  // Frontmatter sometimes stores a list as one string: `a, b`, `#a, #b`, or `a; b` (no YAML array).
  if (trimmed.includes(",") || trimmed.includes(";")) {
    const parts = trimmed.split(/[,;]/).map((p) => p.trim()).filter((p) => p.length > 0);
    if (parts.length > 1) {
      for (const p of parts) {
        pushTag(out, seen, p);
      }
      return;
    }
  }
  pushTag(out, seen, trimmed);
}

function addFromFrontmatterValue(value: unknown, out: string[], seen: Set<string>): void {
  if (value === undefined || value === null) {
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      if (typeof item === "string") {
        addStringOrListTags(item, out, seen);
      } else if (typeof item === "number" && Number.isFinite(item)) {
        pushTag(out, seen, String(item));
      }
    }
    return;
  }
  if (typeof value === "string") {
    addStringOrListTags(value, out, seen);
  }
}

function addFromInlineTags(meta: CachedMetadata, out: string[], seen: Set<string>): void {
  if (!Array.isArray(meta.tags)) {
    return;
  }
  for (const entry of meta.tags) {
    if (entry?.tag && typeof entry.tag === "string") {
      pushTag(out, seen, entry.tag);
    }
  }
}

export function collectTagsFromCachedMetadata(meta: CachedMetadata | null): string[] {
  if (!meta) {
    return [];
  }
  const out: string[] = [];
  const seen = new Set<string>();

  addFromInlineTags(meta, out, seen);

  const fm = meta.frontmatter as Record<string, unknown> | undefined;
  if (!fm) {
    return out;
  }

  for (const key of ["tags", "tag"] as const) {
    if (Object.prototype.hasOwnProperty.call(fm, key)) {
      addFromFrontmatterValue(fm[key], out, seen);
    }
  }

  return out;
}
