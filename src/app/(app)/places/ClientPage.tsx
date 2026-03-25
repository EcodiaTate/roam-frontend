// src/app/(app)/places/ClientPage.tsx
//
// Standalone "Places" screen.  Shows a MapLibre map of all saved spots
// with a bottom sheet list.  Tapping a pin selects it; tapping a row
// in the list flies to it on the map.  "Add to trip" navigates to /new
// with the place pre-loaded via query params.

import { useState, useCallback, useRef } from "react";
import { lazy, Suspense } from "react";
import { useNavigate } from "react-router";
import { Map as MapIcon, Plus, Trash2, StickyNote } from "lucide-react";
import { useSavedPlaces } from "@/lib/hooks/useSavedPlaces";
import { SavedPlacesPanel } from "@/components/places/SavedPlacesPanel";
import type { SavedPlace } from "@/lib/offline/savedPlacesStore";
import { haptic } from "@/lib/native/haptics";

// Lazy-load the map to avoid bundling MapLibre eagerly
const SavedPlacesMap = lazy(
  () =>
    import("@/components/places/SavedPlacesMap").then((m) => ({
      default: m.SavedPlacesMap,
    }))
);

// ── View modes ─────────────────────────────────────────────────────────────

type ViewMode = "map" | "list" | "split";

// ── Component ──────────────────────────────────────────────────────────────

export function PlacesClientPage({
  viewMode: externalViewMode,
  setViewMode: externalSetViewMode,
}: {
  viewMode?: ViewMode;
  setViewMode?: (mode: ViewMode) => void;
} = {}) {
  const router = useNavigate();
  const { places, isLoading, removeSaved, updateNote } = useSavedPlaces();
  const [internalViewMode, setInternalViewMode] = useState<ViewMode>("split");
  const viewMode = externalViewMode ?? internalViewMode;
  const setViewMode = externalSetViewMode ?? setInternalViewMode;
  const [selectedPlace, setSelectedPlace] = useState<SavedPlace | null>(null);
  const mapFlyRef = useRef<((place: SavedPlace) => void) | null>(null);

  // Called from the list → fly map to place
  const handleListRowTap = useCallback((place: SavedPlace) => {
    haptic.selection();
    setSelectedPlace(place);
    if (viewMode === "split" || viewMode === "map") {
      mapFlyRef.current?.(place);
    }
  }, [viewMode]);

  // Called from the map pin → scroll list to highlight
  const handleMapSelect = useCallback((place: SavedPlace) => {
    haptic.selection();
    setSelectedPlace(place);
  }, []);

  // Add to trip: navigate to /new with place as initial stop
  const handleAddToTrip = useCallback((place: SavedPlace) => {
    haptic.medium();
    router(
      `/new?add_place_id=${encodeURIComponent(place.place_id)}&add_name=${encodeURIComponent(place.name)}&add_lat=${place.lat}&add_lng=${place.lng}&add_cat=${encodeURIComponent(place.category)}`,
    );
  }, [router]);

  const showMap = viewMode === "map" || viewMode === "split";
  const showList = viewMode === "list" || viewMode === "split";

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        background: "var(--roam-bg)",
        overflow: "hidden",
      }}
    >
      {/* ── Body ──────────────────────────────────────────────────── */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0 }}>
        {/* Map */}
        {showMap && (
          <div
            style={{
              flex: viewMode === "map" ? 1 : viewMode === "split" ? "0 0 45%" : 0,
              minHeight: 0,
              overflow: "hidden",
              position: "relative",
            }}
          >
            {places.length === 0 && !isLoading ? (
              <EmptyMapPlaceholder />
            ) : (
              <Suspense fallback={null}>
                <SavedPlacesMap
                  places={places}
                  onSelectPlace={handleMapSelect}
                />
              </Suspense>
            )}
          </div>
        )}

        {/* Selected place mini card */}
        {selectedPlace && viewMode !== "list" && (
          <SelectedPlaceCard
            place={selectedPlace}
            onAddToTrip={() => handleAddToTrip(selectedPlace)}
            onDismiss={() => setSelectedPlace(null)}
          />
        )}

        {/* List */}
        {showList && (
          <div
            style={{
              flex: viewMode === "list" ? 1 : viewMode === "split" ? 1 : 0,
              minHeight: 0,
              overflow: "hidden",
              borderTop: viewMode === "split" ? "1px solid var(--roam-border)" : "none",
            }}
          >
            <SavedPlacesPanel
              places={places}
              isLoading={isLoading}
              onAddToTrip={handleAddToTrip}
              onRemove={removeSaved}
              onUpdateNote={updateNote}
              onShowOnMap={handleListRowTap}
              maxHeight="100%"
            />
          </div>
        )}
      </div>
    </div>
  );
}

// ── Empty map placeholder ─────────────────────────────────────────────────

function EmptyMapPlaceholder() {
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 12,
        background: "var(--roam-surface-hover)",
        color: "var(--roam-text-muted)",
      }}
    >
      <MapIcon size={36} opacity={0.25} />
      <span style={{ fontSize: 13, fontWeight: 600 }}>
        Save places to see them on the map
      </span>
    </div>
  );
}

// ── Selected place card (shows above list in split mode) ──────────────────

function SelectedPlaceCard({
  place,
  onAddToTrip,
  onDismiss,
}: {
  place: SavedPlace;
  onAddToTrip: () => void;
  onDismiss: () => void;
}) {
  return (
    <div
      style={{
        background: "var(--roam-surface)",
        borderTop: "1px solid var(--roam-border)",
        padding: "12px 16px",
        display: "flex",
        alignItems: "center",
        gap: 12,
        flexShrink: 0,
      }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontSize: 14,
            fontWeight: 700,
            color: "var(--roam-text)",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {place.name}
        </div>
        {place.note && (
          <div
            style={{
              fontSize: 12,
              color: "var(--roam-text-muted)",
              fontWeight: 500,
              marginTop: 2,
              fontStyle: "italic",
            }}
          >
            {place.note.length > 60 ? `${place.note.slice(0, 60)}…` : place.note}
          </div>
        )}
      </div>
      <button
        type="button"
        onClick={onAddToTrip}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 5,
          padding: "10px 12px",
          minHeight: 44,
          borderRadius: 10,
          border: "none",
          background: "var(--roam-accent)",
          color: "var(--on-color)",
          fontSize: 13,
          fontWeight: 700,
          cursor: "pointer",
          flexShrink: 0,
          touchAction: "manipulation",
          WebkitTapHighlightColor: "transparent",
        }}
      >
        <Plus size={13} />
        Add to trip
      </button>
      <button
        type="button"
        onClick={onDismiss}
        style={{
          background: "var(--roam-surface-hover)",
          border: "none",
          borderRadius: 10,
          width: 40,
          height: 40,
          display: "grid",
          placeItems: "center",
          cursor: "pointer",
          color: "var(--roam-text-muted)",
          flexShrink: 0,
        }}
        aria-label="Dismiss"
      >
        ×
      </button>
    </div>
  );
}
