"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import type { TripStop } from "@/lib/types/trip";
import type { PlaceItem } from "@/lib/types/places";
import { placesApi } from "@/lib/api/places";
import { Search, Navigation, Loader2 } from "lucide-react";

import { haptic } from "@/lib/native/haptics";
import { getCurrentPosition } from "@/lib/native/geolocation";
import { hideKeyboard } from "@/lib/native/keyboard";

const DEBOUNCE_MS = 300;
const MIN_QUERY_LEN = 2;

function badgeForType(type?: string) {
  switch (type) {
    case "start": return "Start";
    case "end": return "End";
    case "via": return "Via";
    default: return "Stop";
  }
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

  // --- Inline Search State ---
  const [isFocused, setIsFocused] = useState(false);
  const [q, setQ] = useState(s.name ?? "");
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<PlaceItem[]>([]);
  
  const abortRef = useRef<AbortController | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);

  const canMoveUp = props.idx > 0 && s.type !== "start" && s.type !== "end";
  const canMoveDown = props.idx < props.count - 1 && s.type !== "start" && s.type !== "end";
  const canRemove = s.type !== "start" && s.type !== "end";
  const isLocked = s.type === "start" || s.type === "end";

  useEffect(() => {
    if (!isFocused) setQ(s.name ?? "");
  }, [s.name, isFocused]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setIsFocused(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const doSearch = useCallback(async (query: string) => {
    const trimmed = query.trim();
    if (trimmed.length < MIN_QUERY_LEN) { setResults([]); return; }

    abortRef.current?.abort();
    const ac = new AbortController(); 
    abortRef.current = ac;
    setLoading(true);

    try {
      const center = { lat: s.lat || -27.4705, lng: s.lng || 153.026 };
      const res = await placesApi.search({ center, radius_m: 50000, query: trimmed, limit: 5, categories: [] });
      if (ac.signal.aborted) return;
      setResults(res.items ?? []);
    } catch (e: unknown) {
      if (ac.signal.aborted) return;
      setResults([]);
    } finally {
      if (!ac.signal.aborted) setLoading(false);
    }
  }, [s.lat, s.lng]);

  const onInput = (value: string) => {
    setQ(value);
    props.onEdit({ name: value });
    
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (value.trim().length < MIN_QUERY_LEN) { 
      setResults([]); 
      setLoading(false); 
      return; 
    }
    
    setLoading(true);
    debounceRef.current = setTimeout(() => doSearch(value), DEBOUNCE_MS);
  };

  const handlePick = (it: PlaceItem) => {
    haptic.success();
    hideKeyboard();
    props.onEdit({ name: it.name, lat: it.lat, lng: it.lng });
    setQ(it.name);
    setIsFocused(false);
  };

  const handleUseMyLocation = async () => {
    if (props.onUseMyLocation) {
      haptic.tap();
      props.onUseMyLocation();
      return;
    }

    setLocating(true);
    haptic.tap();
    try {
      const pos = await getCurrentPosition();
      props.onEdit({ lat: pos.lat, lng: pos.lng, name: "My Location" });
      setQ("My Location");
      haptic.success();
    } catch (e: any) {
      haptic.error();
    } finally {
      setLocating(false);
    }
  };

  return (
    // Replaced `className="trip-stop-row"` with an explicit inline layout to kill errant click targets
    <div 
      ref={wrapperRef}
      style={{ 
        display: "flex", 
        gap: 12, 
        padding: "16px 0", 
        borderBottom: "1px solid var(--roam-border)",
        alignItems: "flex-start",
        position: "relative",
        cursor: "default" 
      }}
    >
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", paddingTop: 8 }}>
        <div className={`trip-badge ${isLocked ? 'trip-badge-blue' : 'trip-badge-soft'}`}>
          {badgeForType(s.type)}
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 8, minWidth: 0, flex: 1 }}>
        <div style={{ position: "relative", width: "100%" }}>
          <div style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "var(--roam-text-muted)" }}>
            {loading ? <Loader2 size={18} style={{ animation: "roam-spin 1s linear infinite" }} /> : <Search size={18} />}
          </div>
          <input
            value={q}
            onFocus={() => setIsFocused(true)}
            onChange={(e) => onInput(e.target.value)}
            placeholder="Search for a place..."
            className="trip-input"
            style={{ 
              paddingLeft: 40, 
              width: "100%", 
              height: 44, // Ensures a properly sized touch target
              fontSize: 15,
              borderRadius: 12
            }}
          />
          
          {isFocused && (q.length >= MIN_QUERY_LEN) && (
            <div 
              style={{
                position: "absolute",
                top: "calc(100% + 8px)",
                left: 0,
                right: 0,
                background: "var(--roam-surface)",
                border: "1px solid var(--roam-border)",
                borderRadius: 12,
                boxShadow: "0 12px 30px -5px rgba(0, 0, 0, 0.25)",
                zIndex: 50,
                overflow: "hidden",
                maxHeight: 220,
                overflowY: "auto"
              }}
            >
              {results.length === 0 && !loading && (
                <div style={{ padding: 16, fontSize: 14, color: "var(--roam-text-muted)", textAlign: "center" }}>
                  No places found.
                </div>
              )}
              {results.map(it => (
                <button
                  key={it.id}
                  type="button"
                  onClick={() => handlePick(it)}
                  style={{
                    width: "100%",
                    padding: "12px 16px",
                    background: "transparent",
                    border: "none",
                    borderBottom: "1px solid var(--roam-border)",
                    textAlign: "left",
                    cursor: "pointer",
                    display: "flex",
                    flexDirection: "column",
                    gap: 4
                  }}
                >
                  <span style={{ fontSize: 15, fontWeight: 600, color: "var(--roam-text)" }}>{it.name}</span>
                  <span style={{ fontSize: 13, color: "var(--roam-text-muted)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {((it.extra as any)?.address) || `${it.category} · ${it.lat.toFixed(3)}, ${it.lng.toFixed(3)}`}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>

        <div style={{ fontSize: 13, color: "var(--roam-text-muted)", opacity: 0.8 }}>
          {s.lat.toFixed(5)}, {s.lng.toFixed(5)}
        </div>

        {(props.onUseMyLocation || s.type === "start") && (
          <button
            type="button"
            onClick={handleUseMyLocation}
            disabled={locating}
            className="trip-interactive"
            style={{ 
              display: "flex", 
              alignItems: "center", 
              justifyContent: "center",
              gap: 8, 
              background: "var(--roam-accent-soft, rgba(59, 130, 246, 0.1))", 
              border: "none", 
              color: "var(--roam-accent, #3b82f6)", 
              fontWeight: 700, 
              fontSize: 14,
              padding: "12px 16px", 
              borderRadius: 10,
              opacity: locating ? 0.6 : 1,
              width: "100%", // Big, chunky, impossible to miss
              minHeight: 44,
              marginTop: 4
            }}
          >
            <Navigation size={16} />
            {locating ? "Locating…" : "Use My Location"}
          </button>
        )}
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 6, paddingTop: 4 }}>
        {canMoveUp && (
          <button type="button" onClick={() => { haptic.selection(); props.onMoveUp(); }} className="trip-interactive trip-btn-icon" style={{ height: 32, width: 32 }} aria-label="Move up">↑</button>
        )}
        {canMoveDown && (
          <button type="button" onClick={() => { haptic.selection(); props.onMoveDown(); }} className="trip-interactive trip-btn-icon" style={{ height: 32, width: 32 }} aria-label="Move down">↓</button>
        )}
        {canRemove && (
          <button type="button" onClick={() => { haptic.medium(); props.onRemove(); }} className="trip-interactive trip-btn-icon" style={{ height: 32, width: 32, color: "var(--roam-danger)" }} aria-label="Remove stop">✕</button>
        )}
      </div>
      
      <style>{`@keyframes roam-spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}