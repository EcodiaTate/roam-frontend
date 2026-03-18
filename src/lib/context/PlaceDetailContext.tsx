// src/lib/context/PlaceDetailContext.tsx
//
// Global context for managing the "currently viewed place" detail sheet.
// Any component anywhere in the tree can open/close the sheet by calling
// openPlace(place) / closePlace().
//
// Usage:
//   const { openPlace } = usePlaceDetail();
//   openPlace(discoveredPlace);

"use client";

import { createContext, useContext, useState, useCallback, type ReactNode } from "react";
import type { PlaceItem } from "@/lib/types/places";
import type { DiscoveredPlace } from "@/lib/types/guide";

export type PlaceDetailEntry = (PlaceItem | DiscoveredPlace) & {
  /** km from the user's current position */
  distance_from_user_km?: number | null;
  /** km from the start of the trip */
  km_from_start?: number | null;
  /** AI-written guide prose */
  guide_description?: string | null;
};

export type NavigateHandler = (placeId: string, lat: number, lng: number, name: string) => void;
export type SaveHandler = (placeId: string) => void;
export type ShowOnMapHandler = (placeId: string, lat: number, lng: number) => void;

type PlaceDetailContextValue = {
  place: PlaceDetailEntry | null;
  openPlace: (place: PlaceDetailEntry) => void;
  closePlace: () => void;
  /** Registered by pages that can add a place to the itinerary and navigate to /trip */
  navigateHandler: NavigateHandler | null;
  registerNavigateHandler: (handler: NavigateHandler | null) => void;
  /** Registered globally so the sheet can toggle bookmarks from anywhere */
  saveHandler: SaveHandler | null;
  registerSaveHandler: (handler: SaveHandler | null) => void;
  /** Registered by trip page — zooms map to place and closes sheet */
  showOnMapHandler: ShowOnMapHandler | null;
  registerShowOnMapHandler: (handler: ShowOnMapHandler | null) => void;
  /** Set of saved place_ids — kept in sync by the global provider */
  savedIds: Set<string>;
  setSavedIds: (ids: Set<string>) => void;
  /** IDs of places already in the trip — used to show "Already in Trip" */
  stopPlaceIds: Set<string>;
  setStopPlaceIds: (ids: Set<string>) => void;
};

const PlaceDetailContext = createContext<PlaceDetailContextValue | null>(null);

export function PlaceDetailProvider({ children }: { children: ReactNode }) {
  const [place, setPlace] = useState<PlaceDetailEntry | null>(null);
  const [navigateHandler, setNavigateHandler] = useState<NavigateHandler | null>(null);
  const [saveHandler, setSaveHandlerState] = useState<SaveHandler | null>(null);
  const [showOnMapHandler, setShowOnMapHandler] = useState<ShowOnMapHandler | null>(null);
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set());
  const [stopPlaceIds, setStopPlaceIds] = useState<Set<string>>(new Set());

  const openPlace = useCallback((p: PlaceDetailEntry) => {
    setPlace(p);
  }, []);

  const closePlace = useCallback(() => {
    setPlace(null);
  }, []);

  const registerNavigateHandler = useCallback((handler: NavigateHandler | null) => {
    setNavigateHandler(() => handler);
  }, []);

  const registerSaveHandler = useCallback((handler: SaveHandler | null) => {
    setSaveHandlerState(() => handler);
  }, []);

  const registerShowOnMapHandler = useCallback((handler: ShowOnMapHandler | null) => {
    setShowOnMapHandler(() => handler);
  }, []);

  return (
    <PlaceDetailContext.Provider value={{
      place, openPlace, closePlace,
      navigateHandler, registerNavigateHandler,
      saveHandler, registerSaveHandler,
      showOnMapHandler, registerShowOnMapHandler,
      savedIds, setSavedIds,
      stopPlaceIds, setStopPlaceIds,
    }}>
      {children}
    </PlaceDetailContext.Provider>
  );
}

export function usePlaceDetail(): PlaceDetailContextValue {
  const ctx = useContext(PlaceDetailContext);
  if (!ctx) throw new Error("usePlaceDetail must be used inside <PlaceDetailProvider>");
  return ctx;
}
