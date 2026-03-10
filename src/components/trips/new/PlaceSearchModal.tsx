// src/components/new/PlaceSearchModal.tsx
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { NavCoord } from "@/lib/types/geo";
import { placesApi } from "@/lib/api/places";
import type { PlaceItem } from "@/lib/types/places";
import { Search } from "lucide-react"

import { haptic } from "@/lib/native/haptics";
import { hideKeyboard } from "@/lib/native/keyboard";

const DEBOUNCE_MS = 300;
const MIN_QUERY_LEN = 2;

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
  const [hasSearched, setHasSearched] = useState(false);

  const abortRef = useRef<AbortController | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const enabled = props.open && !!props.stopId;

  useEffect(() => {
    if (!props.open) {
      setQ(""); setItems([]); setErr(null); setHasSearched(false);
      abortRef.current?.abort();
      if (debounceRef.current) clearTimeout(debounceRef.current);
    }
  }, [props.open]);

  useEffect(() => {
    if (props.open) {
      const t = setTimeout(() => inputRef.current?.focus(), 60);
      return () => clearTimeout(t);
    }
  }, [props.open]);

  const doSearch = useCallback(async (query: string) => {
    if (!enabled) return;
    const trimmed = query.trim();
    if (trimmed.length < MIN_QUERY_LEN) { setItems([]); setHasSearched(false); return; }

    abortRef.current?.abort();
    const ac = new AbortController(); abortRef.current = ac;
    setLoading(true); setErr(null);

    try {
      const center = props.mapCenter ?? { lat: -27.4705, lng: 153.026 };
      const res = await placesApi.search({ center, radius_m: 50000, query: trimmed, limit: 10, categories: [] });
      if (ac.signal.aborted) return;
      setItems(res.items ?? []); setHasSearched(true);
    } catch (e: unknown) {
      if (ac.signal.aborted) return;
      setItems([]); setHasSearched(true); setErr(e instanceof Error ? e.message : "Search failed");
    } finally {
      if (!ac.signal.aborted) setLoading(false);
    }
  }, [enabled, props.mapCenter]);

  const onInput = useCallback((value: string) => {
    setQ(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (value.trim().length < MIN_QUERY_LEN) { setItems([]); setHasSearched(false); setLoading(false); return; }
    setLoading(true);
    debounceRef.current = setTimeout(() => doSearch(value), DEBOUNCE_MS);
  }, [doSearch]);

  const onKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      if (debounceRef.current) clearTimeout(debounceRef.current);
      hideKeyboard();
      doSearch(q);
    }
  }, [doSearch, q]);

  const handleClose = () => {
    haptic.tap();
    hideKeyboard();
    props.onClose();
  };

  const handlePick = (it: PlaceItem) => {
    if (!props.stopId) return;
    haptic.success();
    hideKeyboard();
    props.onPick({ stopId: props.stopId, name: it.name, lat: it.lat, lng: it.lng });
  };

  if (!props.open) return null;

  return (
    <div className="trip-modal-overlay" role="dialog" aria-modal="true" onClick={handleClose}>
      <div className="trip-modal" onClick={(e) => e.stopPropagation()}>
        <div className="trip-drag-handle" />

        <div className="trip-row-between" style={{ marginBottom: 8 }}>
          <div className="trip-h1">Search Location</div>
          <button type="button" onClick={handleClose} className="trip-interactive trip-btn-icon" aria-label="Close">✕</button>
        </div>

        <div className="trip-search-box">
          <span style={{ marginRight: 12, fontSize: "1.2rem", opacity: 0.5 }}><Search/></span>
          <input
            ref={inputRef} value={q} onChange={(e) => onInput(e.target.value)} onKeyDown={onKeyDown}
            placeholder="Where to?" autoComplete="off" autoCorrect="off" spellCheck={false} className="trip-input"
          />
          {q.length > 0 && (
            <button type="button"
              onClick={() => { haptic.tap(); setQ(""); setItems([]); setHasSearched(false); setErr(null); inputRef.current?.focus(); }}
              className="trip-interactive" style={{ background: "none", border: "none", color: "var(--roam-text-muted)", fontSize: "1.2rem", padding: "8px" }}>✕</button>
          )}
        </div>

        {loading && <div style={{ height: 3, background: "var(--roam-accent)", borderRadius: 2, animation: "roam-pulse 1s ease-in-out infinite", marginTop: 4 }} />}
        {err && <div className="trip-err-box" style={{ marginTop: 8 }}>{err}</div>}

        <div style={{ flex: 1, overflowY: "auto", marginTop: 12 }}>
          {!loading && !hasSearched && q.length < MIN_QUERY_LEN && (
            <div className="trip-muted" style={{ textAlign: "center", marginTop: 60 }}>Type at least {MIN_QUERY_LEN} characters to search.</div>
          )}
          {!loading && hasSearched && items.length === 0 && (
            <div className="trip-muted" style={{ textAlign: "center", marginTop: 60 }}>No results found.</div>
          )}

          {items.map((it) => {
            const address = (it.extra as Record<string, unknown>)?.address as string | undefined;
            return (
              <button key={it.id} type="button" className="trip-interactive trip-list-row" onClick={() => handlePick(it)}>
                <div className="trip-h2">{it.name}</div>
                <div className="trip-muted-small trip-truncate" style={{ marginTop: 6 }}>
                  {address || `${it.category} · ${it.lat.toFixed(4)}, ${it.lng.toFixed(4)}`}
                </div>
              </button>
            );
          })}
        </div>
      </div>
      <style>{`@keyframes roam-pulse { 0%, 100% { opacity: 0.3; } 50% { opacity: 1; } }`}</style>
    </div>
  );
}