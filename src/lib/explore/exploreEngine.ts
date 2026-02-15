// src/lib/explore/exploreEngine.ts
"use client";

import type { TripStop } from "@/lib/types/trip";
import type { NavPack, CorridorGraphPack, TrafficOverlay, HazardOverlay } from "@/lib/types/navigation";
import type { PlacesPack, PlacesSuggestResponse } from "@/lib/types/places";
import type { OfflineBundleManifest } from "@/lib/types/bundle";

import type {
  ExplorePack,
  ExploreContext,
  ExploreMsg,
  ExploreTurnRequest,
  ExploreTurnResponse,
  ExploreToolCall,
  ExploreToolResult,
} from "@/lib/types/explore";

import { exploreApi } from "@/lib/api/explore";
import { placesApi } from "@/lib/api/places";
import { putExplorePack } from "@/lib/offline/explorePacksStore";

function nowIso() {
  return new Date().toISOString();
}

// Small deterministic "hash" for explore_key.
// If you already have a canonical hash util, swap this.
// (This is stable enough for v1, and we can harden later.)
async function hashString(s: string): Promise<string> {
  const enc = new TextEncoder().encode(s);
  const buf = await crypto.subtle.digest("SHA-256", enc);
  const arr = Array.from(new Uint8Array(buf));
  return arr.map((b) => b.toString(16).padStart(2, "0")).join("").slice(0, 24);
}

export type ExploreBootstrap = {
  planId?: string | null;
  label?: string | null;

  stops: TripStop[];
  navpack?: NavPack | null;
  corridor?: CorridorGraphPack | null;

  places?: PlacesPack | null;
  traffic?: TrafficOverlay | null;
  hazards?: HazardOverlay | null;

  manifest?: OfflineBundleManifest | null;

  // if you want to scope by focused stop/segment later, add it here
};

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
    sample: (t.items ?? []).slice(0, 8).map((x) => ({
      id: x.id,
      type: x.type ?? "unknown",
      severity: x.severity ?? "unknown",
      headline: x.headline,
      url: x.url ?? null,
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
    sample: (h.items ?? []).slice(0, 8).map((x) => ({
      id: x.id,
      kind: x.kind ?? "unknown",
      severity: x.severity ?? "unknown",
      title: x.title,
      url: x.url ?? null,
    })),
  };
}

export async function createExplorePack(args: ExploreBootstrap): Promise<{ exploreKey: string; pack: ExplorePack; context: ExploreContext }> {
  const { planId, label, stops, navpack, corridor, traffic, hazards, manifest } = args;

  const route_key = navpack?.primary?.route_key ?? null;
  const geometry = navpack?.primary?.geometry ?? args?.navpack?.primary?.geometry ?? null;
  const bbox = navpack?.primary?.bbox ?? corridor?.bbox ?? null;
  const corridor_key = corridor?.corridor_key ?? (manifest?.corridor_key ?? null);

  const manifest_route_key = manifest?.route_key ?? null;
  const offline_stale = !!(manifest_route_key && route_key && manifest_route_key !== route_key);

  const schema_version = "explore.v1";
  const algo_version = "explore.llm.v1";

  const fingerprint = JSON.stringify({
    schema_version,
    algo_version,
    planId: planId ?? null,
    route_key,
    corridor_key,
    seedStops: (stops ?? []).map((s) => [s.type ?? "poi", s.name ?? "", s.lat, s.lng]),
  });

  const exploreKey = await hashString(fingerprint);

  const context: ExploreContext = {
    plan_id: planId ?? null,
    label: label ?? null,
    profile: navpack?.req?.profile ?? "drive",
    route_key,
    corridor_key,
    geometry: geometry ?? null,
    bbox: bbox ?? null,
    stops: stops ?? [],
    manifest_route_key,
    offline_stale,
    traffic_summary: summarizeTraffic(traffic),
    hazards_summary: summarizeHazards(hazards),
  };

  const pack: ExplorePack = {
    schema_version,
    algo_version,
    created_at: nowIso(),
    updated_at: nowIso(),
    plan_id: planId ?? null,
    route_key,
    corridor_key,
    manifest_route_key,
    thread: [],
    tool_calls: [],
    tool_results: [],
    resolution_map: {},
    trip_links: {},
  };

  await putExplorePack(planId ?? null, exploreKey, pack);

  return { exploreKey, pack, context };
}
async function execToolCall(call: ExploreToolCall): Promise<ExploreToolResult> {
  // Widen before TS exhaustiveness narrowing turns `call` into `never`.
  const base = call as unknown as { id: string; tool: string; req?: unknown };

  try {
    if ((call as any).tool === "places_search") {
      const res = await placesApi.search((call as any).req);
      return { id: base.id, tool: base.tool as any, ok: true, result: res as any };
    }
    if ((call as any).tool === "places_corridor") {
      const res = await placesApi.corridor((call as any).req);
      return { id: base.id, tool: base.tool as any, ok: true, result: res as any };
    }
    if ((call as any).tool === "places_suggest") {
      const res = await placesApi.suggest((call as any).req);
      return { id: base.id, tool: base.tool as any, ok: true, result: res as any };
    }

    // ✅ Now not `never`
    return {
      id: base.id,
      tool: base.tool as any,
      ok: false,
      result: { error: "unknown tool" } as any,
    };
  } catch (e: any) {
    return {
      id: base.id,
      tool: base.tool as any,
      ok: false,
      result: { error: e?.message ?? String(e) } as any,
    };
  }
}


export async function exploreSendMessage(args: {
  planId?: string | null;
  exploreKey: string;
  pack: ExplorePack;
  context: ExploreContext;
  userText: string;
  preferredCategories?: string[];
  maxSteps?: number;
}): Promise<{ pack: ExplorePack; assistantText: string }> {
  const {
    planId,
    exploreKey,
    context,
    userText,
    preferredCategories = [],
    maxSteps = 4,
  } = args;

  let pack: ExplorePack = {
    ...args.pack,
    updated_at: nowIso(),
    thread: [...args.pack.thread, { role: "user", content: userText }],
  };

  await putExplorePack(planId ?? null, exploreKey, pack);

  let assistantText = "";
  let steps = 0;

  // Tool loop: call LLM -> execute 0..1 tool call -> feed results -> repeat
  while (steps < maxSteps) {
    steps++;

    const turnReq: ExploreTurnRequest = {
      context,
      thread: pack.thread,
      tool_results: pack.tool_results,
      preferred_categories: preferredCategories,
    };

    const turn: ExploreTurnResponse = await exploreApi.turn(turnReq);

    assistantText = turn.assistant ?? "";
    pack = {
      ...pack,
      updated_at: nowIso(),
      thread: [...pack.thread, { role: "assistant", content: assistantText }],
      tool_calls: [...pack.tool_calls, ...(turn.tool_calls ?? [])],
    };

    await putExplorePack(planId ?? null, exploreKey, pack);

    if (turn.done || !turn.tool_calls || turn.tool_calls.length === 0) {
      break;
    }

    // Canon preference: one tool call per step
    const call = turn.tool_calls[0];
    const toolRes = await execToolCall(call);

    pack = {
      ...pack,
      updated_at: nowIso(),
      tool_results: [...pack.tool_results, toolRes],
    };

    await putExplorePack(planId ?? null, exploreKey, pack);

    // continue loop so LLM can interpret tool results
  }

  return { pack, assistantText };
}
