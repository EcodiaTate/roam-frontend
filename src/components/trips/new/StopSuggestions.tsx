import React, { useCallback, useEffect, useRef, useState } from "react";
import { Plus, Loader2, Sparkles } from "lucide-react";
import { getCategoryIcon, getCategoryColor } from "@/lib/places/categoryMeta";
import { haptic } from "@/lib/native/haptics";
import { placesApi } from "@/lib/api/places";
import type { StopSuggestionItem } from "@/lib/types/places";
import type { NavPack } from "@/lib/types/navigation";
import type { TripStop } from "@/lib/types/trip"; // kept for future category-hint wiring

/* ── Helpers ───────────────────────────────────────────────── */

function routeMidpoint(navPack: NavPack): { lat: number; lng: number } | null {
  const bbox = navPack.primary?.bbox;
  if (!bbox) return null;
  return {
    lat: (bbox.minLat + bbox.maxLat) / 2,
    lng: (bbox.minLng + bbox.maxLng) / 2,
  };
}

function categoryLabel(category: string): string {
  return category
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

/* ── Suggestion card ───────────────────────────────────────── */

function SuggestionCard({
  item,
  onAdd,
}: {
  item: StopSuggestionItem;
  onAdd: (item: StopSuggestionItem) => void;
}) {
  const Icon = getCategoryIcon(item.category);
  const colors = getCategoryColor(item.category);
  const [pressed, setPressed] = useState(false);

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 5,
        padding: "9px 10px 8px",
        borderRadius: 12,
        background: "var(--roam-surface)",
        border: "1px solid var(--roam-border)",
        flexShrink: 0,
        width: 136,
        position: "relative",
        transition: "opacity 0.15s",
        opacity: pressed ? 0.7 : 1,
      }}
    >
      {/* Category pill */}
      <div
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 4,
          padding: "3px 7px",
          borderRadius: 999,
          background: colors.bg,
          alignSelf: "flex-start",
        }}
      >
        <Icon size={11} style={{ color: colors.fg, flexShrink: 0 }} />
        <span style={{ fontSize: 10, fontWeight: 700, color: colors.fg, letterSpacing: "0.03em" }}>
          {categoryLabel(item.category)}
        </span>
      </div>

      {/* Name */}
      <div
        style={{
          fontSize: 13,
          fontWeight: 700,
          color: "var(--roam-text)",
          lineHeight: 1.3,
          display: "-webkit-box",
          WebkitLineClamp: 2,
          WebkitBoxOrient: "vertical",
          overflow: "hidden",
          flex: 1,
        }}
      >
        {item.name}
      </div>

      {/* Add button */}
      <button
        type="button"
        onPointerDown={() => setPressed(true)}
        onPointerUp={() => setPressed(false)}
        onPointerLeave={() => setPressed(false)}
        onClick={() => {
          haptic.light();
          onAdd(item);
        }}
        style={{
          all: "unset",
          cursor: "pointer",
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 4,
          padding: "6px 10px",
          borderRadius: 8,
          background: colors.bg,
          border: `1px solid ${colors.accent}30`,
          fontSize: 11,
          fontWeight: 800,
          color: colors.fg,
          WebkitTapHighlightColor: "transparent",
          transition: "opacity 0.15s",
        }}
      >
        <Plus size={11} strokeWidth={3} />
        Add stop
      </button>
    </div>
  );
}

/* ── Main component ────────────────────────────────────────── */

export type StopSuggestionsProps = {
  navPack: NavPack | null;
  /** Existing stops - used to hint at category diversity. */
  stops: TripStop[];
  /** Called when user taps "Add stop" on a suggestion card. */
  onAddSuggestion: (item: StopSuggestionItem) => void;
};

export function StopSuggestions({ navPack, stops: _stops, onAddSuggestion }: StopSuggestionsProps) {
  const [suggestions, setSuggestions] = useState<StopSuggestionItem[]>([]);
  const [loading, setLoading] = useState(false);
  const lastRouteKeyRef = useRef<string | null>(null);

  const fetchSuggestions = useCallback(async () => {
    if (!navPack?.primary) return;

    const routeKey = navPack.primary.route_key;
    if (routeKey === lastRouteKeyRef.current) return;
    lastRouteKeyRef.current = routeKey;

    const bbox = navPack.primary.bbox;
    if (!bbox) return;

    const midpoint = routeMidpoint(navPack);
    if (!midpoint) return;

    setLoading(true);
    try {
      const res = await placesApi.stopSuggestions({
        bbox,
        midpoint,
        limit: 4,
      });
      setSuggestions(res.suggestions);
    } catch {
      // Silently fail - suggestions are non-critical
      setSuggestions([]);
    } finally {
      setLoading(false);
    }
  }, [navPack?.primary?.route_key]);

  useEffect(() => {
    fetchSuggestions();
  }, [fetchSuggestions]);

  // Reset when route is cleared
  useEffect(() => {
    if (!navPack) {
      setSuggestions([]);
      lastRouteKeyRef.current = null;
    }
  }, [navPack]);

  if (!navPack?.primary) return null;
  if (!loading && suggestions.length === 0) return null;

  return (
    <div style={{ marginTop: 8 }}>
      {/* Section header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          marginBottom: 6,
          paddingLeft: 2,
        }}
      >
        <Sparkles size={13} style={{ color: "var(--roam-text-muted)", flexShrink: 0 }} />
        <span
          style={{
            fontSize: 11,
            fontWeight: 800,
            color: "var(--roam-text-muted)",
            letterSpacing: "0.07em",
            textTransform: "uppercase",
          }}
        >
          Suggestions
        </span>
      </div>

      {/* Cards row */}
      <div
        style={{
          display: "flex",
          gap: 8,
          overflowX: "auto",
          paddingBottom: 4,
          scrollbarWidth: "none",
          WebkitOverflowScrolling: "touch",
        } as React.CSSProperties}
      >
        {loading ? (
          /* Skeleton placeholders while loading */
          Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              style={{
                width: 136,
                height: 90,
                borderRadius: 12,
                background: "var(--roam-surface)",
                border: "1px solid var(--roam-border)",
                flexShrink: 0,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                opacity: 0.5 + i * 0.1,
              }}
            >
              {i === 0 && (
                <Loader2
                  size={18}
                  style={{
                    color: "var(--roam-text-muted)",
                    animation: "roam-spin 0.8s linear infinite",
                  }}
                />
              )}
            </div>
          ))
        ) : (
          suggestions.map((item) => (
            <SuggestionCard key={item.id} item={item} onAdd={onAddSuggestion} />
          ))
        )}
      </div>
    </div>
  );
}
