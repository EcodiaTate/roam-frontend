// src/components/trips/new/useNewTripDraft.ts
"use client";

import { useCallback, useMemo, useState } from "react";
import type { TripStop, TripStopType } from "@/lib/types/trip";
import { shortId } from "@/lib/utils/ids";
import type { NavCoord } from "@/lib/types/geo";

type StopPatch = Partial<Pick<TripStop, "type" | "name" | "lat" | "lng">>;

function ensureStartEnd(stops: TripStop[]): TripStop[] {
  let out = [...stops];
  const hasStart = out.some((s) => s.type === "start");
  const hasEnd = out.some((s) => s.type === "end");

  if (!hasStart) out = [{ id: shortId(), type: "start", name: "Start", lat: -27.4705, lng: 153.0260 }, ...out];
  if (!hasEnd) out = [...out, { id: shortId(), type: "end", name: "End", lat: -27.4698, lng: 153.0251 }];
  return out;
}

export function useNewTripDraft() {
  // Defaults are placeholders (Brisbane-ish) so UI isn’t empty.
  // User can tap “Use my location” for Start immediately.
  const [stops, setStops] = useState<TripStop[]>(
    ensureStartEnd([]),
  );

  const [profile, setProfile] = useState<string>("drive");
  const [prefs] = useState<Record<string, any>>({});
  const [avoid] = useState<string[]>([]);
  const [depart_at] = useState<string | null>(null);

  const [mapCenter, setMapCenter] = useState<NavCoord | null>(null);

  const updateStop = useCallback((id: string, patch: StopPatch) => {
    setStops((prev) =>
      prev.map((s) => (s.id === id ? { ...s, ...patch } : s)),
    );
  }, []);

  const addStop = useCallback((type: TripStopType = "poi") => {
    setStops((prev) => {
      const id = shortId();
      const center = mapCenter ?? { lat: prev[0]?.lat ?? -27.47, lng: prev[0]?.lng ?? 153.02 };
      const next: TripStop = { id, type, name: type === "poi" ? "Stop" : type, lat: center.lat, lng: center.lng };

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

    if (!("geolocation" in navigator)) return;

    const pos = await new Promise<GeolocationPosition>((resolve, reject) => {
      navigator.geolocation.getCurrentPosition(resolve, reject, {
        enableHighAccuracy: true,
        timeout: 8000,
        maximumAge: 5000,
      });
    });

    updateStop(start.id, {
      lat: pos.coords.latitude,
      lng: pos.coords.longitude,
      name: "My location",
    });
    setMapCenter({ lat: pos.coords.latitude, lng: pos.coords.longitude });
  }, [stops, updateStop]);

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

    mapCenter,
    setMapCenter,

    setStops,
    setProfile,
    addStop,
    removeStop,
    reorderStop,
    updateStop,
    useMyLocationForStart,

    stopSummary,
  };
}
