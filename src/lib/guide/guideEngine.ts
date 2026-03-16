// src/lib/guide/guideEngine.ts
"use client";

import type { TripStop } from "@/lib/types/trip";
import type { NavPack, CorridorGraphPack, TrafficOverlay, HazardOverlay } from "@/lib/types/navigation";
import type {
  WeatherOverlay,
  FloodOverlay,
  CoverageOverlay,
  WildlifeOverlay,
  RestAreaOverlay,
  RouteIntelligenceScore,
  FuelOverlay,
} from "@/lib/types/overlays";
import type { PlacesPack, PlacesSuggestResponse, PlaceItem, PlaceCategory } from "@/lib/types/places";
import type { OfflineBundleManifest } from "@/lib/types/bundle";

import type {
  GuidePack,
  GuideContext,
  GuideMsg,
  GuideTurnRequest,
  GuideTurnResponse,
  GuideToolCall,
  GuideToolResult,
  DiscoveredPlace,
  TripProgress,
  WirePlace,
  GuideAction,
} from "@/lib/types/guide";

import { guideApi } from "@/lib/api/guide";
import { placesApi } from "@/lib/api/places";
import { putGuidePack, getGuidePack, listGuidePacks } from "@/lib/offline/guidePacksStore";
import { haversineKm } from "@/lib/guide/tripProgress";
import { extractIntent, filterAndRankPlaces, type RankedPlace } from "@/lib/guide/intentMapper";

function nowIso() {
  return new Date().toISOString();
}

async function hashString(s: string): Promise<string> {
  const enc = new TextEncoder().encode(s);
  const buf = await crypto.subtle.digest("SHA-256", enc);
  const arr = Array.from(new Uint8Array(buf));
  return arr.map((b) => b.toString(16).padStart(2, "0")).join("").slice(0, 24);
}

// ──────────────────────────────────────────────────────────────
// Wire payload limits
// ──────────────────────────────────────────────────────────────

const WIRE_MAX_THREAD = 20;
const WIRE_MAX_TOOL_RESULTS = 4;
const WIRE_MAX_ITEMS_PER_RESULT = 20;
const WIRE_MAX_RELEVANT_PLACES = 40;
const MAX_DISCOVERED_PLACES = 500;

// ──────────────────────────────────────────────────────────────
// Bootstrap
// ──────────────────────────────────────────────────────────────

export type GuideBootstrap = {
  planId?: string | null;
  label?: string | null;
  stops: TripStop[];
  navpack?: NavPack | null;
  corridor?: CorridorGraphPack | null;
  places?: PlacesPack | null;
  traffic?: TrafficOverlay | null;
  hazards?: HazardOverlay | null;
  manifest?: OfflineBundleManifest | null;
  weather?: WeatherOverlay | null;
  flood?: FloodOverlay | null;
  coverage?: CoverageOverlay | null;
  wildlife?: WildlifeOverlay | null;
  rest_areas?: RestAreaOverlay | null;
  route_score?: RouteIntelligenceScore | null;
  fuel?: FuelOverlay | null;
  progress?: TripProgress | null;
  // Live driver state (from activeNav + fuel tracking)
  driverState?: {
    fuel_pressure?: number;
    km_to_next_fuel?: number | null;
    fatigue_level?: "none" | "suggested" | "recommended" | "urgent";
    hours_since_rest?: number;
    speed_ratio?: number;
    is_night?: boolean;
    temperature_c?: number;
    eta_iso?: string | null;
    night_arrival?: boolean;
  } | null;
};

// ──────────────────────────────────────────────────────────────
// Context builders
// ──────────────────────────────────────────────────────────────

function summarizeTraffic(t?: TrafficOverlay | null) {
  if (!t) return null;
  const counts: Record<string, number> = {};
  for (const it of t.items ?? []) {
    const k = `${it.type ?? "unknown"}:${it.severity ?? "unknown"}`;
    counts[k] = (counts[k] ?? 0) + 1;
  }
  return {
    traffic_key: t.traffic_key,
    total: (t.items ?? []).length,
    counts,
    sample: (t.items ?? []).slice(0, 4).map((x) => ({
      id: x.id,
      type: x.type ?? "unknown",
      severity: x.severity ?? "unknown",
      headline: (x.headline ?? "").slice(0, 80),
    })),
  };
}

function summarizeHazards(h?: HazardOverlay | null) {
  if (!h) return null;
  const counts: Record<string, number> = {};
  for (const it of h.items ?? []) {
    const k = `${it.kind ?? "unknown"}:${it.severity ?? "unknown"}`;
    counts[k] = (counts[k] ?? 0) + 1;
  }
  return {
    hazards_key: h.hazards_key,
    total: (h.items ?? []).length,
    counts,
    sample: (h.items ?? []).slice(0, 4).map((x) => ({
      id: x.id,
      kind: x.kind ?? "unknown",
      severity: x.severity ?? "unknown",
      title: (x.title ?? "").slice(0, 80),
    })),
  };
}

function summarizeRouteScore(s?: RouteIntelligenceScore | null) {
  if (!s) return null;
  return {
    overall: s.overall,
    overall_label: s.overall_label,
    summary: s.summary.slice(0, 200),
    worst_category: [
      { name: "safety", score: s.safety.score },
      { name: "conditions", score: s.conditions.score },
      { name: "services", score: s.services.score },
      { name: "weather", score: s.weather.score },
    ].sort((a, b) => a.score - b.score)[0],
  };
}

function summarizeFlood(f?: FloodOverlay | null) {
  if (!f?.gauges?.length) return null;
  const active = f.gauges.filter((g) => g.severity !== "normal" && g.severity !== "unknown");
  if (active.length === 0) return null;
  return {
    flood_key: f.flood_key,
    active_gauges: active.length,
    worst_severity: active.find((g) => g.severity === "major")?.severity
      ?? active.find((g) => g.severity === "moderate")?.severity
      ?? "minor",
    sample: active.slice(0, 3).map((g) => ({
      name: g.station_name,
      severity: g.severity,
      trend: g.trend,
      height_m: g.latest_height_m ?? null,
    })),
  };
}

function summarizeCoverage(c?: CoverageOverlay | null) {
  if (!c?.gaps?.length) return null;
  const noCovGaps = c.gaps.filter((g) => g.carrier === "all" || g.message.toLowerCase().includes("no coverage"));
  const totalNoCovKm = noCovGaps.reduce((sum, g) => sum + g.gap_km, 0);
  if (totalNoCovKm === 0 && c.gaps.length === 0) return null;
  return {
    coverage_key: c.coverage_key,
    total_no_coverage_km: Math.round(totalNoCovKm),
    total_gap_count: c.gaps.length,
    best_carrier: c.best_carrier_overall ?? null,
  };
}

function summarizeWeather(w?: WeatherOverlay | null) {
  if (!w?.points?.length) return null;
  const points = w.points;
  const maxTemp = Math.max(...points.map((p) => p.temperature_c));
  const minTemp = Math.min(...points.map((p) => p.temperature_c));
  const rainyPoints = points.filter((p) => p.precipitation_probability_pct > 40);
  const windyPoints = points.filter((p) => p.wind_speed_kmh > 50);
  const twilightDanger = points.filter((p) => p.is_twilight_danger);
  const lowVis = points.filter((p) => (p.visibility_m ?? 10000) < 2000);
  const highUv = points.filter((p) => p.uv_index >= 8);

  if (rainyPoints.length === 0 && windyPoints.length === 0 && twilightDanger.length === 0 && lowVis.length === 0 && highUv.length === 0 && maxTemp < 38 && minTemp > 2) {
    return null; // nothing noteworthy
  }

  return {
    weather_key: w.weather_key,
    temp_range_c: `${Math.round(minTemp)}–${Math.round(maxTemp)}`,
    rain_sections: rainyPoints.length,
    rain_km_markers: rainyPoints.slice(0, 4).map((p) => `${Math.round(p.km_along)}km ${p.precipitation_probability_pct}%`),
    windy_sections: windyPoints.length,
    twilight_danger_sections: twilightDanger.length,
    low_visibility_sections: lowVis.length,
    high_uv_sections: highUv.length,
    extreme_heat: maxTemp >= 38,
    near_freezing: minTemp <= 2,
  };
}

function summarizeWildlife(w?: WildlifeOverlay | null) {
  if (!w?.zones?.length) return null;
  const highRisk = w.zones.filter((z) => z.risk_level === "high");
  if (highRisk.length === 0 && w.zones.every((z) => z.risk_level === "low" || z.risk_level === "none")) return null;
  return {
    wildlife_key: w.wildlife_key,
    high_risk_zones: highRisk.length,
    high_risk_km_markers: highRisk.slice(0, 5).map((z) => `${Math.round(z.km_from)}–${Math.round(z.km_to)}km`),
    has_twilight_risk: w.zones.some((z) => z.is_twilight_risk),
  };
}

function buildContext(args: GuideBootstrap): GuideContext {
  const { planId, label, stops, navpack, corridor, traffic, hazards, manifest, progress, fuel, weather } = args;

  const route_key = navpack?.primary?.route_key ?? null;
  const geometry = navpack?.primary?.geometry ?? null;
  const bbox = navpack?.primary?.bbox ?? corridor?.bbox ?? null;
  const corridor_key = corridor?.corridor_key ?? (manifest?.corridor_key ?? null);

  const manifest_route_key = manifest?.route_key ?? null;
  const offline_stale = !!(manifest_route_key && route_key && manifest_route_key !== route_key);

  return {
    plan_id: planId ?? null,
    label: label ?? null,
    profile: navpack?.req?.profile ?? "drive",
    route_key,
    corridor_key,
    geometry: geometry ?? null,
    bbox: bbox ?? null,
    stops: stops ?? [],
    total_distance_m: navpack?.primary?.distance_m ?? null,
    total_duration_s: navpack?.primary?.duration_s ?? null,
    manifest_route_key,
    offline_stale,
    progress: progress ?? null,
    traffic_summary: summarizeTraffic(traffic),
    hazards_summary: summarizeHazards(hazards),
    route_score_summary: summarizeRouteScore(args.route_score),
    flood_summary: summarizeFlood(args.flood),
    coverage_summary: summarizeCoverage(args.coverage),
    wildlife_summary: summarizeWildlife(args.wildlife),
    weather_summary: summarizeWeather(weather),
    fuel_benchmarks: fuel?.city_averages ?? null,
    driver_state: args.driverState ?? null,
    next_challenge: buildNextChallenge(args),
  };
}

function buildNextChallenge(args: GuideBootstrap): GuideContext["next_challenge"] {
  // Find the most critical upcoming issue on the route.
  // Looks at fuel gaps, weather, wildlife, and flood within next 200km.
  const challenges: { desc: string; km: number; sev: "info" | "warning" | "critical" }[] = [];
  const currentKm = args.progress?.km_from_start ?? 0;

  // Fuel gaps ahead
  if (args.fuel?.warnings) {
    for (const w of args.fuel.warnings) {
      const warnObj = w as any;
      const atKm = warnObj.at_km ?? 0;
      if (atKm > currentKm && atKm < currentKm + 200) {
        const gapKm = warnObj.gap_km ?? 0;
        if (gapKm > 150) {
          challenges.push({
            desc: `${Math.round(gapKm)}km fuel gap`,
            km: atKm - currentKm,
            sev: gapKm > 250 ? "critical" : "warning",
          });
        }
      }
    }
  }

  // Weather ahead (storm, heavy rain, extreme heat)
  if (args.weather?.points) {
    for (const p of args.weather.points) {
      if (p.km_along > currentKm && p.km_along < currentKm + 200) {
        if (p.precipitation_probability_pct > 70 && p.precipitation_mm > 5) {
          challenges.push({
            desc: "heavy rain",
            km: p.km_along - currentKm,
            sev: "warning",
          });
          break;
        }
        if (p.temperature_c > 42) {
          challenges.push({
            desc: `extreme heat ${Math.round(p.temperature_c)}°C`,
            km: p.km_along - currentKm,
            sev: "warning",
          });
          break;
        }
      }
    }
  }

  // Wildlife twilight zones ahead
  if (args.wildlife?.zones) {
    for (const z of args.wildlife.zones) {
      if (z.km_from > currentKm && z.km_from < currentKm + 200 && z.risk_level === "high" && z.is_twilight_risk) {
        challenges.push({
          desc: "high wildlife risk at twilight",
          km: z.km_from - currentKm,
          sev: "warning",
        });
        break;
      }
    }
  }

  if (challenges.length === 0) return null;

  // Combine into a single description
  challenges.sort((a, b) => a.km - b.km);
  const nearestKm = Math.round(challenges[0].km);
  const worstSev = challenges.some((c) => c.sev === "critical") ? "critical"
    : challenges.some((c) => c.sev === "warning") ? "warning" : "info";
  const desc = `In ${nearestKm}km: ${challenges.map((c) => c.desc).join(" + ")}`;

  return { description: desc, km_ahead: nearestKm, severity: worstSev };
}

// ──────────────────────────────────────────────────────────────
// Wire payload building
// ──────────────────────────────────────────────────────────────

/**
 * Extract compact extra fields from a PlaceItem's extra dict.
 * These are the fields the backend now populates from Overpass
 * (phone, website, opening_hours, fuel_types, socket_types, etc).
 * We pick them out explicitly so the LLM sees them.
 */
function pickPlaceExtras(item: PlaceItem | Record<string, unknown>): Record<string, unknown> {
  const src = item as Record<string, unknown>;
  const extra: Record<string, unknown> = (src.extra as Record<string, unknown>) ?? src;
  const out: Record<string, unknown> = {};

  // Contact & hours
  if (extra.phone) out.phone = String(extra.phone).slice(0, 40);
  if (extra.website) out.website = String(extra.website).slice(0, 120);
  if (extra.opening_hours) out.opening_hours = String(extra.opening_hours).slice(0, 50);
  if (extra.address) out.address = String(extra.address).slice(0, 60);

  // Fuel station specifics
  if (Array.isArray(extra.fuel_types) && extra.fuel_types.length > 0) {
    out.fuel_types = extra.fuel_types;
  }

  // EV charging specifics
  if (Array.isArray(extra.socket_types) && extra.socket_types.length > 0) {
    out.socket_types = extra.socket_types;
  }

  // Camping amenities — basic
  if (extra.free === true) out.free = true;
  if (extra.has_water === true) out.has_water = true;
  if (extra.has_toilets === true) out.has_toilets = true;
  if (extra.powered_sites === true) out.powered_sites = true;

  // Camping amenities — extended
  if (extra.has_showers === true) out.has_showers = true;
  if (extra.has_dump_point === true) out.has_dump_point = true;
  if (extra.has_bbq === true) out.has_bbq = true;
  if (extra.has_laundry === true) out.has_laundry = true;
  if (extra.has_wifi === true) out.has_wifi = true;
  if (extra.has_playground === true) out.has_playground = true;
  if (extra.has_swimming === true) out.has_swimming = true;
  if (extra.has_phone_reception === true) out.has_phone_reception = true;
  if (extra.has_phone_reception === false) out.has_phone_reception = false;
  if (Array.isArray(extra.reception_carriers) && (extra.reception_carriers as string[]).length > 0) {
    out.reception_carriers = extra.reception_carriers;
  }
  // Camp site config
  if (extra.pets_allowed !== undefined) out.pets_allowed = extra.pets_allowed;
  if (extra.fires_allowed !== undefined) out.fires_allowed = extra.fires_allowed;
  if (extra.generators_allowed !== undefined) out.generators_allowed = extra.generators_allowed;
  if (extra.caravans === true) out.caravans = true;
  if (extra.motorhomes === true) out.motorhomes = true;
  if (extra.tents === false) out.tents = false; // only note if explicitly excluded
  if (typeof extra.max_vehicle_length_m === "number") out.max_vehicle_length_m = extra.max_vehicle_length_m;
  if (typeof extra.num_sites === "number") out.num_sites = extra.num_sites;
  if (extra.bookable === true) out.bookable = true;
  // Camp style
  if (extra.camp_type) out.camp_type = extra.camp_type;
  if (extra.surface) out.surface = extra.surface;
  // Stay rules
  if (typeof extra.max_stay_days === "number") out.max_stay_days = extra.max_stay_days;
  if (extra.check_in) out.check_in = String(extra.check_in).slice(0, 20);
  if (extra.check_out) out.check_out = String(extra.check_out).slice(0, 20);
  if (extra.quiet_hours) out.quiet_hours = String(extra.quiet_hours).slice(0, 40);
  // Cost
  if (typeof extra.price_per_night_aud === "number") out.price_per_night_aud = extra.price_per_night_aud;
  if (extra.price_notes) out.price_notes = String(extra.price_notes).slice(0, 80);

  return out;
}

function rankedToWire(places: RankedPlace[]): WirePlace[] {
  return places.map((p) => {
    const pRec = p as unknown as Record<string, unknown>;
    const extra: Record<string, unknown> = (pRec.extra as Record<string, unknown>) ?? {};
    const website =
      (pRec.website as string | undefined) ??
      (extra.website as string | undefined) ??
      (extra["contact:website"] as string | undefined) ??
      null;

    const wire: WirePlace = {
      id: p.id,
      name: p.name,
      lat: p.lat,
      lng: p.lng,
      category: p.category,
      dist_km: p.dist_km,
      ahead: p.ahead,
      locality: p.locality,
      hours: p.hours,
      phone: p.phone,
      website: website ? String(website).slice(0, 120) : null,
    };

    // Attach camp-specific fields so the LLM can describe amenities
    if (p.category === "camp" || p.category === "rest_area") {
      if (extra.free === true) wire.free = true;
      if (extra.powered_sites === true) wire.powered_sites = true;
      if (extra.has_water === true) wire.has_water = true;
      if (extra.has_toilets === true) wire.has_toilets = true;
      if (extra.has_showers === true) wire.has_showers = true;
      if (extra.has_dump_point === true) wire.has_dump_point = true;
      if (extra.has_bbq === true) wire.has_bbq = true;
      if (extra.has_laundry === true) wire.has_laundry = true;
      if (extra.has_wifi === true) wire.has_wifi = true;
      if (extra.has_swimming === true) wire.has_swimming = true;
      if (extra.has_phone_reception === true) wire.has_phone_reception = true;
      if (extra.has_phone_reception === false) wire.has_phone_reception = false;
      if (Array.isArray(extra.reception_carriers)) wire.reception_carriers = extra.reception_carriers as string[];
      if (extra.pets_allowed !== undefined) wire.pets_allowed = extra.pets_allowed as boolean | "on_lead";
      if (extra.fires_allowed !== undefined) wire.fires_allowed = extra.fires_allowed as boolean | "seasonal";
      if (extra.caravans === true) wire.caravans = true;
      if (extra.motorhomes === true) wire.motorhomes = true;
      if (typeof extra.max_vehicle_length_m === "number") wire.max_vehicle_length_m = extra.max_vehicle_length_m;
      if (typeof extra.num_sites === "number") wire.num_sites = extra.num_sites;
      if (extra.camp_type) wire.camp_type = String(extra.camp_type);
      if (typeof extra.max_stay_days === "number") wire.max_stay_days = extra.max_stay_days;
      if (typeof extra.price_per_night_aud === "number") wire.price_per_night_aud = extra.price_per_night_aud;
      // Overnight legality — use pre-computed RankedPlace field first, then fallback to extra
      const overnightAllowed = p.overnight_allowed ?? extra.overnight_allowed;
      if (overnightAllowed !== undefined) wire.overnight_allowed = overnightAllowed as boolean | "check" | "prohibited";
      const overnightHours = p.overnight_max_hours ?? extra.overnight_max_hours;
      if (typeof overnightHours === "number") wire.overnight_max_hours = overnightHours;
      const overnightNotes = p.overnight_notes ?? (extra.overnight_notes as string | undefined);
      if (overnightNotes) wire.overnight_notes = String(overnightNotes).slice(0, 120);
    }

    return wire;
  });
}

/**
 * Trim a tool result for the wire payload.
 *
 * IMPORTANT: We now include rich extra fields (phone, website,
 * opening_hours, fuel_types, socket_types, camping amenities)
 * so the LLM can make informed recommendations and emit
 * structured actions (web/call buttons) from tool result data.
 */
function trimToolResultForWire(tr: GuideToolResult): GuideToolResult {
  if (!tr.ok) return tr;

  if (tr.tool === "places_search" || tr.tool === "places_corridor") {
    const pack = tr.result as PlacesPack;
    const items = pack?.items ?? [];
    return {
      ...tr,
      result: {
        ...pack,
        items: items.slice(0, WIRE_MAX_ITEMS_PER_RESULT).map((p) => {
          const extras = pickPlaceExtras(p);
          return {
            id: p.id,
            name: p.name,
            category: p.category,
            lat: p.lat,
            lng: p.lng,
            ...extras,
          };
        }),
      } as PlacesPack,
    };
  }

  if (tr.tool === "places_suggest") {
    const resp = tr.result as PlacesSuggestResponse;
    const clusters = resp?.clusters ?? [];

    return {
      ...tr,
      result: {
        clusters: clusters.slice(0, 5).map((cl) => {
          const rawPack = cl?.places ?? null;
          const rawItems = rawPack?.items ?? [];

          let lat: number | null = typeof cl?.lat === "number" ? cl.lat : null;
          let lng: number | null = typeof cl?.lng === "number" ? cl.lng : null;

          if ((lat == null || lng == null) && rawItems.length > 0) {
            let sumLat = 0;
            let sumLng = 0;
            let n = 0;
            for (const p of rawItems) {
              if (typeof p?.lat === "number" && typeof p?.lng === "number") {
                sumLat += p.lat;
                sumLng += p.lng;
                n++;
              }
            }
            if (n > 0) {
              lat = sumLat / n;
              lng = sumLng / n;
            }
          }

          return {
            idx: cl.idx,
            km_from_start: cl.km_from_start,
            lat: lat ?? 0,
            lng: lng ?? 0,

            places: rawPack
              ? {
                  ...rawPack,
                  items: rawItems.slice(0, 5).map((p) => {
                    const extras = pickPlaceExtras(p);
                    return {
                      id: p.id,
                      name: p.name,
                      category: p.category,
                      lat: p.lat,
                      lng: p.lng,
                      ...extras,
                    };
                  }),
                }
              : {
                  places_key: "missing",
                  req: {},
                  provider: "unknown",
                  created_at: nowIso(),
                  algo_version: "unknown",
                  items: [],
                },
          };
        }),
      } as PlacesSuggestResponse,
    };
  }

  return tr;
}

/**
 * Build the wire payload for /guide/turn.
 *
 * KEY: Uses intent extraction on the latest user message to pre-filter
 * the full corridor places pack. The LLM sees 30-40 relevant places
 * immediately instead of 0 or 8000.
 */
function buildWireRequest(
  context: GuideContext,
  pack: GuidePack,
  preferredCategories: string[],
  corridorPlaces: PlaceItem[],
  progress: TripProgress | null,
): GuideTurnRequest {
  let latestUserText = "";
  for (let i = pack.thread.length - 1; i >= 0; i--) {
    if (pack.thread[i].role === "user") {
      latestUserText = pack.thread[i].content;
      break;
    }
  }

  let relevantPlaces: WirePlace[] = [];
  if (latestUserText && corridorPlaces.length > 0) {
    const intent = extractIntent(latestUserText);

    if (preferredCategories.length > 0 && intent.categories.length === 0) {
      intent.categories = preferredCategories as PlaceCategory[];
    }

    const ranked = filterAndRankPlaces(corridorPlaces, intent, progress, WIRE_MAX_RELEVANT_PLACES);
    relevantPlaces = rankedToWire(ranked);
  }

  return {
    context,
    thread: pack.thread.slice(-WIRE_MAX_THREAD),
    tool_results: pack.tool_results.slice(-WIRE_MAX_TOOL_RESULTS).map(trimToolResultForWire),
    preferred_categories: preferredCategories,
    relevant_places: relevantPlaces,
  };
}

// ──────────────────────────────────────────────────────────────
// Discovered places extraction
// ──────────────────────────────────────────────────────────────

function extractDiscoveredPlaces(toolResult: GuideToolResult, progress: TripProgress | null): DiscoveredPlace[] {
  const now = nowIso();
  const items: (PlaceItem & { _cluster_km?: number })[] = [];

  if (toolResult.tool === "places_search" || toolResult.tool === "places_corridor") {
    const pack = toolResult.result as PlacesPack;
    if (pack?.items) items.push(...pack.items);
  } else if (toolResult.tool === "places_suggest") {
    const resp = toolResult.result as PlacesSuggestResponse;
    for (const cluster of resp?.clusters ?? []) {
      if (cluster?.places?.items) {
        items.push(...cluster.places.items.map((p) => ({ ...p, _cluster_km: cluster.km_from_start })));
      }
    }
  }

  return items.map((item) => {
    const dist = progress ? haversineKm(progress.user_lat, progress.user_lng, item.lat, item.lng) : null;
    return {
      id: item.id,
      name: item.name,
      lat: item.lat,
      lng: item.lng,
      category: item.category,
      extra: item.extra,
      source_tool_id: toolResult.id,
      discovered_at: now,
      km_from_start: item._cluster_km ?? null,
      distance_from_user_km: dist != null ? Math.round(dist * 10) / 10 : null,
    };
  });
}

function mergeDiscoveries(existing: DiscoveredPlace[], incoming: DiscoveredPlace[]): DiscoveredPlace[] {
  const map = new Map<string, DiscoveredPlace>();
  for (const p of existing) map.set(p.id, p);
  for (const p of incoming) {
    const prev = map.get(p.id);
    if (prev) {
      // Merge: keep enriched fields from both, prefer incoming for freshness
      map.set(p.id, {
        ...prev,
        ...p,
        // Preserve guide_description if incoming doesn't have one
        guide_description: p.guide_description ?? prev.guide_description ?? null,
        // Preserve extra fields
        extra: { ...(prev.extra ?? {}), ...(p.extra ?? {}) },
      });
    } else {
      map.set(p.id, p);
    }
  }
  const all = Array.from(map.values());
  if (all.length > MAX_DISCOVERED_PLACES) {
    all.sort((a, b) => (b.discovered_at ?? "").localeCompare(a.discovered_at ?? ""));
    return all.slice(0, MAX_DISCOVERED_PLACES);
  }
  return all;
}

/**
 * Extract places from "save" actions in the LLM response.
 * These are places the AI explicitly recommended with enriched descriptions.
 * They get added to discovered_places so the Found tab is always populated
 * when the guide recommends places — even without a tool call.
 */
function extractSaveActionPlaces(
  actions: GuideAction[],
  progress: TripProgress | null,
  corridorPlaces: PlaceItem[],
): DiscoveredPlace[] {
  const now = nowIso();
  const places: DiscoveredPlace[] = [];

  for (const a of actions) {
    if (a.type !== "save") continue;
    if (!a.place_name || a.lat == null || a.lng == null) continue;

    // Try to find a matching corridor place for richer extra data
    const placeId = a.place_id ?? `save_${a.place_name.replace(/\s+/g, "_").toLowerCase()}_${Math.round((a.lat ?? 0) * 1000)}`;
    const corridorMatch = corridorPlaces.find((p) => p.id === placeId);

    const dist = progress
      ? Math.round(haversineKm(progress.user_lat, progress.user_lng, a.lat!, a.lng!) * 10) / 10
      : null;

    places.push({
      id: placeId,
      name: a.place_name,
      lat: a.lat!,
      lng: a.lng!,
      category: (a.category as PlaceCategory) ?? corridorMatch?.category ?? ("attraction" as PlaceCategory),
      extra: corridorMatch?.extra ?? {},
      source_tool_id: "guide_save_action",
      discovered_at: now,
      km_from_start: null,
      distance_from_user_km: dist,
      guide_description: a.description ?? null,
    });
  }

  return places;
}

// ──────────────────────────────────────────────────────────────
// Create / Restore guide pack
// ──────────────────────────────────────────────────────────────

export async function createGuidePack(
  args: GuideBootstrap,
): Promise<{ guideKey: string; pack: GuidePack; context: GuideContext }> {
  const context = buildContext(args);
  const schema_version = "guide.v2";
  const algo_version = "guide.llm.v2";

  const fingerprint = JSON.stringify({
    schema_version,
    algo_version,
    planId: args.planId ?? null,
    route_key: context.route_key,
    corridor_key: context.corridor_key,
    seedStops: (args.stops ?? []).map((s) => [s.type ?? "poi", s.name ?? "", s.lat, s.lng]),
  });

  const guideKey = await hashString(fingerprint);

  const existingPack = await getGuidePack(args.planId ?? null, guideKey);
  if (existingPack && existingPack.thread.length > 0) {
    const restored: GuidePack = {
      ...existingPack,
      updated_at: nowIso(),
      last_progress: args.progress ?? existingPack.last_progress ?? null,
    };
    await putGuidePack(args.planId ?? null, guideKey, restored);
    return { guideKey, pack: restored, context };
  }

  // Fingerprint changed (e.g. stop added, route recalculated) — inherit thread
  // from the most recent pack for this plan so conversation isn't wiped.
  const previousPacks = await listGuidePacks(args.planId ?? null);
  const inheritedThread = previousPacks.find((p) => p.pack.thread.length > 0)?.pack.thread ?? [];

  const pack: GuidePack = {
    schema_version,
    algo_version,
    created_at: nowIso(),
    updated_at: nowIso(),
    plan_id: args.planId ?? null,
    route_key: context.route_key,
    corridor_key: context.corridor_key,
    manifest_route_key: context.manifest_route_key,
    thread: inheritedThread,
    tool_calls: [],
    tool_results: [],
    discovered_places: [],
    last_progress: args.progress ?? null,
    resolution_map: {},
    trip_links: {},
  };

  await putGuidePack(args.planId ?? null, guideKey, pack);
  return { guideKey, pack, context };
}

async function restoreLatestGuidePack(
  planId: string | null,
): Promise<{ guideKey: string; pack: GuidePack } | null> {
  const list = await listGuidePacks(planId);
  if (list.length === 0) return null;
  return { guideKey: list[0].guideKey, pack: list[0].pack };
}

// ──────────────────────────────────────────────────────────────
// Tool execution
// ──────────────────────────────────────────────────────────────

async function execToolCall(call: GuideToolCall, context: GuideContext): Promise<GuideToolResult> {
  try {
    if (call.tool === "places_search") {
      const res = await placesApi.search(call.req);
      return { id: call.id, tool: call.tool, ok: true, result: res };
    }
    if (call.tool === "places_corridor") {
      const corridorReq = { ...call.req };
      if (context.geometry && !corridorReq.geometry) {
        corridorReq.geometry = context.geometry;
        corridorReq.buffer_km = corridorReq.buffer_km ?? 15;
      }
      const res = await placesApi.corridor(corridorReq);
      return { id: call.id, tool: call.tool, ok: true, result: res };
    }
    if (call.tool === "places_suggest") {
      const res = await placesApi.suggest(call.req);
      return { id: call.id, tool: call.tool, ok: true, result: res };
    }
    // Exhaustive check - should never reach here with current union type
    const _exhaustive: never = call;
    return _exhaustive;
  } catch (e: unknown) {
    const errorMsg = e instanceof Error ? e.message : String(e);
    // Error results carry an { error } bag; cast through unknown to satisfy the discriminated union
    const errorResult = { error: errorMsg } as unknown;
    if (call.tool === "places_search") {
      return { id: call.id, tool: call.tool, ok: false, result: errorResult as PlacesPack };
    }
    if (call.tool === "places_corridor") {
      return { id: call.id, tool: call.tool, ok: false, result: errorResult as PlacesPack };
    }
    return { id: call.id, tool: "places_suggest", ok: false, result: errorResult as PlacesSuggestResponse };
  }
}

// ──────────────────────────────────────────────────────────────
// Send message (tool loop)
// ──────────────────────────────────────────────────────────────

export async function guideSendMessage(args: {
  planId?: string | null;
  guideKey: string;
  pack: GuidePack;
  context: GuideContext;
  userText: string;
  preferredCategories?: string[];
  maxSteps?: number;
  progress?: TripProgress | null;
  /** Full corridor places from IDB - used for intent-based pre-filtering */
  corridorPlaces?: PlaceItem[];
  /** Called whenever the pack is updated mid-loop so the UI can re-render */
  onPackUpdate?: (pack: GuidePack) => void;
}): Promise<{ pack: GuidePack; assistantText: string }> {
  const {
    planId,
    guideKey,
    userText,
    preferredCategories = [],
    maxSteps = 3,
    progress,
    corridorPlaces = [],
    onPackUpdate,
  } = args;

  const context: GuideContext = {
    ...args.context,
    progress: progress ?? args.context.progress ?? null,
  };

  let pack: GuidePack = {
    ...args.pack,
    updated_at: nowIso(),
    thread: [...args.pack.thread, { role: "user", content: userText }],
    last_progress: progress ?? args.pack.last_progress ?? null,
  };

  await putGuidePack(planId ?? null, guideKey, pack);

  let assistantText = "";
  let steps = 0;
  // Track only THIS turn's tool results — don't re-send old ones
  let currentTurnToolResults: GuideToolResult[] = [];

  while (steps < maxSteps) {
    steps++;

    // Build wire request, but override tool_results to only include
    // results from this turn's tool loop (not historical ones)
    const baseReq = buildWireRequest(context, pack, preferredCategories, corridorPlaces, progress ?? null);
    const turnReq: GuideTurnRequest = {
      ...baseReq,
      tool_results: currentTurnToolResults.slice(-WIRE_MAX_TOOL_RESULTS).map(trimToolResultForWire),
    };
    const turn: GuideTurnResponse = await guideApi.turn(turnReq);

    const newText = turn.assistant ?? "";
    const actions: GuideAction[] = Array.isArray(turn.actions) ? turn.actions : [];

    // Extract places from "save" actions → merge into discovered_places
    const savedPlaces = extractSaveActionPlaces(actions, progress ?? null, corridorPlaces);
    const mergedFromSaves = savedPlaces.length > 0
      ? mergeDiscoveries(pack.discovered_places, savedPlaces)
      : pack.discovered_places;

    // On step 1: create a new assistant message.
    // On step 2+: merge into the existing assistant message (one bubble, not two).
    const lastMsg = pack.thread[pack.thread.length - 1];
    const isFollowUp = steps > 1 && lastMsg?.role === "assistant";

    let updatedThread: GuideMsg[];
    if (isFollowUp && newText) {
      // Append new text and merge actions into the existing bubble
      const merged: GuideMsg = {
        ...lastMsg,
        content: lastMsg.content + "\n\n" + newText,
        actions: [...(lastMsg.actions ?? []), ...actions],
      };
      updatedThread = [...pack.thread.slice(0, -1), merged];
      assistantText = merged.content;
    } else {
      const assistantMsg: GuideMsg = {
        role: "assistant",
        content: newText,
        resolved_tool_id: null,
        actions,
      };
      updatedThread = [...pack.thread, assistantMsg];
      assistantText = newText;
    }

    pack = {
      ...pack,
      updated_at: nowIso(),
      thread: updatedThread,
      tool_calls: [...pack.tool_calls, ...(turn.tool_calls ?? [])],
      discovered_places: mergedFromSaves,
    };
    await putGuidePack(planId ?? null, guideKey, pack);
    onPackUpdate?.(pack);

    if (!turn.tool_calls || turn.tool_calls.length === 0) break;

    // Yield to the browser so React can paint the first message before
    // we start the tool call round-trip (which can take 10+ seconds).
    await new Promise((r) => setTimeout(r, 0));

    // Execute all tool calls in parallel (up to 4 per turn).
    const toolResults = await Promise.all(
      turn.tool_calls.slice(0, 4).map((call) => execToolCall(call, context))
    );

    // Accumulate this turn's tool results (for the next loop iteration)
    currentTurnToolResults = [...currentTurnToolResults, ...toolResults];

    let mergedPlaces = pack.discovered_places;
    for (const toolRes of toolResults) {
      const newPlaces = extractDiscoveredPlaces(toolRes, progress ?? null);
      mergedPlaces = mergeDiscoveries(mergedPlaces, newPlaces);
    }

    // Tag the last assistant message with the first tool call id (for display)
    const taggedThread = [...pack.thread];
    const tagTarget = taggedThread[taggedThread.length - 1];
    if (tagTarget && tagTarget.role === "assistant") {
      taggedThread[taggedThread.length - 1] = {
        ...tagTarget,
        resolved_tool_id: turn.tool_calls[0].id ?? null,
      };
    }

    pack = {
      ...pack,
      updated_at: nowIso(),
      thread: taggedThread,
      tool_results: [...pack.tool_results, ...toolResults],
      discovered_places: mergedPlaces,
    };
    await putGuidePack(planId ?? null, guideKey, pack);
    onPackUpdate?.(pack);

    // If done=true, stop looping
    if (turn.done) break;
  }

  return { pack, assistantText };
}