// src/lib/types/guide.ts
import type { TripStop } from "./trip";
import type {
  PlacesRequest,
  CorridorPlacesRequest,
  PlacesSuggestRequest,
  PlacesPack,
  PlacesSuggestResponse,
  PlaceItem,
  PlaceCategory,
} from "./places";
import type { TrafficOverlay, HazardOverlay } from "./navigation";
import type { OfflineBundleManifest } from "./bundle";

// ──────────────────────────────────────────────────────────────
// Tool types
// ──────────────────────────────────────────────────────────────

export type GuideToolName = "places_search" | "places_corridor" | "places_suggest";

// ──────────────────────────────────────────────────────────────
// UI Actions (render as buttons/pills under assistant messages)
// ──────────────────────────────────────────────────────────────

export type GuideActionType = "web" | "call";

export type GuideAction = {
  type: GuideActionType;

  /**
   * Button label. IMPORTANT: backend guarantees this does NOT include raw url/phone.
   * Examples:
   * - "Website · Coles Express Kawana"
   * - "Call Reddy Express"
   */
  label: string;

  place_id?: string | null;
  place_name?: string | null;

  // For type="web"
  url?: string | null;

  // For type="call"
  tel?: string | null;
};

export type GuideMsg = {
  role: "user" | "assistant";
  content: string;
  resolved_tool_id?: string | null;

  /**
   * Actions associated with THIS message (usually assistant messages only).
   * Render these as pills/buttons under the message bubble.
   */
  actions?: GuideAction[] | null;
};

// ──────────────────────────────────────────────────────────────
// Trip Progress
// ──────────────────────────────────────────────────────────────

export type TripProgress = {
  user_lat: number;
  user_lng: number;
  user_accuracy_m: number;
  user_heading: number | null;
  user_speed_mps: number | null;

  current_stop_idx: number;
  current_leg_idx: number;
  visited_stop_ids: string[];

  km_from_start: number;
  km_remaining: number;
  total_km: number;

  local_time_iso: string;
  timezone: string;
  updated_at: string;
};

// ──────────────────────────────────────────────────────────────
// Guide Context
// ──────────────────────────────────────────────────────────────

export type GuideContext = {
  plan_id?: string | null;
  label?: string | null;

  profile?: string | null;
  route_key?: string | null;
  corridor_key?: string | null;

  geometry?: string | null; // polyline6 — kept for tool repair, never sent to LLM raw
  bbox?: any | null;

  stops?: TripStop[];

  total_distance_m?: number | null;
  total_duration_s?: number | null;

  manifest_route_key?: string | null;
  offline_stale?: boolean | null;

  progress?: TripProgress | null;

  traffic_summary?: any | null;
  hazards_summary?: any | null;
};

// ──────────────────────────────────────────────────────────────
// Wire format: compact place for LLM injection
// ──────────────────────────────────────────────────────────────

/**
 * A pre-filtered, ranked place sent to the backend for LLM context injection.
 * Compact: only the fields the LLM needs to make recommendations.
 */
export type WirePlace = {
  id: string;
  name: string;
  lat: number;
  lng: number;
  category: PlaceCategory;
  dist_km: number | null; // distance from user
  ahead: boolean; // is this ahead on the route?
  locality: string | null; // suburb/town
  hours: string | null; // opening hours
  phone: string | null;

  /**
   * NEW: allow backend to output clean "Website · <Place>" actions.
   * Keep optional for backward compat.
   */
  website?: string | null;
};

// ──────────────────────────────────────────────────────────────
// Tool calls & results
// ──────────────────────────────────────────────────────────────

export type GuideToolCall =
  | { id: string; tool: "places_search"; req: PlacesRequest }
  | { id: string; tool: "places_corridor"; req: CorridorPlacesRequest }
  | { id: string; tool: "places_suggest"; req: PlacesSuggestRequest };

export type GuideToolResult =
  | { id: string; tool: "places_search"; ok: boolean; result: PlacesPack }
  | { id: string; tool: "places_corridor"; ok: boolean; result: PlacesPack }
  | { id: string; tool: "places_suggest"; ok: boolean; result: PlacesSuggestResponse };

// ──────────────────────────────────────────────────────────────
// Turn request/response (wire format to backend)
// ──────────────────────────────────────────────────────────────

export type GuideTurnRequest = {
  context: GuideContext;
  thread: GuideMsg[];
  tool_results?: GuideToolResult[];
  preferred_categories?: string[];

  /**
   * Pre-filtered places from the corridor pack, matched to the user's intent.
   * Injected into the LLM context so it can recommend without a tool call.
   * Typically 20-40 places, already sorted by distance/relevance.
   */
  relevant_places?: WirePlace[];
};

export type GuideTurnResponse = {
  assistant: string;

  /**
   * NEW: structured UI actions. Render as buttons; do NOT parse markdown.
   */
  actions?: GuideAction[];

  tool_calls: GuideToolCall[];
  done: boolean;
};

// ──────────────────────────────────────────────────────────────
// Guide Pack (persisted in IDB)
// ──────────────────────────────────────────────────────────────

export type DiscoveredPlace = PlaceItem & {
  source_tool_id: string;
  discovered_at: string;
  km_from_start?: number | null;
  distance_from_user_km?: number | null;
};

export type GuidePack = {
  schema_version: string;
  algo_version: string;
  created_at: string;
  updated_at: string;

  plan_id?: string | null;

  route_key?: string | null;
  corridor_key?: string | null;
  manifest_route_key?: string | null;

  thread: GuideMsg[];
  tool_calls: GuideToolCall[];
  tool_results: GuideToolResult[];

  discovered_places: DiscoveredPlace[];
  last_progress?: TripProgress | null;

  resolution_map?: Record<string, string>;
  trip_links?: Record<string, string>;
};
