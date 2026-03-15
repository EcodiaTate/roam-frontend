// src/lib/guide/guideEngine.ts
"use client";

import type { TripStop } from "@/lib/types/trip";
import type { NavPack, CorridorGraphPack, TrafficOverlay, HazardOverlay } from "@/lib/types/navigation";
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

const WIRE_MAX_THREAD = 10;
const WIRE_MAX_TOOL_RESULTS = 6;
const WIRE_MAX_ITEMS_PER_RESULT = 15;
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
  progress?: TripProgress | null;
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

function buildContext(args: GuideBootstrap): GuideContext {
  const { planId, label, stops, navpack, corridor, traffic, hazards, manifest, progress } = args;

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
  };
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

  // Camping amenities
  if (extra.free === true) out.free = true;
  if (extra.has_water === true) out.has_water = true;
  if (extra.has_toilets === true) out.has_toilets = true;
  if (extra.powered_sites === true) out.powered_sites = true;

  return out;
}

function rankedToWire(places: RankedPlace[]): WirePlace[] {
  return places.map((p) => {
    // Pull website from extra if not on the RankedPlace directly
    const pRec = p as unknown as Record<string, unknown>;
    const extra: Record<string, unknown> = (pRec.extra as Record<string, unknown>) ?? {};
    const website =
      (pRec.website as string | undefined) ??
      (extra.website as string | undefined) ??
      (extra["contact:website"] as string | undefined) ??
      null;

    return {
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

export async function restoreLatestGuidePack(
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
}): Promise<{ pack: GuidePack; assistantText: string }> {
  const {
    planId,
    guideKey,
    userText,
    preferredCategories = [],
    maxSteps = 4,
    progress,
    corridorPlaces = [],
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

  while (steps < maxSteps) {
    steps++;

    const turnReq = buildWireRequest(context, pack, preferredCategories, corridorPlaces, progress ?? null);
    const turn: GuideTurnResponse = await guideApi.turn(turnReq);

    assistantText = turn.assistant ?? "";

    // Store structured actions directly on the assistant message so the
    // frontend can render them as pills without parsing markdown.
    const actions: GuideAction[] = Array.isArray(turn.actions) ? turn.actions : [];

    // Extract places from "save" actions → merge into discovered_places
    const savedPlaces = extractSaveActionPlaces(actions, progress ?? null, corridorPlaces);
    const mergedFromSaves = savedPlaces.length > 0
      ? mergeDiscoveries(pack.discovered_places, savedPlaces)
      : pack.discovered_places;

    const assistantMsg: GuideMsg = {
      role: "assistant",
      content: assistantText,
      resolved_tool_id: null,
      actions,
    };

    pack = {
      ...pack,
      updated_at: nowIso(),
      thread: [...pack.thread, assistantMsg],
      tool_calls: [...pack.tool_calls, ...(turn.tool_calls ?? [])],
      discovered_places: mergedFromSaves,
    };
    await putGuidePack(planId ?? null, guideKey, pack);

    if (turn.done || !turn.tool_calls || turn.tool_calls.length === 0) break;

    // Execute all tool calls in parallel (up to 3 per turn).
    const toolResults = await Promise.all(
      turn.tool_calls.slice(0, 3).map((call) => execToolCall(call, context))
    );

    let mergedPlaces = pack.discovered_places;
    for (const toolRes of toolResults) {
      const newPlaces = extractDiscoveredPlaces(toolRes, progress ?? null);
      mergedPlaces = mergeDiscoveries(mergedPlaces, newPlaces);
    }

    // Tag the last assistant message with the first tool call id (for display)
    const updatedThread = [...pack.thread];
    const lastMsg = updatedThread[updatedThread.length - 1];
    if (lastMsg && lastMsg.role === "assistant") {
      updatedThread[updatedThread.length - 1] = {
        ...lastMsg,
        resolved_tool_id: turn.tool_calls[0].id ?? null,
      };
    }

    pack = {
      ...pack,
      updated_at: nowIso(),
      thread: updatedThread,
      tool_results: [...pack.tool_results, ...toolResults],
      discovered_places: mergedPlaces,
    };
    await putGuidePack(planId ?? null, guideKey, pack);
  }

  return { pack, assistantText };
}