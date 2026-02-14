"use client";

import { useEffect, useMemo, useState } from "react";
import type { NavCoord } from "@/lib/types/geo";
import { placesApi } from "@/lib/api/places";
import type { PlaceItem } from "@/lib/types/places";

export function PlaceSearchModal(props: {
  open: boolean;
  stopId: string | null;
  mapCenter: NavCoord | null;
  onClose: () => void;
  onPick: (args: { stopId: string; name: string; lat: number; lng: number }) => void;
}) {
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState<PlaceItem[]>([]);
  const [err, setErr] = useState<string | null>(null);

  const enabled = props.open && !!props.stopId;

  useEffect(() => {
    if (!props.open) {
      setQ("");
      setItems([]);
      setErr(null);
    }
  }, [props.open]);

  const canSearch = useMemo(() => q.trim().length >= 2, [q]);

  async function search() {
    if (!enabled) return;
    if (!canSearch) return;

    setLoading(true);
    setErr(null);
    try {
      const center = props.mapCenter ?? { lat: -27.4705, lng: 153.0260 };
      const res = await placesApi.search({
        center,
        radius_m: 20000,
        query: q.trim(),
        limit: 50,
        categories: [],
      });
      setItems(res.items ?? []);
    } catch (e: any) {
      setItems([]);
      setErr(e?.message ?? "Search failed");
    } finally {
      setLoading(false);
    }
  }

  if (!props.open) return null;

  return (
    <div className="trip-modal-overlay" role="dialog" aria-modal="true" aria-label="Search place" onClick={props.onClose}>
      <div className="trip-modal" onClick={(e) => e.stopPropagation()}>
        <div className="trip-row-between">
          <div className="trip-h2">Search</div>
          <button type="button" onClick={props.onClose} className="trip-interactive trip-btn-icon" aria-label="Close">
            ✕
          </button>
        </div>

        <div style={{ display: "flex", gap: 8 }}>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Type a place name…"
            className="trip-search"
            style={{ flex: 1 }}
            autoFocus
          />
          <button
            type="button"
            onClick={search}
            disabled={!canSearch || loading}
            className="trip-interactive trip-btn trip-btn-secondary"
            style={{ width: 72 }}
          >
            {loading ? "…" : "Go"}
          </button>
        </div>

        {err ? <div className="trip-err-box">{err}</div> : null}

        <div className="trip-list-container" style={{ maxHeight: "60vh" }}>
          {items.length === 0 && !loading ? (
            <div className="trip-empty" style={{ padding: 14 }}>
              No results yet. Try a broader query.
            </div>
          ) : null}

          {items.map((it) => (
            <button
              key={it.id}
              type="button"
              className="trip-interactive trip-list-row"
              onClick={() => {
                if (!props.stopId) return;
                props.onPick({ stopId: props.stopId, name: it.name, lat: it.lat, lng: it.lng });
              }}
            >
              <div style={{ textAlign: "left" }}>
                <div className="trip-title" style={{ fontSize: 13 }}>{it.name}</div>
                <div className="trip-muted-small">
                  {it.category} · {it.lat.toFixed(4)}, {it.lng.toFixed(4)}
                </div>
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}