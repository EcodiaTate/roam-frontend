// src/lib/places/format.ts
// Shared formatting + utility helpers for place display.
// Used by PlaceDetailSheet, GuideView, PlaceRow, PlaceSearchPanel.

/**
 * Format a distance in km to a human-readable string.
 * < 1 km → meters, < 10 km → 1 decimal, ≥ 10 km → rounded.
 */
export function fmtDist(km: number | null | undefined): string | null {
  if (km == null) return null;
  if (km < 1) return `${Math.round(km * 1000)} m`;
  if (km < 10) return `${km.toFixed(1)} km`;
  return `${Math.round(km)} km`;
}

/**
 * Format a PlaceCategory slug to human-readable text.
 * e.g. "ev_charging" → "ev charging"
 */
export function fmtCat(c: string): string {
  return c.replace(/_/g, " ");
}

/** Format an optional category - convenience wrapper for fmtCat. */
export function fmtCategory(c?: string): string {
  return fmtCat(c ?? "");
}

/** Attempt to normalize a raw URL string to a fully-qualified https URL. */
export function normalizeUrl(raw: string): string | null {
  const s = raw.trim();
  if (!s) return null;
  if (/^https?:\/\//i.test(s)) return s;
  if (/^www\./i.test(s)) return `https://${s}`;
  if (/^[a-z0-9.-]+\.[a-z]{2,}(\/|$)/i.test(s)) return `https://${s}`;
  return null;
}

/** Open a URL in a new tab, silently swallowing any errors. */
export function safeOpen(url: string): void {
  try {
    window.open(url, "_blank", "noopener,noreferrer");
  } catch {}
}

/** Clean a raw phone string to E.164-ish digits (8-15 chars). */
export function cleanPhone(raw: string): string | null {
  const trimmed = raw.trim();
  const keepPlus = trimmed.startsWith("+");
  const digits = trimmed.replace(/[^\d]/g, "");
  if (digits.length < 8 || digits.length > 15) return null;
  return (keepPlus ? "+" : "") + digits;
}
