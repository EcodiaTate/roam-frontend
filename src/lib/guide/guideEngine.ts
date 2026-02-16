// src/lib/guide/guideEngine.ts
"use client";

import type { TripStop } from "@/lib/types/trip";
import type { NavPack, CorridorGraphPack, TrafficOverlay, HazardOverlay } from "@/lib/types/navigation";
import type { PlacesPack, PlacesSuggestResponse, PlaceItem } from "@/lib/types/places";
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
const WIRE_MAX_TOOL_RESULTS = 3;
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

function rankedToWire(places: RankedPlace[]): WirePlace[] {
  return places.map((p) => ({
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
  }));
}

function trimToolResultForWire(tr: GuideToolResult): GuideToolResult {
  if (!tr.ok) return tr;
  const result = tr.result as any;

  if (tr.tool === "places_search" || tr.tool === "places_corridor") {
    const items = (result?.items ?? []) as any[];
    return {
      ...tr,
      result: {
        ...result,
        items: items.slice(0, WIRE_MAX_ITEMS_PER_RESULT).map((p: any) => ({
          id: p.id, name: p.name, category: p.category, lat: p.lat, lng: p.lng,
        })),
      },
    };
  }

  if (tr.tool === "places_suggest") {
    const clusters = (result?.clusters ?? []) as any[];

    return {
      ...tr,
      result: {
        // Preserve the backend schema shape: cluster.places MUST be a PlacesPack
        clusters: clusters.slice(0, 5).map((cl: any) => {
          const rawPack = cl?.places ?? null;
          const rawItems = (rawPack?.items ?? []) as any[];

          // Prefer cluster centroid; otherwise derive from raw items
          let lat = typeof cl?.lat === "number" ? cl.lat : null;
          let lng = typeof cl?.lng === "number" ? cl.lng : null;

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

            // IMPORTANT: keep PlacesPack fields, only trim items + fields inside items
            places: rawPack
              ? {
                  ...rawPack,
                  items: rawItems.slice(0, 5).map((p: any) => ({
                    id: p.id,
                    name: p.name,
                    category: p.category,
                    lat: p.lat,
                    lng: p.lng,
                  })),
                }
              : {
                  // Fallback only if backend ever returns null/undefined (should be rare)
                  places_key: "missing",
                  req: {},
                  provider: "unknown",
                  created_at: nowIso(),
                  algo_version: "unknown",
                  items: [],
                },
          };
        }),
      },
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
  // Find the latest user message to extract intent
  let latestUserText = "";
  for (let i = pack.thread.length - 1; i >= 0; i--) {
    if (pack.thread[i].role === "user") {
      latestUserText = pack.thread[i].content;
      break;
    }
  }

  // Extract intent and pre-filter places
  let relevantPlaces: WirePlace[] = [];
  if (latestUserText && corridorPlaces.length > 0) {
    const intent = extractIntent(latestUserText);

    // Merge chip-filter preferred categories if intent didn't match anything specific
    if (preferredCategories.length > 0 && intent.categories.length === 0) {
      intent.categories = preferredCategories as any[];
    }

    const ranked = filterAndRankPlaces(
      corridorPlaces,
      intent,
      progress,
      WIRE_MAX_RELEVANT_PLACES,
    );

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

function extractDiscoveredPlaces(
  toolResult: GuideToolResult,
  progress: TripProgress | null,
): DiscoveredPlace[] {
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
    const dist = progress
      ? haversineKm(progress.user_lat, progress.user_lng, item.lat, item.lng)
      : null;
    return {
      id: item.id, name: item.name, lat: item.lat, lng: item.lng,
      category: item.category, extra: item.extra,
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
  for (const p of incoming) map.set(p.id, p);
  const all = Array.from(map.values());
  if (all.length > MAX_DISCOVERED_PLACES) {
    all.sort((a, b) => (b.discovered_at ?? "").localeCompare(a.discovered_at ?? ""));
    return all.slice(0, MAX_DISCOVERED_PLACES);
  }
  return all;
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
    schema_version, algo_version,
    planId: args.planId ?? null,
    route_key: context.route_key,
    corridor_key: context.corridor_key,
    seedStops: (args.stops ?? []).map((s) => [s.type ?? "poi", s.name ?? "", s.lat, s.lng]),
  });

  const guideKey = await hashString(fingerprint);

  const existingPack = await getGuidePack(args.planId ?? null, guideKey);
  if (existingPack && existingPack.thread.length > 0) {
    const restored: GuidePack = {
      ...existingPack, updated_at: nowIso(),
      last_progress: args.progress ?? existingPack.last_progress ?? null,
    };
    await putGuidePack(args.planId ?? null, guideKey, restored);
    return { guideKey, pack: restored, context };
  }

  const pack: GuidePack = {
    schema_version, algo_version,
    created_at: nowIso(), updated_at: nowIso(),
    plan_id: args.planId ?? null,
    route_key: context.route_key,
    corridor_key: context.corridor_key,
    manifest_route_key: context.manifest_route_key,
    thread: [], tool_calls: [], tool_results: [],
    discovered_places: [],
    last_progress: args.progress ?? null,
    resolution_map: {}, trip_links: {},
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

/**
 * Execute a guide tool call.
 *
 * For places_corridor calls, we inject the route geometry from context
 * so the backend searches along the actual road shape instead of a
 * start-to-end bounding box.
 */
async function execToolCall(
  call: GuideToolCall,
  context: GuideContext,
): Promise<GuideToolResult> {
  const base = call as unknown as { id: string; tool: string; req?: unknown };
  try {
    if ((call as any).tool === "places_search") {
      const res = await placesApi.search((call as any).req);
      return { id: base.id, tool: base.tool as any, ok: true, result: res as any };
    }
    if ((call as any).tool === "places_corridor") {
      // Inject route geometry from context so corridor search follows
      // the actual road, not just a rectangle
      const corridorReq = { ...(call as any).req };
      if (context.geometry && !corridorReq.geometry) {
        corridorReq.geometry = context.geometry;
        corridorReq.buffer_km = corridorReq.buffer_km ?? 15;
      }
      const res = await placesApi.corridor(corridorReq);
      return { id: base.id, tool: base.tool as any, ok: true, result: res as any };
    }
    if ((call as any).tool === "places_suggest") {
      const res = await placesApi.suggest((call as any).req);
      return { id: base.id, tool: base.tool as any, ok: true, result: res as any };
    }
    return { id: base.id, tool: base.tool as any, ok: false, result: { error: "unknown tool" } as any };
  } catch (e: any) {
    return { id: base.id, tool: base.tool as any, ok: false, result: { error: e?.message ?? String(e) } as any };
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
  /** Full corridor places from IDB — used for intent-based pre-filtering */
  corridorPlaces?: PlaceItem[];
}): Promise<{ pack: GuidePack; assistantText: string }> {
  const {
    planId, guideKey, userText,
    preferredCategories = [], maxSteps = 4,
    progress, corridorPlaces = [],
  } = args;

  const context: GuideContext = {
    ...args.context,
    progress: progress ?? args.context.progress ?? null,
  };

  let pack: GuidePack = {
    ...args.pack, updated_at: nowIso(),
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
    const assistantMsg: GuideMsg = { role: "assistant", content: assistantText, resolved_tool_id: null };

    pack = {
      ...pack, updated_at: nowIso(),
      thread: [...pack.thread, assistantMsg],
      tool_calls: [...pack.tool_calls, ...(turn.tool_calls ?? [])],
    };
    await putGuidePack(planId ?? null, guideKey, pack);

    if (turn.done || !turn.tool_calls || turn.tool_calls.length === 0) break;

    const call = turn.tool_calls[0];
    const toolRes = await execToolCall(call, context);

    const newPlaces = extractDiscoveredPlaces(toolRes, progress ?? null);
    const mergedPlaces = mergeDiscoveries(pack.discovered_places, newPlaces);

    const updatedThread = [...pack.thread];
    const lastMsg = updatedThread[updatedThread.length - 1];
    if (lastMsg && lastMsg.role === "assistant") {
      updatedThread[updatedThread.length - 1] = { ...lastMsg, resolved_tool_id: call.id };
    }

    pack = {
      ...pack, updated_at: nowIso(),
      thread: updatedThread,
      tool_results: [...pack.tool_results, toolRes],
      discovered_places: mergedPlaces,
    };
    await putGuidePack(planId ?? null, guideKey, pack);
  }

  return { pack, assistantText };
}