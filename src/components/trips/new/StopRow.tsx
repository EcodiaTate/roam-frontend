"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import type { TripStop } from "@/lib/types/trip";
import type { PlaceItem } from "@/lib/types/places";
import { placesApi } from "@/lib/api/places";
import { Search, Navigation, Loader2, ChevronUp, ChevronDown, X } from "lucide-react";

import { haptic } from "@/lib/native/haptics";
import { getCurrentPosition } from "@/lib/native/geolocation";
import { hideKeyboard } from "@/lib/native/keyboard";
import { useDebounceSearch } from "@/lib/hooks/useDebounceSearch";

const MIN_QUERY_LEN = 2;

function badgeForType(type?: string) {
  switch (type) {
    case "start": return "From";
    case "end":   return "To";
    case "via":   return "Via";
    default:      return "Stop";
  }
}

// FIXED: Accept string | null to match the TripStop type
function getDisplayValue(name?: string | null, type?: string) {
  if (!name) return "";
  if (type === "start" && name === "Start") return "";
  if (type === "end" && name === "End") return "";
  return name;
}

export function StopRow(props: {
  stop: TripStop;
  idx: number;
  count: number;
  onEdit: (patch: Partial<Pick<TripStop, "name" | "lat" | "lng">>) => void;
  onSearch: () => void;
  onRemove: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onUseMyLocation?: () => void;
}) {
  const s = props.stop;
  const [locating, setLocating] = useState(false);

  const [isFocused, setIsFocused] = useState(false);
  const [q, setQ] = useState(() => getDisplayValue(s.name, s.type));
  const wrapperRef = useRef<HTMLDivElement>(null);

  const searchFn = useCallback(
    async (query: string) => {
      const center = { lat: s.lat || -27.4705, lng: s.lng || 153.026 };
      const res = await placesApi.search({ center, radius_m: 50000, query, limit: 5, categories: [] });
      return res.items ?? [];
    },
    [s.lat, s.lng],
  );

  const { results, loading, search: debouncedSearch } = useDebounceSearch<PlaceItem>({ searchFn });

  const canMoveUp = props.idx > 0 && s.type !== "start" && s.type !== "end";
  const canMoveDown = props.idx < props.count - 1 && s.type !== "start" && s.type !== "end";
  const canRemove = s.type !== "start" && s.type !== "end";
  const isLocked = s.type === "start" || s.type === "end";

  // Sync external changes (but still filter out "Start"/"End")
  useEffect(() => {
    if (!isFocused) {
      setQ(getDisplayValue(s.name, s.type));
    }
  }, [s.name, s.type, isFocused]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setIsFocused(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const onInput = (value: string) => {
    setQ(value);
    props.onEdit({ name: value });
    debouncedSearch(value);
  };

  const handlePick = (it: PlaceItem) => {
    haptic.success();
    hideKeyboard();
    props.onEdit({ name: it.name, lat: it.lat, lng: it.lng });
    setQ(it.name);
    setIsFocused(false);
  };

  const handleUseMyLocation = async () => {
    setLocating(true);
    try {
      if (props.onUseMyLocation) {
        haptic.tap();
        await props.onUseMyLocation(); // MUST await this so the spinner stays visible!
        haptic.success();
      } else {
        haptic.tap();
        const pos = await getCurrentPosition();
        props.onEdit({ lat: pos.lat, lng: pos.lng, name: "My Location" });
        setQ("My Location");
        haptic.success();
      }
    } catch {
      haptic.error();
    } finally {
      setLocating(false);
    }
  };

  // Dynamic placeholder context based on stop type
  const placeholderText =
    s.type === "start" ? "Search starting point…" :
    s.type === "end" ? "Search destination…" :
    "Search for a place…";

  return (
    <div
      ref={wrapperRef}
      style={{
        display: "flex",
        gap: 10,
        padding: "14px 0",
        borderBottom: "1px solid var(--roam-border)",
        alignItems: "flex-start",
        position: "relative",
      }}
    >
      {/* Type badge */}
      <div style={{ paddingTop: 10, flexShrink: 0 }}>
        <div className={`trip-badge ${isLocked ? "trip-badge-blue" : "trip-badge-soft"}`}>
          {badgeForType(s.type)}
        </div>
      </div>

      {/* Main content */}
      <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 6 }}>
        {/* Search input + Use My Location (inline) */}
        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <div style={{ position: "relative", flex: 1, minWidth: 0 }}>
            <div style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "var(--roam-text-muted)", pointerEvents: "none" }}>
              {loading
                ? <Loader2 size={16} style={{ animation: "roam-spin 1s linear infinite" }} />
                : <Search size={16} />
              }
            </div>
            <input
              value={q}
              onFocus={() => setIsFocused(true)}
              onChange={(e) => onInput(e.target.value)}
              placeholder={placeholderText}
              className="trip-input"
              style={{ paddingLeft: 38, width: "100%", height: 44, fontSize: 15, borderRadius: 12 }}
            />

            {/* Dropdown results */}
            {isFocused && q.length >= MIN_QUERY_LEN && (
              <div style={{
                position: "absolute",
                top: "calc(100% + 6px)",
                left: 0, right: 0,
                background: "var(--roam-surface)",
                border: "1px solid var(--roam-border)",
                borderRadius: 12,
                boxShadow: "0 12px 30px -5px rgba(0,0,0,0.2)",
                zIndex: 50,
                overflow: "hidden",
                maxHeight: 220,
                overflowY: "auto",
              }}>
                {results.length === 0 && !loading && (
                  <div style={{ padding: 16, fontSize: 14, color: "var(--roam-text-muted)", textAlign: "center" }}>
                    No places found.
                  </div>
                )}
                {results.map((it) => (
                  <button
                    key={it.id}
                    type="button"
                    onClick={() => handlePick(it)}
                    style={{
                      width: "100%",
                      padding: "11px 16px",
                      background: "transparent",
                      border: "none",
                      borderBottom: "1px solid var(--roam-border)",
                      textAlign: "left",
                      cursor: "pointer",
                      display: "flex",
                      flexDirection: "column",
                      gap: 2,
                    }}
                  >
                    <span style={{ fontSize: 14, fontWeight: 700, color: "var(--roam-text)" }}>{it.name}</span>
                    <span style={{ fontSize: 12, color: "var(--roam-text-muted)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                      {((it.extra as Record<string, unknown> | undefined)?.address as string) || `${it.category} · ${it.lat.toFixed(3)}, ${it.lng.toFixed(3)}`}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Use My Location button — inline, icon-only on narrow screens */}
          {(props.onUseMyLocation || s.type === "start") && (
            <button
              type="button"
              onClick={handleUseMyLocation}
              disabled={locating}
              className="trip-interactive trip-btn-sm"
              title="Use my location"
              aria-label="Use my location"
              style={{ flexShrink: 0, gap: 4, height: 44, paddingInline: 10, borderRadius: 12, whiteSpace: "nowrap" }}
            >
              {locating
                ? <Loader2 size={16} style={{ animation: "roam-spin 0.8s linear infinite" }} />
                : <Navigation size={16} />
              }
              <span className="hide-mobile" style={{ fontSize: 12 }}>Locate</span>
            </button>
          )}
        </div>
      </div>

      {/* Reorder / remove controls */}
      {(canMoveUp || canMoveDown || canRemove) && (
        <div style={{ display: "flex", flexDirection: "column", gap: 4, paddingTop: 6, flexShrink: 0 }}>
          {canMoveUp && (
            <button
              type="button"
              onClick={() => { haptic.selection(); props.onMoveUp(); }}
              className="trip-interactive trip-btn-icon"
              style={{ width: 34, height: 34, background: "var(--roam-surface-raised)" }}
              aria-label="Move up"
            >
              <ChevronUp size={16} />
            </button>
          )}
          {canMoveDown && (
            <button
              type="button"
              onClick={() => { haptic.selection(); props.onMoveDown(); }}
              className="trip-interactive trip-btn-icon"
              style={{ width: 34, height: 34, background: "var(--roam-surface-raised)" }}
              aria-label="Move down"
            >
              <ChevronDown size={16} />
            </button>
          )}
          {canRemove && (
            <button
              type="button"
              onClick={() => { haptic.medium(); props.onRemove(); }}
              className="trip-interactive trip-btn-icon trip-btn-danger"
              style={{ width: 34, height: 34 }}
              aria-label="Remove stop"
            >
              <X size={15} />
            </button>
          )}
        </div>
      )}

    </div>
  );
}