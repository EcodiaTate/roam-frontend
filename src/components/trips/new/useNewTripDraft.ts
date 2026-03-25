// src/components/trips/new/useNewTripDraft.ts

import { useCallback, useEffect, useMemo, useState } from "react";
import type { TripStop, TripStopType, TripPreferences } from "@/lib/types/trip";
import { DEFAULT_TRIP_PREFS } from "@/lib/types/trip";
import { shortId } from "@/lib/utils/ids";
import type { NavCoord } from "@/lib/types/geo";
import { useGeolocation, getCurrentPosition } from "@/lib/native/geolocation";

type StopPatch = Partial<Pick<TripStop, "type" | "name" | "lat" | "lng">>;

function ensureStartEnd(stops: TripStop[]): TripStop[] {
  let out = [...stops];
  const hasStart = out.some((s) => s.type === "start");
  const hasEnd = out.some((s) => s.type === "end");

  // Changed name from "Start" and "End" to "" so the input shows true placeholders
  if (!hasStart) out = [{ id: shortId(), type: "start", name: "", lat: -27.4705, lng: 153.0260 }, ...out];
  if (!hasEnd) out = [...out, { id: shortId(), type: "end", name: "", lat: -27.4698, lng: 153.0251 }];
  return out;
}

export function useNewTripDraft() {
  // Defaults are placeholders (Brisbane-ish) so UI isn’t empty.
  // User can tap “Use my location” for Start immediately.
  const [stops, setStops] = useState<TripStop[]>(
    ensureStartEnd([]),
  );

  // Track whether we’ve auto-applied the user’s location to the start stop
  const [autoLocated, setAutoLocated] = useState(false);

  const [profile, setProfile] = useState("drive");
  const [prefs] = useState<Record<string, unknown>>({});
  const [avoid] = useState<string[]>([]);
  const [depart_at] = useState<string | null>(null);

  // Trip preferences - stop density, category toggles
  const [tripPrefs, setTripPrefs] = useState<TripPreferences>({ ...DEFAULT_TRIP_PREFS });

  const [mapCenter, setMapCenter] = useState<NavCoord | null>(null);

  // Track locating state natively in the draft
  const [isLocating, setIsLocating] = useState(false);

  // Live position tracking - starts immediately so map shows the user’s dot
  // and Locate button can resolve instantly from the cached position.
  const geo = useGeolocation({ autoStart: true, hapticOnFix: false });

  const updateStop = useCallback((id: string, patch: StopPatch) => {
    setStops((prev) =>
      prev.map((s) => (s.id === id ? { ...s, ...patch } : s)),
    );
  }, []);

  const addStop = useCallback((type: TripStopType = "poi") => {
    setStops((prev) => {
      const id = shortId();
      const center = mapCenter ?? { lat: prev[0]?.lat ?? -27.47, lng: prev[0]?.lng ?? 153.02 };
      const next: TripStop = { id, type, name: type === "poi" ? "" : type, lat: center.lat, lng: center.lng };

      // insert before end if exists
      const endIdx = prev.findIndex((s) => s.type === "end");
      if (endIdx >= 0) {
        const out = [...prev];
        out.splice(endIdx, 0, next);
        return out;
      }
      return [...prev, next];
    });
  }, [mapCenter]);

  const addStopWithLocation = useCallback(
    (place: { name: string; lat: number; lng: number; type?: TripStopType }) => {
      setStops((prev) => {
        const id = shortId();
        const next: TripStop = {
          id,
          type: place.type ?? "poi",
          name: place.name,
          lat: place.lat,
          lng: place.lng,
        };
        const endIdx = prev.findIndex((s) => s.type === "end");
        if (endIdx >= 0) {
          const out = [...prev];
          out.splice(endIdx, 0, next);
          return out;
        }
        return [...prev, next];
      });
    },
    [],
  );

  const removeStop = useCallback((id: string) => {
    setStops((prev) => {
      const s = prev.find((x) => x.id === id);
      if (!s) return prev;
      // never remove start/end (keep UX stable)
      if (s.type === "start" || s.type === "end") return prev;
      return prev.filter((x) => x.id !== id);
    });
  }, []);

  const reorderStop = useCallback((fromIdx: number, toIdx: number) => {
    setStops((prev) => {
      if (fromIdx < 0 || fromIdx >= prev.length) return prev;
      if (toIdx < 0 || toIdx >= prev.length) return prev;

      // lock start at 0, end at last
      const from = prev[fromIdx];
      const to = prev[toIdx];
      if (!from || !to) return prev;
      if (from.type === "start" || from.type === "end") return prev;
      if (to.type === "start" || to.type === "end") return prev;

      const out = [...prev];
      const [moved] = out.splice(fromIdx, 1);
      out.splice(toIdx, 0, moved);
      return out;
    });
  }, []);

  const useMyLocationForStart = useCallback(async () => {
    const start = stops.find((s) => s.type === "start");
    if (!start?.id) return;

    // If we already have a live position from continuous tracking, use it instantly.
    if (geo.position) {
      const pos = geo.position;
      updateStop(start.id, { lat: pos.lat, lng: pos.lng, name: "My Location" });
      setMapCenter({ lat: pos.lat, lng: pos.lng });
      return;
    }

    setIsLocating(true);
    try {
      const pos = await getCurrentPosition();
      updateStop(start.id, { lat: pos.lat, lng: pos.lng, name: "My Location" });
      setMapCenter({ lat: pos.lat, lng: pos.lng });
    } catch (error) {
      console.warn("Failed to get location:", error);
      throw error;
    } finally {
      setIsLocating(false);
    }
  }, [stops, updateStop, geo.position]);

  // Auto-apply location to start stop once GPS is available on first load,
  // but only if the start stop hasn't been named yet.
  useEffect(() => {
    if (autoLocated) return;
    if (!geo.position) return;
    const start = stops.find((s) => s.type === "start");
    if (!start?.id || start.name) return;
    setAutoLocated(true);
    updateStop(start.id, { lat: geo.position.lat, lng: geo.position.lng, name: "My Location" });
  }, [geo.position, autoLocated, stops, updateStop]);

  const stopSummary = useMemo(() => {
    const n = stops.length;
    const hasStart = stops.some((s) => s.type === "start");
    const hasEnd = stops.some((s) => s.type === "end");
    return { n, hasStart, hasEnd };
  }, [stops]);

  return {
    stops,
    profile,
    prefs,
    avoid,
    depart_at,

    tripPrefs,
    setTripPrefs,

    mapCenter,
    setMapCenter,

    setStops,
    setProfile,
    addStop,
    addStopWithLocation,
    removeStop,
    reorderStop,
    updateStop,

    useMyLocationForStart,
    isLocating,

    userPosition: geo.position,

    stopSummary,
  };
}
