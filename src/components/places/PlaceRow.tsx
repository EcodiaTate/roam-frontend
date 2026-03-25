// src/components/places/PlaceRow.tsx
// Single place result row - used by PlaceSearchPanel's result list.

import { memo } from "react";
import type { PlaceItem } from "@/lib/types/places";
import { iconBox36, textTruncate } from "@/components/ui/cardStyles";
import { CATEGORY_ICON } from "@/lib/places/categoryMeta";
import { fmtDist, fmtCat } from "@/lib/places/format";
import { isOpenNow } from "@/lib/places/offlineSearch";
import { haptic } from "@/lib/native/haptics";

import { MapPin, ArrowUp, ArrowDown, Bookmark, Map as MapIcon } from "lucide-react";

// ── Pre-computed style objects (avoids allocations per render) ──

const ROW_STYLE: React.CSSProperties = {
  width: "100%",
  display: "flex",
  alignItems: "center",
  gap: 12,
  padding: "10px 16px",
  background: "none",
  border: "none",
  borderBottom: "1px solid var(--roam-border)",
  cursor: "pointer",
  textAlign: "left",
};

const CONTENT_STYLE: React.CSSProperties = { flex: 1, minWidth: 0 };

const NAME_STYLE: React.CSSProperties = {
  ...textTruncate,
  fontSize: 14,
  fontWeight: 700,
  color: "var(--roam-text)",
};

const META_STYLE: React.CSSProperties = {
  fontSize: 12,
  color: "var(--roam-text-muted)",
  fontWeight: 500,
  marginTop: 2,
  display: "flex",
  alignItems: "center",
  gap: 6,
  flexWrap: "wrap",
};

const PILL_STYLE: React.CSSProperties = {
  fontSize: 10,
  fontWeight: 700,
  background: "var(--roam-surface-hover)",
  borderRadius: 4,
  padding: "1px 5px",
};

const DIST_CONTAINER_STYLE: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  alignItems: "flex-end",
  gap: 3,
  flexShrink: 0,
};

const DIST_VALUE_STYLE: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 800,
  color: "var(--roam-text)",
  whiteSpace: "nowrap",
};

const AHEAD_STYLE: React.CSSProperties = {
  fontSize: 10,
  fontWeight: 700,
  color: "var(--roam-success)",
  display: "flex",
  alignItems: "center",
  gap: 2,
};

const BEHIND_STYLE: React.CSSProperties = {
  fontSize: 10,
  fontWeight: 700,
  color: "var(--roam-text-muted)",
  display: "flex",
  alignItems: "center",
  gap: 2,
};

const BOOKMARK_BTN_BASE: React.CSSProperties = {
  background: "none",
  border: "none",
  padding: 10,
  cursor: "pointer",
  flexShrink: 0,
  display: "flex",
  alignItems: "center",
  minWidth: 44,
  minHeight: 44,
  justifyContent: "center",
  touchAction: "manipulation",
  WebkitTapHighlightColor: "transparent",
};

const BOOKMARK_SAVED: React.CSSProperties = { ...BOOKMARK_BTN_BASE, color: "var(--brand-amber)" };
const BOOKMARK_UNSAVED: React.CSSProperties = { ...BOOKMARK_BTN_BASE, color: "var(--roam-text-muted)" };

const ICON_STYLE: React.CSSProperties = { color: "var(--roam-text-muted)" };

export type PlaceRowProps = {
  place: PlaceItem;
  distKm: number | null;
  ahead: boolean | null;
  onSelect?: (p: PlaceItem) => void;
  /** Called when user taps the map button - zooms to place on map */
  onShowOnMap?: (p: PlaceItem) => void;
  /** Whether this place is saved; if provided, shows the bookmark button */
  isSaved?: boolean;
  onToggleSave?: (p: PlaceItem) => void;
};

export const PlaceRow = memo(function PlaceRow({ place, distKm, ahead, onSelect, onShowOnMap, isSaved, onToggleSave }: PlaceRowProps) {
  const CatIcon = CATEGORY_ICON[place.category] ?? MapPin;
  const extra = place.extra ?? {};
  const dist = fmtDist(distKm);
  const hours = extra.opening_hours as string | undefined;
  const openStatus = hours ? isOpenNow(hours) : null;
  const isFree =
    extra.free === true ||
    (extra as Record<string, unknown>).camp_type === "free" ||
    extra.fee === "no" ||
    extra.fee === "0";

  // Key attributes as pills
  const pills: string[] = [];
  if (isFree) pills.push("Free");
  if (extra.powered_sites) pills.push("Powered");
  if (extra.has_showers) pills.push("Showers");
  if (extra.has_water) pills.push("Water");
  if (extra.has_toilets) pills.push("Toilets");
  if (extra.has_diesel) pills.push("Diesel");
  if (extra.has_lpg) pills.push("LPG");

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => { haptic.selection(); onSelect?.(place); }}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); haptic.selection(); onSelect?.(place); } }}
      style={ROW_STYLE}
    >
      {/* Icon */}
      <div style={iconBox36}>
        <CatIcon size={17} style={ICON_STYLE} />
      </div>

      {/* Content */}
      <div style={CONTENT_STYLE}>
        <div style={NAME_STYLE}>{place.name}</div>
        <div style={META_STYLE}>
          <span>{fmtCat(place.category)}</span>

          {pills.length > 0 &&
            pills.slice(0, 3).map((p) => (
              <span key={p} style={PILL_STYLE}>{p}</span>
            ))}

          {openStatus !== null && (
            <span
              style={{
                fontSize: 10,
                fontWeight: 700,
                color: openStatus ? "var(--roam-success)" : "var(--roam-danger)",
              }}
            >
              {openStatus ? "Open" : "Closed"}
            </span>
          )}
        </div>
      </div>

      {/* Distance + direction */}
      {dist && (
        <div style={DIST_CONTAINER_STYLE}>
          <span style={DIST_VALUE_STYLE}>{dist}</span>
          {ahead !== null && (
            <span style={ahead ? AHEAD_STYLE : BEHIND_STYLE}>
              {ahead
                ? <><ArrowUp size={9} />Ahead</>
                : <><ArrowDown size={9} />Behind</>}
            </span>
          )}
        </div>
      )}

      {/* Show on map */}
      {onShowOnMap && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            haptic.selection();
            onShowOnMap(place);
          }}
          style={BOOKMARK_BTN_BASE}
          aria-label="Show on map"
        >
          <MapIcon size={16} style={{ color: "var(--roam-text-muted)" }} />
        </button>
      )}

      {/* Bookmark toggle */}
      {onToggleSave && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            haptic.selection();
            onToggleSave(place);
          }}
          style={isSaved ? BOOKMARK_SAVED : BOOKMARK_UNSAVED}
          aria-label={isSaved ? "Remove from saved places" : "Save place"}
        >
          <Bookmark size={16} fill={isSaved ? "currentColor" : "none"} />
        </button>
      )}
    </div>
  );
});
