// components/trip/ExploreView.tsx
"use client";

import { useMemo, useState } from "react";
import type { PlacesPack, PlaceItem } from "@/lib/types/places";
import { haptic } from "@/lib/native/haptics";

export function ExploreView({
  places,
  focusedPlaceId,
  onFocusPlace,
  onAddStop,
}: {
  places: PlacesPack | null;
  focusedPlaceId: string | null;
  onFocusPlace: (id: string | null) => void;
  onAddStop: (place: PlaceItem) => void;
}) {
  const [chatInput, setChatInput] = useState("");
  const [searchQuery, setSearchQuery] = useState("");

  const items = places?.items ?? [];

  const filteredItems = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const list = !q ? items : items.filter((p) => (p.name ?? "").toLowerCase().includes(q));
    return list.slice(0, 100);
  }, [items, searchQuery]);

  const handleAskAI = (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatInput.trim()) return;
    haptic.medium();
    // TODO: Hook up AI completion API here
    setChatInput("");
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", gap: 20 }}>
      {/* 1. Priority: AI Chat Section */}
      <div
        style={{
          background: "var(--roam-surface)",
          padding: 16,
          borderRadius: 20,
          boxShadow: "var(--shadow-soft)",
        }}
      >
        <h3
          style={{
            margin: "0 0 10px",
            fontSize: 15,
            fontWeight: 900,
            display: "flex",
            alignItems: "center",
            gap: 8,
            color: "var(--roam-text)",
          }}
        >
          ✨ Ask Roam
        </h3>
        <p style={{ margin: "0 0 14px", fontSize: 13, color: "var(--roam-text-muted)", fontWeight: 700 }}>
          Tell me what you're looking for (e.g., "Find a quiet campsite near a lake" or "Where is the cheapest fuel
          ahead?")
        </p>

        <form onSubmit={handleAskAI} style={{ display: "flex", gap: 10 }}>
          <input
            type="text"
            value={chatInput}
            onChange={(e) => setChatInput(e.target.value)}
            placeholder="Ask about your route..."
            className="trip-interactive"
            style={{
              flex: 1,
              padding: "12px 16px",
              borderRadius: 999,
              border: "none",
              outline: "none",
              fontSize: 14,
              fontWeight: 800,
              background: "var(--roam-surface-hover)",
              color: "var(--roam-text)",
              boxShadow: "inset 0 0 0 2px rgba(0,0,0,0.04)",
            }}
          />
          <button
            type="submit"
            className="trip-btn trip-btn-primary trip-interactive"
            style={{
              width: "auto",
              borderRadius: 999,
              padding: "0 18px",
              minHeight: 48,
            }}
          >
            Ask
          </button>
        </form>
      </div>

      <hr style={{ border: 0, borderTop: "1px solid rgba(0,0,0,0.06)", margin: 0 }} />

      {/* 2. Manual Search & List */}
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h3 style={{ margin: 0, fontSize: 16, fontWeight: 900, color: "var(--roam-text)" }}>Places on Route</h3>
        </div>

        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search by name or category..."
          className="trip-interactive"
          style={{
            padding: "12px 14px",
            borderRadius: 16,
            border: "none",
            outline: "none",
            background: "var(--roam-surface-hover)",
            color: "var(--roam-text)",
            fontSize: 14,
            fontWeight: 800,
            boxShadow: "inset 0 0 0 2px rgba(0,0,0,0.04)",
          }}
        />
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {filteredItems.length === 0 ? (
          <div
            style={{
              padding: 18,
              textAlign: "center",
              color: "var(--roam-text-muted)",
              fontSize: 14,
              fontWeight: 700,
              background: "var(--roam-surface)",
              borderRadius: 20,
              boxShadow: "var(--shadow-soft)",
            }}
          >
            No places found. Try asking the AI to find something specific.
          </div>
        ) : (
          filteredItems.map((p) => {
            const isFocused = focusedPlaceId === p.id;

            return (
              <div
                key={p.id}
                onClick={() => {
                  haptic.selection();
                  onFocusPlace(p.id);
                }}
                className="trip-interactive"
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 12,
                  padding: "12px 14px",
                  borderRadius: 20,
                  cursor: "pointer",
                  background: isFocused ? "var(--roam-surface-hover)" : "var(--roam-surface)",
                  boxShadow: isFocused ? "var(--shadow-heavy)" : "var(--shadow-soft)",
                  outline: isFocused ? "3px solid var(--brand-sky)" : "3px solid transparent",
                  outlineOffset: -3,
                }}
              >
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 15, fontWeight: 900, color: "var(--roam-text)" }} className="trip-truncate">
                    {p.name}
                  </div>
                  <div
                    style={{
                      fontSize: 12,
                      color: "var(--roam-text-muted)",
                      marginTop: 4,
                      fontWeight: 700,
                      textTransform: "capitalize",
                    }}
                    className="trip-truncate"
                  >
                    {(p.category ?? "").replace(/_/g, " ")} · {p.lat.toFixed(3)}, {p.lng.toFixed(3)}
                  </div>
                </div>

                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    haptic.medium();
                    onAddStop(p);
                  }}
                  className="trip-btn-sm trip-interactive"
                  style={{
                    background: "var(--roam-surface-hover)",
                    color: "var(--roam-text)",
                    boxShadow: "var(--shadow-button)",
                    minHeight: 44,
                    borderRadius: 14,
                    fontWeight: 900,
                  }}
                >
                  Add
                </button>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
