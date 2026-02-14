"use client";

import type { TripStop } from "@/lib/types/trip";
import type { OfflineBundleManifest } from "@/lib/types/bundle";
import { StopRow } from "./StopRow";

type OfflineBuildPhase = "idle" | "routing" | "corridor_ensure" | "corridor_get" | "places_corridor" | "traffic_poll" | "hazards_poll" | "bundle_build" | "ready" | "error";

function phaseLabel(p: OfflineBuildPhase) {
  switch (p) {
    case "idle": return "Idle";
    case "routing": return "Routing…";
    case "corridor_ensure": return "Building corridor…";
    case "corridor_get": return "Loading corridor…";
    case "places_corridor": return "Scanning places…";
    case "traffic_poll": return "Fetching traffic…";
    case "hazards_poll": return "Fetching hazards…";
    case "bundle_build": return "Building offline bundle…";
    case "ready": return "Ready";
    case "error": return "Error";
    default: return "…";
  }
}

export function StopsEditor(props: {
  profile: string; onProfileChange: (p: string) => void;
  stops: TripStop[]; onAddStop: (type?: "poi" | "via") => void; onRemoveStop: (id: string) => void; onReorderStop: (fromIdx: number, toIdx: number) => void;
  onEditStop: (id: string, patch: Partial<Pick<TripStop, "name" | "lat" | "lng">>) => void; onUseMyLocation: () => void; onSearchStop: (id: string) => void;
  onBuildRoute: () => void; canBuildRoute: boolean; routing: boolean; error: string | null;
  onBuildOffline: () => void; onDownloadOffline: () => void; onSaveOffline: () => void; onResetOffline: () => void;
  offlinePhase: OfflineBuildPhase; offlineError: string | null; offlineManifest: OfflineBundleManifest | null; canDownloadOffline: boolean;
  savingOffline: boolean; savedOffline: boolean;
}) {
  const offlineBusy = props.offlinePhase !== "idle" && props.offlinePhase !== "ready" && props.offlinePhase !== "error";

  return (
    <div className="trip-sheet-wrap">
      <div className="trip-sheet">
        <div className="trip-row-between">
          <div>
            <div className="trip-h1">New Trip</div>
            <div className="trip-muted">Stops → route → offline bundle</div>
          </div>

          <select value={props.profile} onChange={(e) => props.onProfileChange(e.currentTarget.value)} className="trip-interactive trip-select" aria-label="Routing profile">
            <option value="drive">Drive</option>
            <option value="walk">Walk</option>
            <option value="bike">Bike</option>
          </select>
        </div>

        {/* Scrollable List Container for large amounts of stops */}
        <div className="trip-list-container" style={{ display: "grid", gap: 10, padding: "2px", maxHeight: "35vh", background: "transparent", border: "none" }}>
          {props.stops.map((s, idx) => (
            <StopRow
              key={s.id ?? `${idx}`} stop={s} idx={idx} count={props.stops.length}
              onEdit={(patch) => { if (s.id) props.onEditStop(s.id, patch); }}
              onSearch={() => { if (s.id) props.onSearchStop(s.id); }}
              onRemove={() => { if (s.id) props.onRemoveStop(s.id); }}
              onMoveUp={() => props.onReorderStop(idx, idx - 1)}
              onMoveDown={() => props.onReorderStop(idx, idx + 1)}
              onUseMyLocation={s.type === "start" ? props.onUseMyLocation : undefined}
            />
          ))}
        </div>

        <div className="trip-actions" style={{ gridTemplateColumns: "1fr 1fr" }}>
          <button type="button" onClick={() => props.onAddStop("poi")} className="trip-interactive trip-btn trip-btn-secondary">
            + Add stop
          </button>
          <button type="button" onClick={props.onBuildRoute} disabled={!props.canBuildRoute || props.routing} className="trip-interactive trip-btn trip-btn-primary">
            {props.routing ? "Routing…" : "Build route"}
          </button>
        </div>

        <div className="trip-panel">
          <div className="trip-row-between">
            <div>
              <div className="trip-h2">Offline Bundle</div>
              <div className="trip-muted-small" style={{ marginTop: 2 }}>
                Status: <span style={{ opacity: 0.95, fontWeight: 700 }}>{phaseLabel(props.offlinePhase)}</span>{" "}
                {props.savedOffline ? <span className="trip-badge trip-badge-ok" style={{ marginLeft: 6 }}>Saved ✅</span> : null}
              </div>
            </div>

            <button type="button" onClick={props.onResetOffline} disabled={offlineBusy || props.savingOffline} className="trip-interactive trip-btn-sm trip-btn-secondary">
              Reset
            </button>
          </div>

          <div className="trip-actions" style={{ gridTemplateColumns: "1fr 1fr 1fr" }}>
            <button type="button" onClick={props.onBuildOffline} disabled={!props.canBuildRoute || offlineBusy || props.savingOffline} className="trip-interactive trip-btn trip-btn-secondary">
              {offlineBusy ? "Building…" : "Build"}
            </button>

            <button type="button" onClick={props.onSaveOffline} disabled={!props.canDownloadOffline || props.savingOffline} className="trip-interactive trip-btn trip-btn-secondary">
              {props.savingOffline ? "Saving…" : props.savedOffline ? "Saved" : "Save"}
            </button>

            <button type="button" onClick={props.onDownloadOffline} disabled={!props.canDownloadOffline || props.savingOffline} className="trip-interactive trip-btn trip-btn-primary">
              Download zip
            </button>
          </div>

          {props.offlineManifest ? (
            <div className="trip-kv-row" style={{ marginTop: 4 }}>
              <div className="trip-kv"><div className="trip-kv-k">plan_id</div><div className="trip-kv-v">{props.offlineManifest.plan_id}</div></div>
              <div className="trip-kv"><div className="trip-kv-k">route_key</div><div className="trip-kv-v">{props.offlineManifest.route_key}</div></div>
              <div className="trip-kv"><div className="trip-kv-k">corridor</div><div className="trip-kv-v">{props.offlineManifest.corridor_status ?? "—"}</div></div>
              <div className="trip-kv"><div className="trip-kv-k">places</div><div className="trip-kv-v">{props.offlineManifest.places_status ?? "—"}</div></div>
              <div className="trip-kv"><div className="trip-kv-k">traffic</div><div className="trip-kv-v">{props.offlineManifest.traffic_status ?? "—"}</div></div>
              <div className="trip-kv"><div className="trip-kv-k">hazards</div><div className="trip-kv-v">{props.offlineManifest.hazards_status ?? "—"}</div></div>
            </div>
          ) : null}

          {props.offlineError ? <div className="trip-err-box">{props.offlineError}</div> : null}
        </div>

        {props.error ? <div className="trip-err-box">{props.error}</div> : null}
      </div>
    </div>
  );
}