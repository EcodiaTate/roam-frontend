// src/lib/utils/format.ts
//
// Shared formatting utilities for distance, duration, and similar display values.
// All inputs use SI units: meters for distance, seconds for duration.

/**
 * Format a distance in meters for display.
 *   < 1 000 m → "800 m"
 *   1–100 km  → "1.2 km"
 *   ≥ 100 km  → "105 km"
 *
 * Null/undefined-safe variant: pass undefined to get " - "
 */
export function formatDistance(meters: number): string {
  if (meters < 0) meters = 0;
  if (meters < 1000) return `${Math.round(meters)} m`;
  const km = meters / 1000;
  if (km < 100) return `${km.toFixed(1)} km`;
  return `${Math.round(km)} km`;
}

export function formatDistanceOrDash(meters?: number | null): string {
  if (!meters) return " - ";
  return formatDistance(meters);
}

/**
 * Format a duration in seconds for display.
 *   < 60s   → "< 1 min"
 *   < 3600s → "12 min"
 *   ≥ 3600s → "1h 30m"  (compact) or "1 hr 30 min" (verbose)
 */
export function formatDuration(seconds: number, compact = true): string {
  if (seconds < 0) seconds = 0;
  if (seconds < 60) return compact ? "< 1 min" : "< 1 min";
  const mins = Math.round(seconds / 60);
  if (mins < 60) return `${mins} min`;
  const hrs = Math.floor(mins / 60);
  const rem = mins % 60;
  if (rem === 0) return compact ? `${hrs}h` : `${hrs} hr`;
  return compact ? `${hrs}h ${rem}m` : `${hrs} hr ${rem} min`;
}

export function formatDurationOrDash(seconds?: number | null): string {
  if (!seconds) return " - ";
  return formatDuration(seconds);
}

/** Round duration to nearest hour for share cards (e.g. "12h", "1h"). */
export function formatDurationHours(seconds: number): string {
  const hrs = Math.round(Math.max(seconds, 0) / 3600);
  return hrs < 1 ? "< 1h" : `${hrs}h`;
}

/**
 * Format a distance already in kilometres for display.
 *   < 1 km  → "800 m"
 *   < 10 km → "1.2 km"
 *   ≥ 10 km → "15 km"
 */
export function formatDistanceKm(km: number): string {
  if (km < 1) return `${Math.round(km * 1000)} m`;
  if (km < 10) return `${km.toFixed(1)} km`;
  return `${Math.round(km)} km`;
}
