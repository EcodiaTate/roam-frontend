// src/lib/types/explore.ts
import type { TripStop } from "./trip";
import type { PlacesRequest, CorridorPlacesRequest, PlacesSuggestRequest, PlacesPack, PlacesSuggestResponse } from "./places";
import type { TrafficOverlay, HazardOverlay } from "./navigation";
import type { OfflineBundleManifest } from "./bundle";

export type ExploreToolName = "places_search" | "places_corridor" | "places_suggest";

export type ExploreMsg = {
  role: "user" | "assistant";
  content: string;
};

export type ExploreContext = {
  plan_id?: string | null;
  label?: string | null;

  profile?: string | null;
  route_key?: string | null;
  corridor_key?: string | null;

  geometry?: string | null; // polyline6
  bbox?: any | null; // BBox4-ish dict; keep loose to avoid coupling

  stops?: TripStop[];

  // deterministic offline staleness check
  manifest_route_key?: string | null;
  offline_stale?: boolean | null;

  // summaries only (optional)
  traffic_summary?: any | null;
  hazards_summary?: any | null;
};

export type ExploreToolCall =
  | { id: string; tool: "places_search"; req: PlacesRequest }
  | { id: string; tool: "places_corridor"; req: CorridorPlacesRequest }
  | { id: string; tool: "places_suggest"; req: PlacesSuggestRequest };

export type ExploreToolResult =
  | { id: string; tool: "places_search"; ok: boolean; result: PlacesPack }
  | { id: string; tool: "places_corridor"; ok: boolean; result: PlacesPack }
  | { id: string; tool: "places_suggest"; ok: boolean; result: PlacesSuggestResponse };

export type ExploreTurnRequest = {
  context: ExploreContext;
  thread: ExploreMsg[];
  tool_results?: ExploreToolResult[];
  preferred_categories?: string[];
};

export type ExploreTurnResponse = {
  assistant: string;
  tool_calls: ExploreToolCall[];
  done: boolean;
};

export type ExplorePack = {
  schema_version: string; // "explore.v1"
  algo_version: string;   // e.g. settings.algo_version or frontend constant
  created_at: string;     // ISO UTC
  updated_at: string;     // ISO UTC

  plan_id?: string | null;

  // scope
  route_key?: string | null;
  corridor_key?: string | null;

  // deterministic offline staleness
  manifest_route_key?: string | null;

  // conversation state
  thread: ExploreMsg[];

  // tool call ledger (artifact-first)
  tool_calls: ExploreToolCall[];
  tool_results: ExploreToolResult[];

  // optional: links into trip later
  resolution_map?: Record<string, string>;
  trip_links?: Record<string, string>;
};
