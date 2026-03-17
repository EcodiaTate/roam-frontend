// src/components/places/SavedPlacesPanel.tsx
//
// Full-screen panel showing the user's saved places library.
// Used inside the search/add-stop flow as a "Saved" tab and on the /places page.
"use client";

import { useState, useMemo, useCallback } from "react";
import { Bookmark, Search, X, MapPin, Trash2, StickyNote, Check } from "lucide-react";
import type { SavedPlace } from "@/lib/offline/savedPlacesStore";
import type { PlaceCategory } from "@/lib/types/places";
import { CATEGORY_ICON } from "@/lib/places/categoryMeta";
import { fmtCat } from "@/lib/places/format";
import { haptic } from "@/lib/native/haptics";

// ── Props ──────────────────────────────────────────────────────────────────

export type SavedPlacesPanelProps = {
  places: SavedPlace[];
  isLoading: boolean;
  /** Called when user taps a row — should add as a trip stop */
  onAddToTrip?: (place: SavedPlace) => void;
  onRemove?: (placeId: string) => void;
  onUpdateNote?: (placeId: string, note: string | null) => void;
  /** Show on map button */
  onShowOnMap?: (place: SavedPlace) => void;
  maxHeight?: string | number;
};

// ── Note editor ────────────────────────────────────────────────────────────

function NoteEditor({
  initial,
  onSave,
  onClose,
}: {
  initial: string | null;
  onSave: (v: string | null) => void;
  onClose: () => void;
}) {
  const [value, setValue] = useState(initial ?? "");

  return (
    <div
      style={{
        padding: "10px 16px 12px",
        background: "var(--roam-surface)",
        borderTop: "1px solid var(--roam-border)",
      }}
    >
      <textarea
        value={value}
        onChange={(e) => setValue(e.currentTarget.value)}
        maxLength={500}
        rows={3}
        placeholder="Add a personal note…"
        style={{
          width: "100%",
          background: "var(--roam-surface-hover)",
          border: "none",
          borderRadius: 10,
          padding: "8px 12px",
          fontSize: 14,
          color: "var(--roam-text)",
          resize: "none",
          outline: "none",
          WebkitUserSelect: "auto",
          userSelect: "auto",
          boxSizing: "border-box",
          fontFamily: "inherit",
        }}
      />
      <div style={{ display: "flex", gap: 8, marginTop: 8, justifyContent: "flex-end" }}>
        <button
          type="button"
          onClick={onClose}
          style={{
            background: "var(--roam-surface-hover)",
            border: "none",
            borderRadius: 8,
            padding: "6px 14px",
            fontSize: 13,
            fontWeight: 700,
            color: "var(--roam-text-muted)",
            cursor: "pointer",
          }}
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={() => {
            haptic.tap();
            onSave(value.trim() || null);
            onClose();
          }}
          style={{
            background: "var(--roam-accent)",
            border: "none",
            borderRadius: 8,
            padding: "6px 14px",
            fontSize: 13,
            fontWeight: 700,
            color: "var(--on-color)",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            gap: 6,
            transition: "transform 0.1s ease",
            WebkitTapHighlightColor: "transparent",
          }}
          onPointerDown={(e) => {
            (e.currentTarget as HTMLElement).style.transform = "scale(0.95)";
          }}
          onPointerUp={(e) => {
            (e.currentTarget as HTMLElement).style.transform = "";
          }}
        >
          <Check size={13} />
          Save note
        </button>
      </div>
    </div>
  );
}

// ── Saved place row ────────────────────────────────────────────────────────

function SavedRow({
  place,
  onAddToTrip,
  onRemove,
  onEditNote,
  onShowOnMap,
}: {
  place: SavedPlace;
  onAddToTrip?: () => void;
  onRemove?: () => void;
  onEditNote?: () => void;
  onShowOnMap?: () => void;
}) {
  const CatIcon = CATEGORY_ICON[place.category as PlaceCategory] ?? MapPin;

  return (
    <div
      style={{
        borderBottom: "1px solid var(--roam-border)",
      }}
    >
      {/* Main row */}
      <button
        type="button"
        onClick={() => { haptic.selection(); onAddToTrip?.(); }}
        style={{
          width: "100%",
          display: "flex",
          alignItems: "center",
          gap: 12,
          padding: "11px 16px",
          background: "none",
          border: "none",
          cursor: onAddToTrip ? "pointer" : "default",
          textAlign: "left",
        }}
      >
        {/* Icon */}
        <div
          style={{
            width: 36,
            height: 36,
            borderRadius: 10,
            background: "var(--roam-surface-hover)",
            display: "grid",
            placeItems: "center",
            flexShrink: 0,
          }}
        >
          <CatIcon size={17} style={{ color: "var(--roam-text-muted)" }} />
        </div>

        {/* Text */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              fontSize: 14,
              fontWeight: 700,
              color: "var(--roam-text)",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {place.name}
          </div>
          <div
            style={{
              fontSize: 12,
              color: "var(--roam-text-muted)",
              fontWeight: 500,
              marginTop: 1,
            }}
          >
            {fmtCat(place.category)}
            {place.note && (
              <span style={{ marginLeft: 6, fontStyle: "italic" }}>
                · {place.note.length > 40 ? `${place.note.slice(0, 40)}…` : place.note}
              </span>
            )}
          </div>
        </div>

        {/* Add-to-trip indicator */}
        {onAddToTrip && (
          <span
            style={{
              fontSize: 11,
              fontWeight: 700,
              color: "var(--roam-accent)",
              flexShrink: 0,
              padding: "3px 8px",
              borderRadius: 6,
              background: "var(--accent-tint)",
            }}
          >
            Add
          </span>
        )}
      </button>

      {/* Action strip */}
      <div
        style={{
          display: "flex",
          gap: 0,
          paddingLeft: 64,
          paddingRight: 16,
          paddingBottom: 8,
        }}
      >
        {onShowOnMap && (
          <ActionChip
            Icon={MapPin}
            label="Map"
            onClick={() => { haptic.selection(); onShowOnMap(); }}
          />
        )}
        {onEditNote && (
          <ActionChip
            Icon={StickyNote}
            label={place.note ? "Edit note" : "Add note"}
            onClick={() => { haptic.selection(); onEditNote(); }}
          />
        )}
        {onRemove && (
          <ActionChip
            Icon={Trash2}
            label="Remove"
            danger
            onClick={() => { haptic.medium(); onRemove(); }}
          />
        )}
      </div>
    </div>
  );
}

function ActionChip({
  Icon,
  label,
  onClick,
  danger,
}: {
  Icon: React.ElementType;
  label: string;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 4,
        background: "none",
        border: "none",
        padding: "3px 10px 3px 0",
        fontSize: 12,
        fontWeight: 700,
        color: danger ? "var(--roam-danger)" : "var(--roam-text-muted)",
        cursor: "pointer",
        transition: "transform 0.1s ease, opacity 0.1s ease",
        WebkitTapHighlightColor: "transparent",
      }}
      onPointerDown={(e) => {
        (e.currentTarget as HTMLElement).style.transform = "scale(0.93)";
        (e.currentTarget as HTMLElement).style.opacity = "0.7";
      }}
      onPointerUp={(e) => {
        (e.currentTarget as HTMLElement).style.transform = "";
        (e.currentTarget as HTMLElement).style.opacity = "";
      }}
      onPointerLeave={(e) => {
        (e.currentTarget as HTMLElement).style.transform = "";
        (e.currentTarget as HTMLElement).style.opacity = "";
      }}
    >
      <Icon size={12} />
      {label}
    </button>
  );
}

// ── Main component ─────────────────────────────────────────────────────────

export function SavedPlacesPanel({
  places,
  isLoading,
  onAddToTrip,
  onRemove,
  onUpdateNote,
  onShowOnMap,
  maxHeight = "calc(100vh - 200px)",
}: SavedPlacesPanelProps) {
  const [query, setQuery] = useState("");
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);

  const filtered = useMemo(() => {
    if (!query.trim()) return places;
    const q = query.toLowerCase();
    return places.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        p.category.includes(q) ||
        (p.note?.toLowerCase().includes(q) ?? false),
    );
  }, [places, query]);

  const handleUpdateNote = useCallback(
    (placeId: string, note: string | null) => {
      onUpdateNote?.(placeId, note);
      setEditingNoteId(null);
    },
    [onUpdateNote],
  );

  if (isLoading) {
    return (
      <div
        style={{
          padding: "48px 24px",
          textAlign: "center",
          color: "var(--roam-text-muted)",
          fontSize: 14,
          fontWeight: 600,
        }}
      >
        Loading saved places…
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      {/* Search bar */}
      <div style={{ padding: "10px 16px 0" }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            background: "var(--roam-surface-hover)",
            borderRadius: 12,
            padding: "8px 12px",
          }}
        >
          <Search size={16} style={{ color: "var(--roam-text-muted)", flexShrink: 0 }} />
          <input
            value={query}
            onChange={(e) => setQuery(e.currentTarget.value)}
            placeholder="Search saved places…"
            style={{
              flex: 1,
              background: "transparent",
              border: "none",
              outline: "none",
              fontSize: 15,
              fontWeight: 500,
              color: "var(--roam-text)",
              WebkitUserSelect: "auto",
              userSelect: "auto",
            }}
            aria-label="Search saved places"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery("")}
              style={{
                background: "none",
                border: "none",
                padding: 2,
                cursor: "pointer",
                color: "var(--roam-text-muted)",
                display: "flex",
              }}
            >
              <X size={14} />
            </button>
          )}
        </div>
      </div>

      {/* Count */}
      <div
        style={{
          padding: "8px 16px 4px",
          fontSize: 12,
          fontWeight: 700,
          color: "var(--roam-text-muted)",
          flexShrink: 0,
        }}
      >
        {filtered.length === places.length
          ? `${places.length} saved place${places.length !== 1 ? "s" : ""}`
          : `${filtered.length} of ${places.length}`}
      </div>

      {/* List */}
      <div
        style={{
          flex: 1,
          overflowY: "auto",
          WebkitOverflowScrolling: "touch",
          maxHeight,
        }}
      >
        {places.length === 0 ? (
          <div
            style={{
              padding: "40px 24px",
              textAlign: "center",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 12,
            }}
          >
            <Bookmark
              size={40}
              style={{ color: "var(--roam-border-strong)", opacity: 0.4 }}
            />
            <div
              style={{
                fontSize: 15,
                fontWeight: 700,
                color: "var(--roam-text-muted)",
              }}
            >
              No saved places yet
            </div>
            <div
              style={{
                fontSize: 13,
                fontWeight: 500,
                color: "var(--roam-text-muted)",
                maxWidth: 240,
                lineHeight: 1.5,
              }}
            >
              Tap the bookmark icon on any place to save it here for quick access.
            </div>
          </div>
        ) : filtered.length === 0 ? (
          <div
            style={{
              padding: "32px 24px",
              textAlign: "center",
              color: "var(--roam-text-muted)",
              fontSize: 14,
              fontWeight: 600,
            }}
          >
            No matches
          </div>
        ) : (
          filtered.map((place) => (
            <div key={place.id}>
              <SavedRow
                place={place}
                onAddToTrip={onAddToTrip ? () => onAddToTrip(place) : undefined}
                onRemove={onRemove ? () => onRemove(place.place_id) : undefined}
                onEditNote={
                  onUpdateNote
                    ? () =>
                        setEditingNoteId((id) =>
                          id === place.place_id ? null : place.place_id,
                        )
                    : undefined
                }
                onShowOnMap={onShowOnMap ? () => onShowOnMap(place) : undefined}
              />
              {editingNoteId === place.place_id && (
                <NoteEditor
                  initial={place.note}
                  onSave={(note) => handleUpdateNote(place.place_id, note)}
                  onClose={() => setEditingNoteId(null)}
                />
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
