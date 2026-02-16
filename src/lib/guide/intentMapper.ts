// src/lib/guide/intentMapper.ts
"use client";

import type { PlaceCategory } from "@/lib/types/places";
import type { PlaceItem } from "@/lib/types/places";
import type { TripProgress } from "@/lib/types/guide";
import { haversineKm } from "@/lib/guide/tripProgress";

// ──────────────────────────────────────────────────────────────
// Keyword → Category mapping
//
// Each entry: array of keywords/phrases that map to one or more
// PlaceCategory values. Keywords are lowercase, matched as substrings.
// More specific phrases should come first for priority matching.
// ──────────────────────────────────────────────────────────────

type CategoryRule = {
  keywords: string[];
  categories: PlaceCategory[];
  /** Higher = more likely the user explicitly wants this */
  weight: number;
};

const RULES: CategoryRule[] = [
  // ── Fuel ──────────────────────────────────────────────────
  {
    keywords: [
      "fuel", "petrol", "diesel", "lpg", "gas station", "gas stop",
      "servo", "service station", "service stn", "refuel", "fill up",
      "unleaded", "e10", "98", "95", "bp", "shell", "caltex", "ampol",
      "united", "puma", "liberty",
    ],
    categories: ["fuel"],
    weight: 10,
  },

  // ── Camping & accommodation ──────────────────────────────
  {
    keywords: [
      "camp", "camping", "campsite", "camp site", "campground",
      "caravan", "caravan park", "rv park", "motorhome", "camper",
      "glamping", "tent", "swag", "free camp", "freecamp",
      "bush camp", "rest area", "overnight", "sleep rough",
    ],
    categories: ["camp"],
    weight: 10,
  },
  {
    keywords: [
      "hotel", "motel", "accommodation", "accomodation", "stay",
      "sleep", "lodge", "inn", "bnb", "b&b", "airbnb",
      "room", "cabin", "chalet",
    ],
    categories: ["hotel", "motel", "hostel"],
    weight: 9,
  },
  {
    keywords: ["hostel", "backpacker", "backpackers", "dorm"],
    categories: ["hostel"],
    weight: 9,
  },

  // ── Water ─────────────────────────────────────────────────
  {
    keywords: [
      "water", "drinking water", "tap water", "refill water",
      "water tank", "bore water", "potable",
    ],
    categories: ["water"],
    weight: 10,
  },

  // ── Toilets ───────────────────────────────────────────────
  {
    keywords: [
      "toilet", "toilets", "bathroom", "restroom", "rest room",
      "loo", "dunny", "wc", "amenities", "public toilet",
    ],
    categories: ["toilet"],
    weight: 10,
  },

  // ── Food & drink ──────────────────────────────────────────
  {
    keywords: [
      "coffee", "cafe", "café", "espresso", "latte", "barista",
    ],
    categories: ["cafe"],
    weight: 9,
  },
  {
    keywords: [
      "restaurant", "dining", "fine dining", "bistro",
    ],
    categories: ["restaurant"],
    weight: 9,
  },
  {
    keywords: [
      "fast food", "takeaway", "take away", "drive through",
      "drive thru", "maccas", "mcdonalds", "kfc", "hungry jacks",
      "subway", "nandos", "dominos", "pizza",
    ],
    categories: ["fast_food"],
    weight: 9,
  },
  {
    keywords: [
      "food", "eat", "eating", "lunch", "dinner", "breakfast",
      "brunch", "meal", "hungry", "snack", "bakery", "pie",
    ],
    categories: ["cafe", "restaurant", "fast_food"],
    weight: 8,
  },
  {
    keywords: [
      "pub", "beer", "ale", "brewery", "tap house",
    ],
    categories: ["pub"],
    weight: 8,
  },
  {
    keywords: [
      "bar", "cocktail", "wine bar", "drinks", "drink",
    ],
    categories: ["bar", "pub"],
    weight: 8,
  },

  // ── Grocery ───────────────────────────────────────────────
  {
    keywords: [
      "grocery", "groceries", "supermarket", "woolworths", "woolies",
      "coles", "iga", "aldi", "foodworks", "spar", "shops",
      "supplies", "provisions", "food shop",
    ],
    categories: ["grocery"],
    weight: 10,
  },

  // ── Medical ───────────────────────────────────────────────
  {
    keywords: [
      "hospital", "emergency", "er", "a&e", "medical", "doctor",
      "health", "clinic", "urgent care",
    ],
    categories: ["hospital"],
    weight: 10,
  },
  {
    keywords: [
      "pharmacy", "chemist", "drugstore", "medication", "medicine",
      "scripts", "prescription",
    ],
    categories: ["pharmacy"],
    weight: 10,
  },

  // ── Mechanical ────────────────────────────────────────────
  {
    keywords: [
      "mechanic", "garage", "repair", "tyre", "tire", "breakdown",
      "auto repair", "car repair", "workshop", "radiator",
      "battery", "alternator", "oil change",
    ],
    categories: ["mechanic"],
    weight: 10,
  },

  // ── Nature & scenic ───────────────────────────────────────
  {
    keywords: [
      "view", "viewpoint", "lookout", "look out", "scenic",
      "panorama", "vista", "overlook", "scenery",
    ],
    categories: ["viewpoint"],
    weight: 9,
  },
  {
    keywords: [
      "park", "national park", "nature", "hiking", "hike",
      "walk", "walking track", "trail", "bushwalk", "bush walk",
      "reserve", "conservation",
    ],
    categories: ["park"],
    weight: 8,
  },
  {
    keywords: [
      "beach", "surf", "coast", "coastal", "swim", "swimming",
      "ocean", "seaside", "shore",
    ],
    categories: ["beach"],
    weight: 9,
  },
  {
    keywords: [
      "attraction", "tourist", "museum", "gallery", "heritage",
      "monument", "landmark", "historical", "historic",
      "things to do", "see", "sightseeing", "sight seeing",
      "interesting", "worth seeing", "must see",
    ],
    categories: ["attraction", "viewpoint", "park"],
    weight: 7,
  },

  // ── Towns ─────────────────────────────────────────────────
  {
    keywords: [
      "town", "towns", "city", "settlement", "village",
      "next town", "nearest town", "closest town",
    ],
    categories: ["town"],
    weight: 9,
  },

  // ── Broad / "anything" queries ────────────────────────────
  {
    keywords: [
      "stop", "stops", "break", "rest", "pull over",
      "stretch", "stretch legs",
    ],
    categories: ["fuel", "cafe", "toilet", "camp", "town"],
    weight: 5,
  },
  {
    keywords: [
      "anything", "whatever", "what's around", "what's nearby",
      "what's ahead", "options", "suggestions", "suggest",
      "recommend", "what do you suggest", "ideas",
    ],
    categories: ["fuel", "cafe", "restaurant", "camp", "viewpoint", "town", "grocery"],
    weight: 3,
  },
];

// ──────────────────────────────────────────────────────────────
// Intent extraction
// ──────────────────────────────────────────────────────────────

export type ExtractedIntent = {
  /** Matched categories, deduplicated, ordered by weight */
  categories: PlaceCategory[];
  /** Highest weight match (0 if nothing matched) */
  confidence: number;
  /** Whether the user seems to be asking about proximity/distance */
  proximityQuery: boolean;
  /** Rough max distance in km if the user specified one (null otherwise) */
  maxDistanceKm: number | null;
};

/**
 * Extract intent from user text. Returns matched categories and metadata.
 * Uses substring matching — fast and good enough for mobile input.
 */
export function extractIntent(text: string): ExtractedIntent {
  const lower = text.toLowerCase().trim();

  const matched: { categories: PlaceCategory[]; weight: number }[] = [];

  for (const rule of RULES) {
    for (const kw of rule.keywords) {
      if (lower.includes(kw)) {
        matched.push({ categories: rule.categories, weight: rule.weight });
        break; // one match per rule is enough
      }
    }
  }

  // Deduplicate categories, keeping order by weight
  const catSet = new Set<PlaceCategory>();
  const sorted = [...matched].sort((a, b) => b.weight - a.weight);
  for (const m of sorted) {
    for (const c of m.categories) catSet.add(c);
  }

  // Proximity detection
  const proximityWords = [
    "near", "nearby", "nearest", "closest", "close",
    "next", "ahead", "coming up", "within", "around",
    "how far", "distance",
  ];
  const proximityQuery = proximityWords.some((w) => lower.includes(w));

  // Distance extraction: "within 50km", "next 100km", "80 km"
  let maxDistanceKm: number | null = null;
  const distMatch = lower.match(/(\d+)\s*(?:km|kilometer|kilometre|k)\b/i);
  if (distMatch) {
    maxDistanceKm = parseInt(distMatch[1], 10);
    if (maxDistanceKm > 2000) maxDistanceKm = null; // sanity check
  }

  return {
    categories: Array.from(catSet),
    confidence: sorted.length > 0 ? sorted[0].weight : 0,
    proximityQuery,
    maxDistanceKm,
  };
}

// ──────────────────────────────────────────────────────────────
// Place filtering & ranking
// ──────────────────────────────────────────────────────────────

/** A place with computed relevance metadata for the LLM */
export type RankedPlace = {
  id: string;
  name: string;
  lat: number;
  lng: number;
  category: PlaceCategory;
  /** Distance from user in km (null if no GPS) */
  dist_km: number | null;
  /** Estimated km along route from start (null if can't compute) */
  route_km: number | null;
  /** Is this place ahead of the user on the route? */
  ahead: boolean;
  /** Suburb / locality if available */
  locality: string | null;
  /** Opening hours if available */
  hours: string | null;
  /** Phone if available */
  phone: string | null;
};

function extractLocality(p: PlaceItem): string | null {
  const ex: any = p.extra ?? {};
  const tags = (ex?.tags && typeof ex.tags === "object") ? ex.tags : ex;
  return tags?.["addr:suburb"] || tags?.["addr:city"] || tags?.["addr:town"] || null;
}

function extractHours(p: PlaceItem): string | null {
  const ex: any = p.extra ?? {};
  const tags = (ex?.tags && typeof ex.tags === "object") ? ex.tags : ex;
  return tags?.opening_hours || null;
}

function extractPhone(p: PlaceItem): string | null {
  const ex: any = p.extra ?? {};
  const tags = (ex?.tags && typeof ex.tags === "object") ? ex.tags : ex;
  return tags?.phone || null;
}

/**
 * Filter, rank, and trim places for LLM injection.
 *
 * @param items - Full corridor places (up to 8000)
 * @param intent - Extracted intent from user message
 * @param progress - Current trip progress (for ahead-only filtering + distance)
 * @param maxResults - Cap on returned places (default 40)
 */
export function filterAndRankPlaces(
  items: PlaceItem[],
  intent: ExtractedIntent,
  progress: TripProgress | null,
  maxResults: number = 40,
): RankedPlace[] {
  // Step 1: Category filter
  let filtered: PlaceItem[];
  if (intent.categories.length > 0) {
    const catSet = new Set(intent.categories);
    filtered = items.filter((p) => catSet.has(p.category));
  } else {
    // No specific intent — return a diverse sample
    filtered = items;
  }

  // Step 2: Compute distance + ahead status
  const ranked: RankedPlace[] = filtered.map((p) => {
    let dist_km: number | null = null;
    let ahead = true; // default assume ahead if no progress

    if (progress) {
      dist_km = Math.round(
        haversineKm(progress.user_lat, progress.user_lng, p.lat, p.lng) * 10,
      ) / 10;

      // Simple ahead heuristic: if the place is roughly in the direction of travel
      // For now, use a simpler approach: places within 10km behind are OK,
      // but places clearly behind (using route leg comparison) are deprioritized.
      // Since we don't have per-place route_km, we use a bearing-based heuristic:
      // if user has heading, places behind bearing ±120° are "behind"
      if (progress.user_heading != null && dist_km > 5) {
        const bearing = bearingDeg(
          progress.user_lat, progress.user_lng,
          p.lat, p.lng,
        );
        const diff = Math.abs(angleDiff(progress.user_heading, bearing));
        if (diff > 120) {
          ahead = false;
        }
      }
    }

    return {
      id: p.id,
      name: p.name,
      lat: p.lat,
      lng: p.lng,
      category: p.category,
      dist_km,
      route_km: null, // we don't have this without per-place projection
      ahead,
      locality: extractLocality(p),
      hours: extractHours(p),
      phone: extractPhone(p),
    };
  });

  // Step 3: Distance filter (if user specified "within X km")
  let candidates = ranked;
  if (intent.maxDistanceKm != null && progress) {
    candidates = candidates.filter(
      (p) => p.dist_km != null && p.dist_km <= intent.maxDistanceKm!,
    );
  }

  // Step 4: Sort — ahead first, then by distance
  candidates.sort((a, b) => {
    // Ahead places first
    if (a.ahead && !b.ahead) return -1;
    if (!a.ahead && b.ahead) return 1;
    // Then by distance (nearest first)
    const da = a.dist_km ?? 9999;
    const db = b.dist_km ?? 9999;
    return da - db;
  });

  // Step 5: If no specific categories matched and we have too many, diversify
  if (intent.categories.length === 0 && candidates.length > maxResults) {
    return diverseSample(candidates, maxResults);
  }

  return candidates.slice(0, maxResults);
}

/**
 * When no specific category is requested, return a diverse sample
 * covering multiple categories rather than all being the same type.
 */
function diverseSample(places: RankedPlace[], limit: number): RankedPlace[] {
  const buckets = new Map<string, RankedPlace[]>();
  for (const p of places) {
    const cat = p.category;
    if (!buckets.has(cat)) buckets.set(cat, []);
    buckets.get(cat)!.push(p);
  }

  const result: RankedPlace[] = [];
  const catKeys = Array.from(buckets.keys());

  // Round-robin through categories, taking nearest first from each
  let round = 0;
  while (result.length < limit && round < 20) {
    for (const cat of catKeys) {
      const bucket = buckets.get(cat)!;
      if (round < bucket.length) {
        result.push(bucket[round]);
        if (result.length >= limit) break;
      }
    }
    round++;
  }

  return result;
}

// ──────────────────────────────────────────────────────────────
// Geo helpers
// ──────────────────────────────────────────────────────────────

const DEG2RAD = Math.PI / 180;
const RAD2DEG = 180 / Math.PI;

function bearingDeg(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const dLng = (lng2 - lng1) * DEG2RAD;
  const y = Math.sin(dLng) * Math.cos(lat2 * DEG2RAD);
  const x =
    Math.cos(lat1 * DEG2RAD) * Math.sin(lat2 * DEG2RAD) -
    Math.sin(lat1 * DEG2RAD) * Math.cos(lat2 * DEG2RAD) * Math.cos(dLng);
  return ((Math.atan2(y, x) * RAD2DEG) + 360) % 360;
}

function angleDiff(a: number, b: number): number {
  let d = b - a;
  while (d > 180) d -= 360;
  while (d < -180) d += 360;
  return d;
}