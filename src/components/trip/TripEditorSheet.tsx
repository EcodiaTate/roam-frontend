"use client";

import { useEffect, useMemo, useState } from "react";
import type { TripStop, TripStopType } from "@/lib/types/trip";
import type { NavPack, CorridorGraphPack } from "@/lib/types/navigation";
import type { PlacesPack, PlaceItem, PlaceCategory } from "@/lib/types/places";
import { shortId } from "@/lib/utils/ids";

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

function fmtCat(c: PlaceCategory) { return c.replace(/_/g, " "); }

const DEFAULT_CATS: PlaceCategory[] = ["fuel", "camp", "water", "toilet", "town", "grocery", "mechanic", "hospital", "pharmacy", "cafe", "restaurant", "fast_food", "park", "beach"];

export function TripEditorSheet(props: {
  planId: string; navpack: NavPack; corridor: CorridorGraphPack; places?: PlacesPack | null;
  focusedStopId?: string | null; onFocusStop?: (stopId: string | null) => void;
  onRebuildRequested: (args: { stops: TripStop[]; mode: TripEditorRebuildMode }) => Promise<void>;
  setBusy?: (v: string | null) => void; setErr?: (v: string | null) => void;
  allowModeToggle?: boolean;
}) {
  const [stops, setStops] = useState<TripStop[]>(() => ensureStopIds(props.navpack.req?.stops ?? []));
  const [dirty, setDirty] = useState(false);
  const [busyLocal, setBusyLocal] = useState<string | null>(null);
  const [errLocal, setErrLocal] = useState<string | null>(null);

  const [showPlaces, setShowPlaces] = useState(false);
  const [q, setQ] = useState("");
  const [cats, setCats] = useState<Set<PlaceCategory>>(new Set(DEFAULT_CATS));
  const [mode, setMode] = useState<TripEditorRebuildMode>("auto");

  useEffect(() => {
    setStops(ensureStopIds(props.navpack.req?.stops ?? []));
    setDirty(false); setErrLocal(null);
  }, [props.navpack]);

  const placesItems = props.places?.items ?? [];

  const filteredPlaces = useMemo(() => {
    const qq = q.trim().toLowerCase();
    return placesItems
      .filter((p) => (cats.size ? cats.has(p.category) : true))
      .filter((p) => {
        if (!qq) return true;
        const n = (p.name ?? "").toLowerCase();
        const c = (p.category ?? "").toLowerCase();
        return n.includes(qq) || c.includes(qq);
      }).slice(0, 400);
  }, [placesItems, q, cats]);

  const canRebuild = stops.length >= 2 && !!props.corridor;

  const setBusy = (v: string | null) => { setBusyLocal(v); props.setBusy?.(v); };
  const setErr = (v: string | null) => { setErrLocal(v); props.setErr?.(v); };

  const moveStop = (fromIdx: number, dir: -1 | 1) => {
    setStops((prev) => {
      const toIdx = fromIdx + dir;
      if (fromIdx <= 0 || fromIdx >= prev.length) return prev;
      if (toIdx <= 0 || toIdx >= prev.length - 1) return prev;
      const from = prev[fromIdx]; const to = prev[toIdx];
      if (!from || !to) return prev;
      if (isLockedStop(from) || isLockedStop(to)) return prev;

      const out = [...prev];
      const [moved] = out.splice(fromIdx, 1);
      out.splice(toIdx, 0, moved);
      return out;
    });
    setDirty(true);
  };

  const removeStop = (id?: string | null) => {
    if (!id) return;
    setStops((prev) => {
      const s = prev.find((x) => x.id === id);
      if (!s || isLockedStop(s)) return prev;
      return prev.filter((x) => x.id !== id);
    });
    if (props.focusedStopId === id) props.onFocusStop?.(null);
    setDirty(true);
  };

  const pickPlace = (p: PlaceItem) => {
    setStops((prev) => {
      const out = [...prev];
      const endIdx = out.findIndex((s) => (s.type ?? "poi") === "end");
      const next: TripStop = { id: shortId(), type: "poi", name: p.name, lat: p.lat, lng: p.lng };
      if (endIdx >= 0) out.splice(endIdx, 0, next); else out.push(next);
      return out;
    });
    setDirty(true); setShowPlaces(false);
  };

  const reset = () => { setStops(ensureStopIds(props.navpack.req?.stops ?? [])); setDirty(false); setErr(null); };

  const rebuild = async () => {
    if (!canRebuild) return;
    setBusy("edit_rebuild"); setErr(null);
    try {
      const withIds = ensureStopIds(stops);
      await props.onRebuildRequested({ stops: withIds, mode });
      setDirty(false);
    } catch (e: any) { setErr(e?.message ?? "Rebuild failed"); } 
    finally { setBusy(null); }
  };

  return (
    <div style={{ display: "grid", gap: 10 }}>
      <div className="trip-row-between">
        <div>
          <div className="trip-title">Edit stops</div>
          <div className="trip-muted-small" style={{ marginTop: 2 }}>
            {dirty ? <span className="trip-badge trip-badge-soft">Unsaved changes</span> : <span style={{ opacity: 0.75 }}>Ready</span>}
          </div>
        </div>

        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          {props.allowModeToggle ? (
            <select value={mode} onChange={(e) => setMode(e.currentTarget.value as TripEditorRebuildMode)} className="trip-interactive trip-select" disabled={!!busyLocal} title="Rebuild Mode">
              <option value="auto">Auto</option><option value="online">Online</option><option value="offline">Offline</option>
            </select>
          ) : null}
          <button type="button" className="trip-interactive trip-btn-sm" disabled={!!busyLocal} onClick={() => setShowPlaces(true)} title={props.places ? "Add stop from stored places" : "No places pack in this bundle"}>
            + Place
          </button>
          <button type="button" className="trip-interactive trip-btn-sm trip-btn-primary" disabled={!!busyLocal || !dirty || !canRebuild} onClick={rebuild}>
            Rebuild
          </button>
        </div>
      </div>

      {errLocal ? <div className="trip-err-box">{errLocal}</div> : null}

      <div className="trip-list-container trip-editor-list">
        {stops.map((s, idx) => {
          const locked = isLockedStop(s);
          const focused = props.focusedStopId && s.id === props.focusedStopId;

          return (
            <div key={s.id ?? `${idx}`} className="trip-interactive trip-editor-row" data-focused={focused} onClick={() => props.onFocusStop?.(s.id ?? null)}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0, flex: 1 }}>
                <div className={`trip-badge ${locked ? 'trip-badge-blue' : 'trip-badge-soft'}`}>{(s.type ?? "poi").toUpperCase()}</div>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div className="trip-title trip-truncate" style={{ fontSize: 13 }}>{stopLabel(s, idx)}</div>
                  <div className="trip-muted-small trip-truncate">{s.lat.toFixed(4)}, {s.lng.toFixed(4)}</div>
                </div>
              </div>

              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <button type="button" className="trip-interactive trip-btn-icon" disabled={locked || idx <= 1 || !!busyLocal} onClick={(e) => { e.stopPropagation(); moveStop(idx, -1); }}>↑</button>
                <button type="button" className="trip-interactive trip-btn-icon" disabled={locked || idx >= stops.length - 2 || !!busyLocal} onClick={(e) => { e.stopPropagation(); moveStop(idx, +1); }}>↓</button>
                <button type="button" className="trip-interactive trip-btn-icon" disabled={locked || !!busyLocal} style={{ opacity: locked ? 0.4 : 1 }} onClick={(e) => { e.stopPropagation(); removeStop(s.id); }}>✕</button>
              </div>
            </div>
          );
        })}
      </div>

      <div style={{ display: "flex", gap: 10, alignItems: "center", marginTop: 2 }}>
        <button type="button" className="trip-interactive trip-btn-sm" disabled={!!busyLocal || !dirty} onClick={reset}>Reset</button>
        <div style={{ flex: 1 }} />
        <button type="button" className="trip-interactive trip-btn-sm" disabled={!!busyLocal} onClick={() => props.onFocusStop?.(null)}>Unfocus</button>
      </div>

      {showPlaces ? (
        <div className="trip-modal-overlay" onClick={() => setShowPlaces(false)}>
          <div className="trip-modal" onClick={(e) => e.stopPropagation()}>
            <div className="trip-row-between">
              <div>
                <div className="trip-h2">Add stop from places</div>
                <div className="trip-muted-small">{placesItems.length ? `${placesItems.length} places in this bundle` : "No places in this bundle"}</div>
              </div>
              <button type="button" className="trip-interactive trip-btn-icon" onClick={() => setShowPlaces(false)}>✕</button>
            </div>

            <input value={q} onChange={(e) => setQ(e.currentTarget.value)} placeholder="Search…" className="trip-search" autoFocus />

            <div className="trip-cat-row">
              {DEFAULT_CATS.map((c) => (
                <button key={c} type="button" className={`trip-interactive trip-pill-btn`} data-active={cats.has(c)}
                  onClick={() => { setCats((prev) => { const next = new Set(prev); if (next.has(c)) next.delete(c); else next.add(c); return next; }); }}>
                  {fmtCat(c)}
                </button>
              ))}
            </div>

            <div className="trip-list-container" style={{ maxHeight: "40vh" }}>
              {filteredPlaces.length ? (
                filteredPlaces.map((p) => (
                  <button key={p.id} type="button" className="trip-interactive trip-list-row" onClick={() => pickPlace(p)}>
                    <div style={{ textAlign: "left" }}>
                      <div className="trip-title" style={{ fontSize: 13 }}>{p.name}</div>
                      <div className="trip-muted-small">{fmtCat(p.category)} · {p.lat.toFixed(3)}, {p.lng.toFixed(3)}</div>
                    </div>
                  </button>
                ))
              ) : <div className="trip-empty">No matches.</div>}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}