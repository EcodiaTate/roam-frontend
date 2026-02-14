"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { PlaceCategory, PlaceItem, PlacesPack } from "@/lib/types/places";

function fmtCat(c: PlaceCategory) {
  return c.replace(/_/g, " ");
}

const DEFAULT_CATS: PlaceCategory[] = [
  "fuel", "camp", "water", "toilet", "town", "grocery", "mechanic",
  "hospital", "pharmacy", "cafe", "restaurant", "fast_food", "park", "beach",
];

export function TripSuggestionsPanel(props: {
  places: PlacesPack;
  focusedPlaceId?: string | null;
  onFocusPlace?: (placeId: string | null) => void;
  onAddStopFromPlace?: (place: PlaceItem) => void;
  enableSearch?: boolean;
  initialCats?: PlaceCategory[];
}) {
  const items = props.places.items ?? [];

  const [q, setQ] = useState("");
  const [cats, setCats] = useState<Set<PlaceCategory>>(
    new Set(props.initialCats?.length ? props.initialCats : DEFAULT_CATS)
  );

  const listRef = useRef<HTMLDivElement | null>(null);
  const rowRefs = useRef<Map<string, HTMLButtonElement>>(new Map());

  const filtered = useMemo(() => {
    const qq = q.trim().toLowerCase();
    return items
      .filter((p) => (cats.size ? cats.has(p.category) : true))
      .filter((p) => {
        if (!qq) return true;
        const n = (p.name ?? "").toLowerCase();
        const c = (p.category ?? "").toLowerCase();
        return n.includes(qq) || c.includes(qq);
      })
      .slice(0, 600);
  }, [items, q, cats]);

  // When focusedPlaceId changes (e.g. map click), scroll it into view
  useEffect(() => {
    const id = props.focusedPlaceId ?? null;
    if (!id) return;
    const el = rowRefs.current.get(id);
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [props.focusedPlaceId]);

  const toggleCat = (c: PlaceCategory) => {
    setCats((prev) => {
      const next = new Set(prev);
      if (next.has(c)) next.delete(c);
      else next.add(c);
      return next;
    });
  };

  const selectAll = () => setCats(new Set(DEFAULT_CATS));
  const clearAll = () => setCats(new Set());

  return (
    <div style={{ display: "grid", gap: 10 }}>
      <div className="trip-row-between">
        <div>
          <div className="trip-title">Suggestions</div>
          <div className="trip-muted-small">{items.length} packed places</div>
        </div>

        {props.enableSearch ? (
          <input
            value={q}
            onChange={(e) => setQ(e.currentTarget.value)}
            placeholder="Search…"
            className="trip-search"
            style={{ width: 180 }}
          />
        ) : null}
      </div>

      <div className="trip-cat-row">
        <button type="button" className="trip-interactive trip-pill-btn" data-active={cats.size === DEFAULT_CATS.length} onClick={selectAll}>
          All
        </button>
        <button type="button" className="trip-interactive trip-pill-btn" data-active={cats.size === 0} onClick={clearAll}>
          None
        </button>

        {DEFAULT_CATS.map((c) => {
          const on = cats.has(c);
          return (
            <button key={c} type="button" className="trip-interactive trip-pill-btn" data-active={on} onClick={() => toggleCat(c)}>
              {fmtCat(c)}
            </button>
          );
        })}
      </div>

      <div ref={listRef} className="trip-list-container trip-places-list">
        {filtered.length ? (
          filtered.map((p) => {
            const focused = props.focusedPlaceId === p.id;
            return (
              <button
                key={p.id}
                ref={(el) => {
                  if (el) rowRefs.current.set(p.id, el);
                  else rowRefs.current.delete(p.id);
                }}
                type="button"
                className="trip-interactive trip-list-row"
                data-focused={focused}
                onClick={() => props.onFocusPlace?.(p.id)}
              >
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div className="trip-title trip-truncate" style={{ fontSize: 13 }}>{p.name}</div>
                  <div className="trip-muted-small trip-truncate">
                    {fmtCat(p.category)} · {p.lat.toFixed(3)}, {p.lng.toFixed(3)}
                  </div>
                </div>

                {props.onAddStopFromPlace ? (
                  <button
                    type="button"
                    className="trip-interactive trip-btn-sm"
                    onClick={(e) => {
                      e.stopPropagation();
                      props.onAddStopFromPlace?.(p);
                    }}
                  >
                    + Add
                  </button>
                ) : null}
              </button>
            );
          })
        ) : (
          <div className="trip-empty">No matches.</div>
        )}
      </div>
    </div>
  );
}