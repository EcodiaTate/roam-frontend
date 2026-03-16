// src/lib/places/offlineSearch.ts
// Offline-first place search engine.
// Filters up to 8,000 PlaceItem objects in <50ms using simple array ops.

"use client";

import type { PlaceCategory, PlaceItem } from "@/lib/types/places";
import { haversineKm } from "@/lib/nav/snapToRoute";

// ──────────────────────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────────────────────

export type PlaceFilter = {
  query?: string;
  categories?: PlaceCategory[];
  maxDistanceKm?: number;
  aheadOnly?: boolean;
  openNow?: boolean;
  free?: boolean;
  /** Extra attribute predicates e.g. { has_showers: true } */
  attributes?: Record<string, unknown>;
};

export type SearchResult = {
  place: PlaceItem;
  distKm: number | null;
  ahead: boolean | null;
};

export type UserPosition = {
  lat: number;
  lng: number;
  heading?: number | null;
};

// ──────────────────────────────────────────────────────────────
// Geo helpers (inline — no import needed)
// ──────────────────────────────────────────────────────────────

// haversineKm imported from @/lib/nav/snapToRoute

const DEG2RAD = Math.PI / 180;

function bearingDeg(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const dLng = (lng2 - lng1) * DEG2RAD;
  const y = Math.sin(dLng) * Math.cos(lat2 * DEG2RAD);
  const x =
    Math.cos(lat1 * DEG2RAD) * Math.sin(lat2 * DEG2RAD) -
    Math.sin(lat1 * DEG2RAD) * Math.cos(lat2 * DEG2RAD) * Math.cos(dLng);
  return ((Math.atan2(y, x) * (180 / Math.PI)) + 360) % 360;
}

function angleDiff(a: number, b: number): number {
  let d = b - a;
  while (d > 180) d -= 360;
  while (d < -180) d += 360;
  return d;
}

// ──────────────────────────────────────────────────────────────
// Opening hours parser — offline, no deps
// Handles the common OSM "Mo-Fr 09:00-17:00; Sa 09:00-12:00" format.
// Returns true if open, false if closed, null if unparseable.
// ──────────────────────────────────────────────────────────────

const DAY_MAP: Record<string, number> = {
  mo: 0, tu: 1, we: 2, th: 3, fr: 4, sa: 5, su: 6,
};

function parseHHMM(s: string): number | null {
  const [hStr, mStr] = s.trim().split(":");
  const h = parseInt(hStr ?? "", 10);
  const m = parseInt(mStr ?? "0", 10);
  if (isNaN(h) || isNaN(m)) return null;
  return h * 60 + m;
}

export function isOpenNow(openingHours: string | null | undefined, now?: Date): boolean | null {
  if (!openingHours) return null;
  const oh = openingHours.trim().toLowerCase();
  if (oh === "24/7" || oh === "24 hours" || oh === "always") return true;

  const d = now ?? new Date();
  const dayOfWeek = (d.getDay() + 6) % 7; // 0=Mon…6=Sun
  const minuteOfDay = d.getHours() * 60 + d.getMinutes();

  // Split into rules separated by ";"
  const rules = oh.split(";").map((r) => r.trim()).filter(Boolean);

  for (const rule of rules) {
    // Match: "Mo-Fr 09:00-17:00" or "Mo 08:00-12:00" or "09:00-17:00" (every day)
    const m = rule.match(/^([a-z]{2}(?:[,-][a-z]{2})*\s+)?(\d{1,2}:\d{2})-(\d{1,2}:\d{2})(?:\s+off)?$/);
    if (!m) continue;

    const dayPart = m[1]?.trim();
    const openMin = parseHHMM(m[2] ?? "");
    const closeMin = parseHHMM(m[3] ?? "");
    if (openMin === null || closeMin === null) continue;

    // Check day applicability
    let dayMatch = true;
    if (dayPart) {
      dayMatch = false;
      // e.g. "mo-fr" or "mo,we,fr" or "sa"
      const segments = dayPart.split(",");
      for (const seg of segments) {
        const range = seg.trim().split("-");
        if (range.length === 2) {
          const from = DAY_MAP[range[0]?.trim() ?? ""];
          const to = DAY_MAP[range[1]?.trim() ?? ""];
          if (from !== undefined && to !== undefined) {
            if (from <= to ? (dayOfWeek >= from && dayOfWeek <= to) : (dayOfWeek >= from || dayOfWeek <= to)) {
              dayMatch = true;
              break;
            }
          }
        } else {
          const day = DAY_MAP[seg.trim()];
          if (day === dayOfWeek) { dayMatch = true; break; }
        }
      }
    }

    if (!dayMatch) continue;

    // Check time (handle overnight spans e.g. 22:00-02:00)
    const isOff = rule.includes(" off");
    if (isOff) return false;
    if (openMin <= closeMin) {
      if (minuteOfDay >= openMin && minuteOfDay < closeMin) return true;
    } else {
      // Overnight
      if (minuteOfDay >= openMin || minuteOfDay < closeMin) return true;
    }
  }

  return false;
}

// ──────────────────────────────────────────────────────────────
// Text search helper — searches name, brand, operator, description
// ──────────────────────────────────────────────────────────────

function matchesQuery(place: PlaceItem, queryLower: string): boolean {
  if (!queryLower) return true;
  const extra = place.extra ?? {};
  const fields = [
    place.name,
    place.category,
    (extra.brand as string | undefined) ?? "",
    (extra.operator as string | undefined) ?? "",
    (extra.description as string | undefined) ?? "",
    (extra.address as string | undefined) ?? "",
  ];
  for (const f of fields) {
    if (f && f.toLowerCase().includes(queryLower)) return true;
  }
  return false;
}

// ──────────────────────────────────────────────────────────────
// Attribute filter
// Checks the place.extra bag against a Record<string, unknown>.
// Only truthy attribute values are tested.
// ──────────────────────────────────────────────────────────────

function matchesAttributes(place: PlaceItem, attrs: Record<string, unknown>): boolean {
  const extra: Record<string, unknown> = (place.extra ?? {}) as Record<string, unknown>;
  for (const [key, val] of Object.entries(attrs)) {
    if (val === null || val === undefined || val === false) continue;
    if (extra[key] !== val) return false;
  }
  return true;
}

// ──────────────────────────────────────────────────────────────
// Main search function
// ──────────────────────────────────────────────────────────────

/**
 * Filter and rank places offline.
 * All operations are synchronous array filters — no indexing overhead.
 * Filtering 8,000 places typically takes <20ms.
 */
export function searchPlaces(
  places: PlaceItem[],
  filter: PlaceFilter,
  userPosition: UserPosition | null,
  /** polyline6 route — reserved for future ahead-on-route calculation */
  _routeGeometry?: string,
): SearchResult[] {
  const queryLower = (filter.query ?? "").trim().toLowerCase();
  const catSet = filter.categories && filter.categories.length > 0
    ? new Set(filter.categories)
    : null;

  // Single pass: compute distance + ahead while filtering
  const results: SearchResult[] = [];

  for (const place of places) {
    // ── Category filter ──────────────────────────────────────
    if (catSet && !catSet.has(place.category)) continue;

    // ── Text search ──────────────────────────────────────────
    if (queryLower && !matchesQuery(place, queryLower)) continue;

    // ── Free toggle ──────────────────────────────────────────
    if (filter.free) {
      const extra = place.extra ?? {};
      const isFree =
        extra.free === true ||
        extra.camp_type === "free" ||
        extra.fee === "no" ||
        extra.fee === "0" ||
        extra.fee === "free";
      if (!isFree) continue;
    }

    // ── Wheelchair/accessible ────────────────────────────────
    if (filter.attributes?.wheelchair === "yes") {
      const wc = (place.extra ?? {}).wheelchair;
      if (wc !== "yes") continue;
    }

    // ── Attribute filter ─────────────────────────────────────
    if (filter.attributes && Object.keys(filter.attributes).length > 0) {
      const attrsWithoutWheelchair = { ...filter.attributes };
      delete attrsWithoutWheelchair.wheelchair; // already handled above
      if (!matchesAttributes(place, attrsWithoutWheelchair)) continue;
    }

    // ── Opening hours ────────────────────────────────────────
    if (filter.openNow) {
      const extra = place.extra ?? {};
      const oh = extra.opening_hours as string | undefined;
      const open = isOpenNow(oh);
      // Only exclude if we KNOW it's closed (null = unknown, keep it)
      if (open === false) continue;
    }

    // ── Geo: distance + ahead ────────────────────────────────
    let distKm: number | null = null;
    let ahead: boolean | null = null;

    if (userPosition) {
      distKm = Math.round(
        haversineKm(userPosition.lat, userPosition.lng, place.lat, place.lng) * 10,
      ) / 10;

      if (userPosition.heading != null && distKm > 2) {
        const bearing = bearingDeg(userPosition.lat, userPosition.lng, place.lat, place.lng);
        const diff = Math.abs(angleDiff(userPosition.heading, bearing));
        ahead = diff <= 120;
      } else {
        ahead = true; // assume ahead when no heading
      }

      // ── Distance filter ──────────────────────────────────
      if (filter.maxDistanceKm != null && distKm > filter.maxDistanceKm) continue;

      // ── Ahead only ───────────────────────────────────────
      if (filter.aheadOnly && ahead === false) continue;
    }

    results.push({ place, distKm, ahead });
  }

  // ── Sort: distance asc (nulls last), then ahead first ───────
  results.sort((a, b) => {
    // Ahead first when both have heading data
    if (a.ahead !== null && b.ahead !== null && a.ahead !== b.ahead) {
      return a.ahead ? -1 : 1;
    }
    const da = a.distKm ?? 999999;
    const db = b.distKm ?? 999999;
    return da - db;
  });

  return results;
}

// ──────────────────────────────────────────────────────────────
// Count places per category (for chip badges)
// ──────────────────────────────────────────────────────────────

export function countByCategory(places: PlaceItem[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const p of places) {
    counts[p.category] = (counts[p.category] ?? 0) + 1;
  }
  return counts;
}

// ──────────────────────────────────────────────────────────────
// Count matching places per category (for live chip badges)
// Applies text search and attribute filters, ignores geo/distance
// so chips update as the user types.
// ──────────────────────────────────────────────────────────────

export function countByCategoryFiltered(
  places: PlaceItem[],
  filter: Omit<PlaceFilter, "categories" | "maxDistanceKm" | "aheadOnly">,
): Record<string, number> {
  const queryLower = (filter.query ?? "").trim().toLowerCase();
  const counts: Record<string, number> = {};

  for (const p of places) {
    if (queryLower && !matchesQuery(p, queryLower)) continue;
    if (filter.free) {
      const extra = p.extra ?? {};
      const isFree =
        extra.free === true || extra.camp_type === "free" ||
        extra.fee === "no" || extra.fee === "0" || extra.fee === "free";
      if (!isFree) continue;
    }
    counts[p.category] = (counts[p.category] ?? 0) + 1;
  }
  return counts;
}
