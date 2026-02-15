// src/components/trip/TripSuggestionsPanel.tsx
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { PlaceCategory, PlaceItem, PlacesPack } from "@/lib/types/places";
import { haptic } from "@/lib/native/haptics";

function fmtCat(c: PlaceCategory) { return c.replace(/_/g, " "); }

const DEFAULT_CATS: PlaceCategory[] = [
  "fuel", "camp", "water", "toilet", "town", "grocery", "mechanic",
  "hospital", "pharmacy", "cafe", "restaurant", "fast_food", "park", "beach",
];

function scorePlace(p: PlaceItem) {
  const cat = String(p.category ?? "");
  if (cat === "fuel") return 100;
  if (cat === "town") return 90;
  if (cat === "water") return 85;
  if (cat === "camp") return 80;
  if (cat === "toilet") return 70;
  if (cat === "grocery") return 65;
  if (cat === "mechanic") return 60;
  if (cat === "hospital" || cat === "pharmacy") return 58;
  if (cat === "cafe" || cat === "restaurant" || cat === "fast_food") return 45;
  if (cat === "park" || cat === "beach" || cat === "viewpoint") return 35;
  return 20;
}

export function TripSuggestionsPanel(props: {
  places: PlacesPack;
  focusedPlaceId?: string | null;
  onFocusPlace?: (placeId: string | null) => void;
  onAddStopFromPlace?: (place: PlaceItem) => void;
  enableSearch?: boolean;
  initialCats?: PlaceCategory[];
  maxHeight?: string | number;
}) {
  const items = props.places.items ?? [];
  const [q, setQ] = useState("");
  const [cats, setCats] = useState<Set<PlaceCategory>>(
    new Set(props.initialCats?.length ? props.initialCats : DEFAULT_CATS)
  );

  const listRef = useRef<HTMLDivElement | null>(null);
  const rowRefs = useRef<Map<string, HTMLDivElement>>(new Map());

  const filtered = useMemo(() => {
    const qq = q.trim().toLowerCase();
    const out = items
      .filter((p) => (cats.size ? cats.has(p.category) : true))
      .filter((p) => {
        if (!qq) return true;
        return (p.name ?? "").toLowerCase().includes(qq) || String(p.category ?? "").toLowerCase().includes(qq);
      })
      .slice(0, 1200);

    if (!qq) out.sort((a, b) => scorePlace(b) - scorePlace(a));
    return out.slice(0, 600);
  }, [items, q, cats]);

  useEffect(() => {
    const id = props.focusedPlaceId ?? null;
    if (!id) return;
    const el = rowRefs.current.get(id);
    el?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [props.focusedPlaceId]);

  return (
    <div className="trip-flex-col">
      {/* Header and Search */}
      <div className="trip-flex-row trip-justify-between trip-align-center trip-mb-sm">
        <div>
          <h3 className="trip-title">Library</h3>
          <p className="trip-muted-small trip-mt-xs">{items.length} known locations</p>
        </div>

        {props.enableSearch && (
          <div className="trip-search-box">
            <span className="trip-search-icon">🔍</span>
            <input value={q} onChange={(e) => setQ(e.currentTarget.value)} placeholder="Filter..." className="trip-input-borderless" aria-label="Search places" />
          </div>
        )}
      </div>

      {/* Categories Row (Horizontal Scroll) */}
      <div className="trip-scroll-x trip-mb-sm trip-pb-xs">
        <button type="button" className="trip-pill" data-active={cats.size === DEFAULT_CATS.length} onClick={() => { haptic.selection(); setCats(new Set(DEFAULT_CATS)); }}>All</button>
        <button type="button" className="trip-pill" data-active={cats.size === 0} onClick={() => { haptic.selection(); setCats(new Set()); }}>None</button>
        {DEFAULT_CATS.map((c) => (
          <button key={c} type="button" className="trip-pill" data-active={cats.has(c)} onClick={() => { haptic.selection(); setCats((prev) => { const next = new Set(prev); if (next.has(c)) next.delete(c); else next.add(c); return next; }); }}>
            {fmtCat(c)}
          </button>
        ))}
      </div>

      {/* Results List */}
      <div ref={listRef} className="trip-list-compact" style={{ maxHeight: props.maxHeight ?? "35vh", overflowY: "auto" }}>
        {filtered.length ? (
          filtered.map((p) => {
            const focused = props.focusedPlaceId === p.id;
            return (
              <div key={p.id} ref={(el) => { if (el) rowRefs.current.set(p.id, el); else rowRefs.current.delete(p.id); }}
                role="button" tabIndex={0} className="trip-list-row" data-focused={focused}
                onClick={() => { haptic.selection(); props.onFocusPlace?.(p.id); }}
                onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); haptic.selection(); props.onFocusPlace?.(p.id); } }}>
                
                <div className="trip-list-row-content">
                  <div className="trip-title trip-truncate">{p.name}</div>
                  <div className="trip-muted-small trip-truncate trip-mt-xs">{fmtCat(p.category)} · {p.lat.toFixed(3)}, {p.lng.toFixed(3)}</div>
                </div>

                {props.onAddStopFromPlace && (
                  <button type="button" className="trip-btn-xs trip-btn-secondary" onClick={(e) => { e.stopPropagation(); haptic.tap(); props.onAddStopFromPlace?.(p); }}>
                    + Add
                  </button>
                )}
              </div>
            );
          })
        ) : (
          <div className="trip-empty-state">No matches found. Adjust filters.</div>
        )}
      </div>
    </div>
  );
}