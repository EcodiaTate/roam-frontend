// src/components/trip/TripEditorSheet.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import type { TripStop } from "@/lib/types/trip";
import type { NavPack, CorridorGraphPack } from "@/lib/types/navigation";
import type { PlacesPack, PlaceItem, PlaceCategory } from "@/lib/types/places";
import { shortId } from "@/lib/utils/ids";
import { haptic } from "@/lib/native/haptics";
import { hideKeyboard } from "@/lib/native/keyboard";

import { TripSuggestionsPanel } from "@/components/trip/TripSuggestionsPanel";

export type TripEditorRebuildMode = "auto" | "online" | "offline";

function ensureStopIds(stops: TripStop[]): TripStop[] {
  return (stops ?? []).map((s) => (s.id ? s : { ...s, id: shortId() }));
}

function isLockedStop(s: TripStop) {
  const t = s.type ?? "poi";
  return t === "start" || t === "end";
}

function stopLabel(s: TripStop, idx: number) {
  const t = s.type ?? "poi";
  const name = s.name?.trim();
  if (name) return name;
  if (t === "start") return "Start";
  if (t === "end") return "End";
  return `Stop ${idx}`;
}

export function TripEditorSheet(props: {
  planId: string;
  navpack: NavPack;
  corridor: CorridorGraphPack;
  places?: PlacesPack | null;

  focusedStopId?: string | null;
  onFocusStop?: (stopId: string | null) => void;
  onRebuildRequested: (args: { stops: TripStop[]; mode: TripEditorRebuildMode }) => Promise<void>;
  setBusy?: (v: string | null) => void;
  setErr?: (v: string | null) => void;
  allowModeToggle?: boolean;
  onAddSuggestion?: (place: PlaceItem) => Promise<void> | void;
  focusedPlaceId?: string | null;
  onFocusPlace?: (placeId: string | null) => void;
}) {
  const [stops, setStops] = useState<TripStop[]>(() => ensureStopIds(props.navpack.req?.stops ?? []));
  const [dirty, setDirty] = useState(false);
  const [busyLocal, setBusyLocal] = useState<string | null>(null);
  const [errLocal, setErrLocal] = useState<string | null>(null);

  const [showSuggestions, setShowSuggestions] = useState(false);
  const [mode, setMode] = useState<TripEditorRebuildMode>("auto");

  useEffect(() => {
    setStops(ensureStopIds(props.navpack.req?.stops ?? []));
    setDirty(false);
    setErrLocal(null);
  }, [props.navpack]);

  const canRebuild = stops.length >= 2 && !!props.corridor;

  const setBusy = (v: string | null) => {
    setBusyLocal(v);
    props.setBusy?.(v);
  };
  const setErr = (v: string | null) => {
    setErrLocal(v);
    props.setErr?.(v);
  };

  const moveStop = (fromIdx: number, dir: -1 | 1) => {
    haptic.selection();
    setStops((prev) => {
      const toIdx = fromIdx + dir;
      if (fromIdx <= 0 || fromIdx >= prev.length) return prev;
      if (toIdx <= 0 || toIdx >= prev.length - 1) return prev;
      const from = prev[fromIdx];
      const to = prev[toIdx];
      if (!from || !to || isLockedStop(from) || isLockedStop(to)) return prev;
      
      const out = [...prev];
      const [moved] = out.splice(fromIdx, 1);
      out.splice(toIdx, 0, moved);
      return out;
    });
    setDirty(true);
  };

  const removeStop = (id?: string | null) => {
    if (!id) return;
    haptic.medium();
    setStops((prev) => {
      const s = prev.find((x) => x.id === id);
      if (!s || isLockedStop(s)) return prev;
      return prev.filter((x) => x.id !== id);
    });
    if (props.focusedStopId === id) props.onFocusStop?.(null);
    setDirty(true);
  };

  const addStopFromPlaceLocally = (p: PlaceItem) => {
    haptic.tap();
    setStops((prev) => {
      const out = [...prev];
      const endIdx = out.findIndex((s) => (s.type ?? "poi") === "end");
      const next: TripStop = { id: shortId(), type: "poi", name: p.name, lat: p.lat, lng: p.lng };
      if (endIdx >= 0) out.splice(endIdx, 0, next); else out.push(next);
      return out;
    });
    setDirty(true);
    hideKeyboard();
  };

  const reset = () => {
    haptic.tap();
    setStops(ensureStopIds(props.navpack.req?.stops ?? []));
    setDirty(false);
    setErr(null);
  };

  const rebuild = async () => {
    if (!canRebuild) return;
    haptic.medium();
    hideKeyboard();
    setBusy("edit_rebuild");
    setErr(null);
    try {
      await props.onRebuildRequested({ stops: ensureStopIds(stops), mode });
      setDirty(false);
      haptic.success();
      setShowSuggestions(false);
    } catch (e: any) {
      setErr(e?.message ?? "Rebuild failed");
      haptic.error();
    } finally {
      setBusy(null);
    }
  };

  const summary = useMemo(() => ({ stops: stops.length, places: props.places?.items?.length ?? 0 }), [stops.length, props.places]);

  return (
    <div className="trip-flex-col trip-gap-md">
      {/* Editor Header */}
      <div className="trip-flex-row trip-justify-between trip-align-center">
        <div>
          <h3 className="trip-title">Route Planner</h3>
          <div className="trip-muted-small trip-mt-xs">
            {dirty ? <span className="trip-badge trip-badge-warning">Unsaved changes</span> : `${summary.stops} stops total`}
          </div>
        </div>

        <div className="trip-flex-row trip-align-center trip-gap-xs">
          
          <button type="button" className="trip-btn-xs trip-btn-secondary" disabled={!!busyLocal}
            onClick={() => { haptic.tap(); setShowSuggestions((v) => !v); hideKeyboard(); }}>
            {showSuggestions ? "Cancel Add" : "+ Add Stop"}
          </button>
        </div>
      </div>

      {errLocal && <div className="trip-err-box">{errLocal}</div>}

      {/* Editor Stops List */}
      <div className="trip-list-compact trip-bordered-list">
        {stops.map((s, idx) => {
          const locked = isLockedStop(s);
          const focused = props.focusedStopId === s.id;

          return (
            <div key={s.id ?? `${idx}`} className="trip-list-row" data-focused={focused} onClick={() => { haptic.selection(); props.onFocusStop?.(s.id ?? null); }}>
              <div className={`trip-badge-dot ${locked ? "dot-locked" : "dot-free"}`}>{idx + 1}</div>
              
              <div className="trip-list-row-content">
                <div className="trip-title trip-truncate">{stopLabel(s, idx)}</div>
                <div className="trip-muted-small trip-truncate trip-mt-xs">{s.lat.toFixed(4)}, {s.lng.toFixed(4)}</div>
              </div>

              {/* Action Buttons */}
              <div className="trip-flex-row trip-gap-xs">
                {!locked && idx > 1 && (
                  <button type="button" className="trip-btn-icon" disabled={!!busyLocal} onClick={(e) => { e.stopPropagation(); moveStop(idx, -1); }}>↑</button>
                )}
                {!locked && idx < stops.length - 2 && (
                  <button type="button" className="trip-btn-icon" disabled={!!busyLocal} onClick={(e) => { e.stopPropagation(); moveStop(idx, +1); }}>↓</button>
                )}
                {!locked && (
                  <button type="button" className="trip-btn-icon icon-danger" disabled={!!busyLocal} onClick={(e) => { e.stopPropagation(); removeStop(s.id); }}>✕</button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Embedded Suggestions Drawer */}
      {showSuggestions && props.places && (
        <div className="trip-panel trip-panel-inset">
          <TripSuggestionsPanel
            places={props.places}
            enableSearch={true}
            maxHeight="30vh"
            focusedPlaceId={props.focusedPlaceId ?? null}
            onFocusPlace={props.onFocusPlace}
            onAddStopFromPlace={(p) => {
              if (props.onAddSuggestion) {
                haptic.tap(); props.onAddSuggestion(p); setShowSuggestions(false);
              } else {
                addStopFromPlaceLocally(p);
              }
            }}
          />
          <p className="trip-muted-small trip-mt-sm">
            <strong>Tip:</strong> Use the Guide tab to ask for specific spots and they will sync here.
          </p>
        </div>
      )}

      {/* Footer Actions */}
      <div className="trip-action-grid">
        <button type="button" className="trip-btn trip-btn-ghost" disabled={!!busyLocal || !dirty} onClick={reset}>Reset</button>
        <button type="button" className="trip-btn trip-btn-primary" disabled={!!busyLocal || !dirty || !canRebuild} onClick={rebuild}>Save Route</button>
      </div>
    </div>
  );
}