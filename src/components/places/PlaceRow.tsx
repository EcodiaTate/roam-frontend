// src/components/places/PlaceRow.tsx
// Single place result row — used by PlaceSearchPanel's result list.
"use client";

import { memo } from "react";
import type { PlaceItem } from "@/lib/types/places";
import { iconBox36, textTruncate } from "@/components/ui/cardStyles";
import { CATEGORY_ICON } from "@/lib/places/categoryMeta";
import { fmtDist, fmtCat } from "@/lib/places/format";
import { isOpenNow } from "@/lib/places/offlineSearch";
import { haptic } from "@/lib/native/haptics";

import { MapPin, ArrowUp, ArrowDown, Bookmark } from "lucide-react";

export type PlaceRowProps = {
  place: PlaceItem;
  distKm: number | null;
  ahead: boolean | null;
  onSelect?: (p: PlaceItem) => void;
  /** Whether this place is saved; if provided, shows the bookmark button */
  isSaved?: boolean;
  onToggleSave?: (p: PlaceItem) => void;
};

export const PlaceRow = memo(function PlaceRow({ place, distKm, ahead, onSelect, isSaved, onToggleSave }: PlaceRowProps) {
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
    <button
      type="button"
      onClick={() => { haptic.selection(); onSelect?.(place); }}
      style={{
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
      }}
    >
      {/* Icon */}
      <div style={iconBox36}>
        <CatIcon size={17} style={{ color: "var(--roam-text-muted)" }} />
      </div>

      {/* Content */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ ...textTruncate, fontSize: 14, fontWeight: 700, color: "var(--roam-text)" }}>
          {place.name}
        </div>
        <div
          style={{
            fontSize: 12,
            color: "var(--roam-text-muted)",
            fontWeight: 500,
            marginTop: 2,
            display: "flex",
            alignItems: "center",
            gap: 6,
            flexWrap: "wrap",
          }}
        >
          <span>{fmtCat(place.category)}</span>

          {pills.length > 0 &&
            pills.slice(0, 3).map((p) => (
              <span
                key={p}
                style={{
                  fontSize: 10,
                  fontWeight: 700,
                  background: "var(--roam-surface-hover)",
                  borderRadius: 4,
                  padding: "1px 5px",
                }}
              >
                {p}
              </span>
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
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "flex-end",
            gap: 3,
            flexShrink: 0,
          }}
        >
          <span
            style={{
              fontSize: 12,
              fontWeight: 800,
              color: "var(--roam-text)",
              whiteSpace: "nowrap",
            }}
          >
            {dist}
          </span>
          {ahead !== null && (
            <span
              style={{
                fontSize: 10,
                fontWeight: 700,
                color: ahead ? "var(--roam-success)" : "var(--roam-text-muted)",
                display: "flex",
                alignItems: "center",
                gap: 2,
              }}
            >
              {ahead
                ? <><ArrowUp size={9} />Ahead</>
                : <><ArrowDown size={9} />Behind</>}
            </span>
          )}
        </div>
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
          style={{
            background: "none",
            border: "none",
            padding: 6,
            cursor: "pointer",
            flexShrink: 0,
            color: isSaved ? "var(--brand-amber)" : "var(--roam-text-muted)",
            display: "flex",
            alignItems: "center",
          }}
          aria-label={isSaved ? "Remove from saved places" : "Save place"}
        >
          <Bookmark size={16} fill={isSaved ? "currentColor" : "none"} />
        </button>
      )}
    </button>
  );
});
