// src/lib/guide/intentMapper.ts

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
      "bush camp", "bush camping", "dispersed camping",
      "overnight", "sleep rough",
      "station stay", "farm stay", "farmstay",
    ],
    categories: ["camp"],
    weight: 10,
  },
  // Free/cheap camping - specific sub-intents (high weight so they beat generic "camp")
  {
    keywords: [
      "free camping", "free campsite", "free camp ground",
      "cheap camp", "cheap camping", "low cost camp", "budget camp",
      "no fee camp", "cost nothing",
    ],
    categories: ["camp"],
    weight: 11,
  },
  // Rest area overnight - maps to rest_area category
  {
    keywords: [
      "rest area camping", "sleep at rest area", "overnight rest area",
      "rest area overnight", "camp at rest area", "can i sleep at rest area",
    ],
    categories: ["rest_area"],
    weight: 11,
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

  // ── Dump points ───────────────────────────────────────────
  {
    keywords: [
      "dump station", "dump point", "dump site", "dump",
      "black water", "blackwater", "grey water", "greywater",
      "waste dump", "waste station", "chemical toilet",
      "empty toilet", "cassette", "sewer dump",
    ],
    categories: ["dump_point"],
    weight: 10,
  },

  // ── Water ─────────────────────────────────────────────────
  {
    keywords: [
      "drinking water", "potable water", "fill up water", "water tap",
      "tap water", "refill water", "water tank", "bore water",
      "water point", "fresh water", "freshwater", "water station",
    ],
    categories: ["water"],
    weight: 10,
  },
  {
    keywords: ["water"],
    categories: ["water"],
    weight: 8,
  },

  // ── Toilets ───────────────────────────────────────────────
  {
    keywords: [
      "public toilet", "public toilets", "rest room", "restroom",
      "toilet block", "dunny", "loo", "wc", "amenities block",
    ],
    categories: ["toilet"],
    weight: 10,
  },
  {
    keywords: [
      "toilet", "toilets", "bathroom",
    ],
    categories: ["toilet"],
    weight: 9,
  },

  // ── Showers ───────────────────────────────────────────────
  {
    keywords: [
      "shower", "showers", "hot shower", "free shower", "public shower",
      "wash up", "wash off", "beach shower", "truck stop shower",
      "clean up",
    ],
    categories: ["shower"],
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
      "beach", "coast", "coastal", "swim", "swimming",
      "ocean", "seaside", "shore",
    ],
    categories: ["beach", "swimming_hole"],
    weight: 9,
  },
  {
    keywords: [
      "surf", "surfing", "surf break", "surf spot", "waves",
    ],
    categories: ["surf", "beach"],
    weight: 9,
  },
  {
    keywords: [
      "cave", "caves", "cavern", "caverns", "grotto",
      "show cave", "limestone",
    ],
    categories: ["cave"],
    weight: 9,
  },
  {
    keywords: [
      "fish", "fishing", "angling", "boat ramp", "boat launch",
      "ramp", "slipway",
    ],
    categories: ["fishing"],
    weight: 9,
  },
  {
    keywords: [
      "dog park", "dog", "off leash", "off-leash",
    ],
    categories: ["dog_park"],
    weight: 8,
  },
  {
    keywords: [
      "golf", "golf course",
    ],
    categories: ["golf"],
    weight: 8,
  },
  {
    keywords: [
      "cinema", "movie", "movies", "drive-in", "drive in", "film",
    ],
    categories: ["cinema"],
    weight: 8,
  },
  {
    keywords: [
      "library", "libraries", "wifi", "wi-fi",
    ],
    categories: ["library"],
    weight: 7,
  },
  {
    keywords: [
      "showground", "showgrounds", "racecourse", "rodeo",
      "country show",
    ],
    categories: ["showground"],
    weight: 7,
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
    categories: ["fuel", "cafe", "toilet", "shower", "camp", "town"],
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
  /** Compound filters: extra field conditions to apply when filtering places */
  filters?: {
    free?: true;
    has_potable_water_at_dump?: true;
    dump_access?: "public";
    shower_type?: "hot";
    water_type?: "potable";
  };
  /** Camp-specific attribute filters - only applied when categories includes "camp" or "rest_area" */
  campFilters?: {
    pets?: true;
    free?: true;
    powered?: true;
    showers?: true;
    dump_point?: true;
    caravans?: true;
    phone_reception?: true;
    bbq?: true;
    wifi?: true;
    fires?: true;
    has_toilets?: true;
    has_water?: true;
    /** Filter by specific camp sub-type */
    camp_type?: "free" | "low_cost" | "bush" | "station_stay" | "showground";
    /** Only show places where overnight stays are permitted */
    overnight_allowed?: true;
  };
};

/**
 * Extract intent from user text. Returns matched categories and metadata.
 * Uses substring matching - fast and good enough for mobile input.
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

  // Compound intent filters
  const filters: ExtractedIntent["filters"] = {};
  if (lower.includes("free dump") || lower.includes("free dump station") || lower.includes("no charge dump")) {
    filters.free = true;
  }
  if (lower.includes("potable") || lower.includes("drinking water at dump") || lower.includes("water at dump")) {
    filters.has_potable_water_at_dump = true;
  }
  if (lower.includes("free dump") || lower.includes("public dump")) {
    filters.dump_access = "public";
  }
  if (lower.includes("hot shower") || lower.includes("warm shower")) {
    filters.shower_type = "hot";
  }
  if (lower.includes("potable water") || lower.includes("drinking water")) {
    filters.water_type = "potable";
  }

  // Camp-specific attribute filters
  const campFilters: NonNullable<ExtractedIntent["campFilters"]> = {};

  if (lower.match(/\bdog[- ]?friendly\b/) || lower.match(/\bpets?\s+allowed\b/) || lower.match(/\bdog[s]?\s+(ok|welcome|allowed)\b/)) {
    campFilters.pets = true;
  }
  if (lower.match(/\bfree\s+camp/) || lower.match(/\bfreecamp/) || lower.match(/\bno[- ]?fee\b/) || lower.match(/\bno[- ]?cost\b/)) {
    campFilters.free = true;
    campFilters.camp_type = "free";
  }
  if (lower.match(/\b(cheap|budget|low[- ]?cost)\s+(camp|camping)/) || lower.match(/\bunder\s+\$\d+\s*(a\s*)?night\b/)) {
    campFilters.camp_type = campFilters.camp_type ?? "low_cost";
  }
  if (lower.match(/\bbush\s+camp/) || lower.match(/\bdispersed\s+camp/) || lower.match(/\bbush\s+camping\b/)) {
    campFilters.camp_type = "bush";
  }
  if (lower.match(/\bstation\s+stay\b/) || lower.match(/\bstation\s+camp\b/)) {
    campFilters.camp_type = "station_stay";
  }
  if (lower.match(/\bshowground[s]?\b/) && (lower.includes("camp") || lower.includes("stay") || lower.includes("overnight"))) {
    campFilters.camp_type = "showground";
  }
  if (lower.match(/\bovernight\s+(rest\s+area|at\s+rest)/) || lower.match(/\brest\s+area\s+(camp|overnight|sleep)/)) {
    campFilters.overnight_allowed = true;
  }
  // Legal camping query - show only overnight-permitted places
  if (lower.match(/\bcan\s+i\s+camp\b/) || lower.match(/\blegal\s+camp/) || lower.match(/\bis\s+it\s+legal\s+to\s+camp/)) {
    campFilters.overnight_allowed = true;
  }
  if (lower.match(/\bpowered\s+(site|sites|up)/) || lower.match(/\b(power|electricity|electric)\s+(hook.?up|connection|plug)\b/)) {
    campFilters.powered = true;
  }
  if (lower.match(/\bwith\s+shower/) || lower.match(/\bhas\s+shower/) || lower.match(/\bshowers?\s+(available|on.?site)\b/)) {
    campFilters.showers = true;
  }
  if (lower.match(/\bdump\s*point/) || lower.match(/\bdump\s*station/) || lower.match(/\bsanitary\s*dump\b/)) {
    campFilters.dump_point = true;
  }
  if (lower.match(/\bcaravan[s]?\b/) || lower.match(/\bvan[- ]?friendly\b/) || lower.match(/\brig\b/)) {
    campFilters.caravans = true;
  }
  if (lower.match(/\btelstra\b/) || lower.match(/\bcoverage\b/) || lower.match(/\bphone\s+(signal|reception|service)\b/) || lower.match(/\bcoverage\b/)) {
    campFilters.phone_reception = true;
  }
  if (lower.match(/\bbbq\b/) || lower.match(/\bbarbe?que?\b/)) {
    campFilters.bbq = true;
  }
  if (lower.match(/\bwifi\b/) || lower.match(/\bwi-?fi\b/) || lower.match(/\binternet\b/)) {
    campFilters.wifi = true;
  }
  if (lower.match(/\bfire[s]?\s+(allowed|ok|permitted)\b/) || lower.match(/\bcampfire[s]?\b/)) {
    campFilters.fires = true;
  }
  // Compound: free camp with specific facilities
  if (lower.match(/\bfree\s+camp.*(with\s+toilet|has\s+toilet)/) || lower.match(/\b(with\s+toilet).*(free\s+camp)/)) {
    campFilters.free = true;
    campFilters.has_toilets = true;
  }
  if (lower.match(/\bfree\s+camp.*(with\s+water|has\s+water)/) || lower.match(/\b(with\s+water).*(free\s+camp)/)) {
    campFilters.free = true;
    campFilters.has_water = true;
  }
  if (lower.match(/\bdog[- ]?friendly\s+free\s+camp/) || lower.match(/\bfree\s+camp.*dog[- ]?friendly/)) {
    campFilters.free = true;
    campFilters.pets = true;
  }

  // If camp filters matched, ensure "camp" is in categories
  if (Object.keys(campFilters).length > 0 && !catSet.has("camp")) {
    catSet.add("camp");
  }

  return {
    categories: Array.from(catSet),
    confidence: sorted.length > 0 ? sorted[0].weight : 0,
    proximityQuery,
    maxDistanceKm,
    filters: Object.keys(filters).length > 0 ? filters : undefined,
    campFilters: Object.keys(campFilters).length > 0 ? campFilters : undefined,
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
  // ── Free camping fields (populated for camp + rest_area) ──
  camp_type?: string;
  free?: boolean;
  price_per_night_aud?: number;
  overnight_allowed?: boolean | "check" | "prohibited";
  overnight_max_hours?: number;
  overnight_notes?: string;
  has_toilets?: boolean;
  has_water?: boolean;
  has_showers?: boolean;
  has_bbq?: boolean;
  pets_allowed?: boolean | "on_lead";
  fires_allowed?: boolean | "seasonal";
  max_stay_days?: number;
};

function extractLocality(p: PlaceItem): string | null {
  const ex: Record<string, unknown> = p.extra ?? {};
  const tags: Record<string, unknown> = (ex?.tags && typeof ex.tags === "object") ? ex.tags as Record<string, unknown> : ex;
  return (tags?.["addr:suburb"] as string) || (tags?.["addr:city"] as string) || (tags?.["addr:town"] as string) || null;
}

function extractHours(p: PlaceItem): string | null {
  const ex: Record<string, unknown> = p.extra ?? {};
  const tags: Record<string, unknown> = (ex?.tags && typeof ex.tags === "object") ? ex.tags as Record<string, unknown> : ex;
  return (tags?.opening_hours as string) || null;
}

function extractPhone(p: PlaceItem): string | null {
  const ex: Record<string, unknown> = p.extra ?? {};
  const tags: Record<string, unknown> = (ex?.tags && typeof ex.tags === "object") ? ex.tags as Record<string, unknown> : ex;
  return (tags?.phone as string) || null;
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
    // No specific intent - return a diverse sample
    filtered = items;
  }

  // Step 1b: Compound attribute filters (best-effort - places missing the field still pass)
  if (intent.filters && Object.keys(intent.filters).length > 0) {
    const f = intent.filters;
    filtered = filtered.filter((p) => {
      const ex = (p.extra ?? {}) as Record<string, unknown>;
      if (f.free && ex.free !== true) return false;
      if (f.has_potable_water_at_dump && ex.has_potable_water_at_dump !== true) return false;
      if (f.dump_access && ex.dump_access !== f.dump_access) return false;
      if (f.shower_type && ex.shower_type !== f.shower_type) return false;
      if (f.water_type && ex.water_type !== f.water_type) return false;
      return true;
    });
    // If the filter wiped everything, fall back to unfiltered category results
    if (filtered.length === 0) {
      if (intent.categories.length > 0) {
        const catSet = new Set(intent.categories);
        filtered = items.filter((p) => catSet.has(p.category));
      } else {
        filtered = items;
      }
    }
  }

  // Step 1c: Camp-specific attribute filters
  if (intent.campFilters && Object.keys(intent.campFilters).length > 0) {
    const cf = intent.campFilters;
    const campFiltered = filtered.filter((p) => {
      if (p.category !== "camp") return true; // only apply to camps
      const ex = (p.extra ?? {}) as Record<string, unknown>;
      if (cf.pets && !ex.pets_allowed) return false;
      if (cf.free && ex.free !== true && ex.camp_type !== "free") return false;
      if (cf.powered && ex.powered_sites !== true) return false;
      if (cf.showers && ex.has_showers !== true) return false;
      if (cf.dump_point && ex.has_dump_point !== true) return false;
      if (cf.caravans && ex.caravans !== true) return false;
      if (cf.phone_reception && ex.has_phone_reception !== true) return false;
      if (cf.bbq && ex.has_bbq !== true) return false;
      if (cf.wifi && ex.has_wifi !== true) return false;
      if (cf.fires && !ex.fires_allowed) return false;
      if (cf.has_toilets && ex.has_toilets !== true) return false;
      if (cf.has_water && ex.has_water !== true) return false;
      if (cf.camp_type) {
        // "free" filter accepts both "free" and "bush" camp types
        const acceptedTypes = cf.camp_type === "free"
          ? ["free", "bush"]
          : [cf.camp_type];
        if (ex.camp_type && !acceptedTypes.includes(ex.camp_type as string)) return false;
      }
      if (cf.overnight_allowed && ex.overnight_allowed !== true) return false;
      return true;
    });
    // If filters wiped all camps, keep unfiltered so user gets some results
    if (campFiltered.length > 0) {
      filtered = campFiltered;
    }
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

    const ex = (p.extra ?? {}) as Record<string, unknown>;
    const isCampLike = p.category === "camp" || p.category === "rest_area";

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
      // Include free camping fields for camp/rest_area categories
      ...(isCampLike && {
        camp_type: ex.camp_type as string | undefined,
        free: ex.free as boolean | undefined,
        price_per_night_aud: ex.price_per_night_aud as number | undefined,
        overnight_allowed: ex.overnight_allowed as boolean | "check" | "prohibited" | undefined,
        overnight_max_hours: ex.overnight_max_hours as number | undefined,
        overnight_notes: ex.overnight_notes as string | undefined,
        has_toilets: ex.has_toilets as boolean | undefined,
        has_water: ex.has_water as boolean | undefined,
        has_showers: ex.has_showers as boolean | undefined,
        has_bbq: ex.has_bbq as boolean | undefined,
        pets_allowed: ex.pets_allowed as boolean | "on_lead" | undefined,
        fires_allowed: ex.fires_allowed as boolean | "seasonal" | undefined,
        max_stay_days: ex.max_stay_days as number | undefined,
      }),
    };
  });

  // Step 3: Distance filter (if user specified "within X km")
  let candidates = ranked;
  if (intent.maxDistanceKm != null && progress) {
    candidates = candidates.filter(
      (p) => p.dist_km != null && p.dist_km <= intent.maxDistanceKm!,
    );
  }

  // Step 4: Sort - ahead first, then by distance
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
