// components/trip/ExploreView.tsx
"use client";

import { useMemo, useRef, useState } from "react";
import type { PlacesPack, PlaceItem, PlaceCategory } from "@/lib/types/places";
import type { ExplorePack } from "@/lib/types/explore";
import { haptic } from "@/lib/native/haptics";

type ChipKey = PlaceCategory | "all";

type Chip = { key: ChipKey; label: string };

const CHIPS: Chip[] = [
  { key: "all", label: "All" },
  { key: "fuel", label: "Fuel" },
  { key: "camp", label: "Camp" },
  { key: "toilet", label: "Toilets" },
  { key: "water", label: "Water" },
  { key: "town", label: "Towns" },
  { key: "grocery", label: "Groceries" },
  { key: "mechanic", label: "Mechanic" },
  { key: "hospital", label: "Hospital" },
  { key: "pharmacy", label: "Pharmacy" },
  { key: "cafe", label: "Cafes" },
  { key: "restaurant", label: "Food" },
  { key: "park", label: "Parks" },
  { key: "viewpoint", label: "Views" },
  { key: "beach", label: "Beaches" },
];

function getTags(p: PlaceItem): Record<string, any> {
  const ex: any = p.extra ?? {};
  if (ex?.tags && typeof ex.tags === "object") return ex.tags as Record<string, any>;
  return ex as Record<string, any>;
}

function fmtCategory(c?: string) {
  return (c ?? "").replace(/_/g, " ");
}

function buildAddress(tags: Record<string, any>) {
  const hn = tags["addr:housenumber"];
  const st = tags["addr:street"];
  const suburb = tags["addr:suburb"] || tags["addr:city"] || tags["addr:town"];
  const pc = tags["addr:postcode"];
  const parts = [hn && st ? `${hn} ${st}` : st, suburb, pc].filter(Boolean);
  return parts.length ? parts.join(", ") : null;
}

function safeOpen(url: string) {
  try {
    window.open(url, "_blank", "noopener,noreferrer");
  } catch {
    // ignore
  }
}

export function ExploreView({
  places,
  focusedPlaceId,
  onFocusPlace,
  onAddStop,
  isOnline = true,
  onShowOnMap,

  // Explore engine wiring
  exploreReady = false,
  explorePack,
  onSendMessage,
  chatBusy = false,
}: {
  places: PlacesPack | null;
  focusedPlaceId: string | null;
  onFocusPlace: (id: string | null) => void;
  onAddStop: (place: PlaceItem) => void;

  isOnline?: boolean;
  onShowOnMap?: (placeId: string) => void;

  exploreReady?: boolean;
  explorePack?: ExplorePack | null;
  onSendMessage?: (text: string, preferredCategories: string[]) => Promise<string | undefined>;
  chatBusy?: boolean;
}) {
  const [chatInput, setChatInput] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [chip, setChip] = useState<ChipKey>("all");

  const chatEndRef = useRef<HTMLDivElement>(null);

  const items = places?.items ?? [];

  const filteredItems = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    let list = items;

    if (chip !== "all") list = list.filter((p) => p.category === chip);
    if (q) list = list.filter((p) => (p.name ?? "").toLowerCase().includes(q));

    // Keep it snappy on mobile
    return list.slice(0, 140);
  }, [items, searchQuery, chip]);

  const focused = useMemo(() => {
    if (!focusedPlaceId) return null;
    return items.find((p) => p.id === focusedPlaceId) ?? null;
  }, [items, focusedPlaceId]);

  const thread = explorePack?.thread ?? [];

  async function handleAsk(e: React.FormEvent) {
    e.preventDefault();
    const text = chatInput.trim();
    if (!text) return;

    haptic.medium();
    setChatInput("");

    if (!exploreReady || !onSendMessage) return;

    // Preferred categories from active chip (light hint)
    const preferred: string[] =
      chip !== "all" ? [chip] : [];

    try {
      await onSendMessage(text, preferred);
      // scroll to bottom after response lands
      setTimeout(() => chatEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" }), 50);
    } catch {
      // error handled by page
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {/* Chat */}
      <div
        style={{
          background: "var(--roam-surface)",
          padding: 14,
          borderRadius: 20,
          boxShadow: "var(--shadow-soft)",
        }}
      >
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 10 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{ fontSize: 14, fontWeight: 950, color: "var(--roam-text)" }}>✨ Ask Roam</div>
            {!exploreReady ? (
              <div style={{ fontSize: 12, fontWeight: 900, color: "var(--roam-text-muted)" }}>Booting…</div>
            ) : null}
          </div>
          {chatBusy ? (
            <div style={{ fontSize: 12, fontWeight: 900, color: "var(--roam-text-muted)" }}>Thinking…</div>
          ) : null}
        </div>

        {/* Thread */}
        {thread.length > 0 ? (
          <div
            style={{
              marginTop: 10,
              display: "flex",
              flexDirection: "column",
              gap: 8,
              maxHeight: 220,
              overflowY: "auto",
              paddingRight: 4,
              WebkitOverflowScrolling: "touch",
              overscrollBehavior: "contain",
            }}
          >
            {thread.slice(-12).map((m, idx) => {
              const mine = m.role === "user";
              return (
                <div
                  key={`${m.role}_${idx}_${m.content.slice(0, 8)}`}
                  style={{
                    alignSelf: mine ? "flex-end" : "flex-start",
                    maxWidth: "92%",
                    padding: "10px 12px",
                    borderRadius: 16,
                    background: mine ? "var(--roam-surface-hover)" : "rgba(0,0,0,0.04)",
                    color: "var(--roam-text)",
                    fontSize: 13,
                    fontWeight: 850,
                    lineHeight: 1.25,
                    whiteSpace: "pre-wrap",
                  }}
                >
                  {m.content}
                </div>
              );
            })}
            <div ref={chatEndRef} />
          </div>
        ) : (
          <div style={{ marginTop: 10, color: "var(--roam-text-muted)", fontSize: 13, fontWeight: 850 }}>
            Ask things like: “fuel within 80km”, “quiet camp near water”, “towns ahead”.
          </div>
        )}

        {/* Input */}
        <form onSubmit={handleAsk} style={{ display: "flex", gap: 10, marginTop: 12 }}>
          <input
            type="text"
            value={chatInput}
            onChange={(e) => setChatInput(e.target.value)}
            placeholder='Ask about your route…'
            className="trip-interactive"
            style={{
              flex: 1,
              padding: "12px 14px",
              borderRadius: 999,
              border: "none",
              outline: "none",
              fontSize: 14,
              fontWeight: 850,
              background: "var(--roam-surface-hover)",
              color: "var(--roam-text)",
              boxShadow: "inset 0 0 0 2px rgba(0,0,0,0.04)",
            }}
          />
          <button
            type="submit"
            className="trip-btn trip-btn-primary trip-interactive"
            disabled={!exploreReady || chatBusy}
            style={{
              width: "auto",
              borderRadius: 999,
              padding: "0 16px",
              minHeight: 46,
              fontWeight: 950,
              opacity: !exploreReady || chatBusy ? 0.6 : 1,
            }}
          >
            Ask
          </button>
        </form>
      </div>

      {/* Focused place details */}
      {focused ? (
        <div
          style={{
            background: "var(--roam-surface)",
            padding: 14,
            borderRadius: 20,
            boxShadow: "var(--shadow-soft)",
          }}
        >
          {(() => {
            const tags = getTags(focused);
            const addr = buildAddress(tags);
            const phone = tags.phone as string | undefined;
            const hours = tags.opening_hours as string | undefined;
            const website = tags.website as string | undefined;
            const suburb = tags["addr:suburb"] || tags["addr:city"] || tags["addr:town"];

            return (
              <>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "flex-start" }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 16, fontWeight: 950, color: "var(--roam-text)" }} className="trip-truncate">
                      {focused.name}
                    </div>

                    <div style={{ marginTop: 4, fontSize: 12, fontWeight: 850, color: "var(--roam-text-muted)" }} className="trip-truncate">
                      {fmtCategory(focused.category)}
                      {suburb ? ` · ${suburb}` : ""}
                      {phone ? " · 📞" : ""}
                      {isOnline && website ? " · 🔗" : ""}
                    </div>

                    {addr ? (
                      <div style={{ marginTop: 6, fontSize: 12, fontWeight: 850, color: "var(--roam-text-muted)" }}>
                        {addr}
                      </div>
                    ) : null}

                    {hours ? (
                      <div style={{ marginTop: 6, fontSize: 12, fontWeight: 850, color: "var(--roam-text-muted)" }} title={hours} className="trip-truncate">
                        Hours: {hours}
                      </div>
                    ) : null}
                  </div>

                  <button
                    type="button"
                    className="trip-btn-sm trip-interactive"
                    onClick={() => {
                      haptic.selection();
                      onFocusPlace(null);
                    }}
                    style={{
                      borderRadius: 14,
                      minHeight: 40,
                      padding: "0 12px",
                      fontWeight: 950,
                      background: "var(--roam-surface-hover)",
                      color: "var(--roam-text)",
                      boxShadow: "var(--shadow-button)",
                      whiteSpace: "nowrap",
                    }}
                  >
                    Close
                  </button>
                </div>

                <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 12 }}>
                  <button
                    type="button"
                    className="trip-btn-sm trip-interactive"
                    onClick={() => {
                      haptic.medium();
                      onAddStop(focused);
                    }}
                    style={{
                      borderRadius: 14,
                      minHeight: 44,
                      padding: "0 14px",
                      fontWeight: 950,
                      background: "var(--roam-surface-hover)",
                      color: "var(--roam-text)",
                      boxShadow: "var(--shadow-button)",
                    }}
                  >
                    Add to trip
                  </button>

                  {onShowOnMap ? (
                    <button
                      type="button"
                      className="trip-btn-sm trip-interactive"
                      onClick={() => {
                        haptic.selection();
                        onShowOnMap(focused.id);
                      }}
                      style={{
                        borderRadius: 14,
                        minHeight: 44,
                        padding: "0 14px",
                        fontWeight: 950,
                        background: "var(--roam-surface-hover)",
                        color: "var(--roam-text)",
                        boxShadow: "var(--shadow-button)",
                      }}
                    >
                      Show on map
                    </button>
                  ) : null}

                  {phone ? (
                    <a
                      href={`tel:${phone}`}
                      className="trip-btn-sm trip-interactive"
                      onClick={() => haptic.selection()}
                      style={{
                        textDecoration: "none",
                        display: "inline-flex",
                        alignItems: "center",
                        justifyContent: "center",
                        borderRadius: 14,
                        minHeight: 44,
                        padding: "0 14px",
                        fontWeight: 950,
                        background: "var(--roam-surface-hover)",
                        color: "var(--roam-text)",
                        boxShadow: "var(--shadow-button)",
                      }}
                    >
                      Call
                    </a>
                  ) : null}

                  {isOnline && tags.website ? (
                    <button
                      type="button"
                      className="trip-btn-sm trip-interactive"
                      onClick={() => {
                        haptic.selection();
                        safeOpen(String(tags.website));
                      }}
                      style={{
                        borderRadius: 14,
                        minHeight: 44,
                        padding: "0 14px",
                        fontWeight: 950,
                        background: "var(--roam-surface-hover)",
                        color: "var(--roam-text)",
                        boxShadow: "var(--shadow-button)",
                      }}
                    >
                      Website
                    </button>
                  ) : null}
                </div>
              </>
            );
          })()}
        </div>
      ) : null}

      {/* Search + chips */}
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search places by name…"
          className="trip-interactive"
          style={{
            padding: "12px 14px",
            borderRadius: 16,
            border: "none",
            outline: "none",
            background: "var(--roam-surface)",
            color: "var(--roam-text)",
            fontSize: 14,
            fontWeight: 850,
            boxShadow: "var(--shadow-soft)",
          }}
        />

        <div style={{ display: "flex", gap: 10, overflowX: "auto", paddingBottom: 4, WebkitOverflowScrolling: "touch" }}>
          {CHIPS.map((c) => {
            const active = chip === c.key;
            return (
              <button
                key={c.key}
                type="button"
                className="trip-interactive"
                onClick={() => {
                  haptic.selection();
                  setChip(c.key);
                }}
                style={{
                  flex: "0 0 auto",
                  borderRadius: 999,
                  border: "none",
                  padding: "10px 12px",
                  fontSize: 13,
                  fontWeight: 950,
                  background: active ? "var(--roam-surface-hover)" : "var(--roam-surface)",
                  color: active ? "var(--roam-text)" : "var(--roam-text-muted)",
                  boxShadow: active ? "var(--shadow-button)" : "var(--shadow-soft)",
                }}
              >
                {c.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* List */}
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {filteredItems.length === 0 ? (
          <div style={{ padding: 18, textAlign: "center", color: "var(--roam-text-muted)", fontSize: 14, fontWeight: 850, background: "var(--roam-surface)", borderRadius: 20, boxShadow: "var(--shadow-soft)" }}>
            No places found.
          </div>
        ) : (
          filteredItems.map((p) => {
            const isFocused = focusedPlaceId === p.id;
            const tags = getTags(p);
            const suburb = tags["addr:suburb"] || tags["addr:city"] || tags["addr:town"];
            const phone = tags.phone as string | undefined;
            const website = tags.website as string | undefined;

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
                  <div style={{ fontSize: 15, fontWeight: 950, color: "var(--roam-text)" }} className="trip-truncate">
                    {p.name}
                  </div>
                  <div style={{ fontSize: 12, color: "var(--roam-text-muted)", marginTop: 4, fontWeight: 850 }} className="trip-truncate">
                    {fmtCategory(p.category)}
                    {suburb ? ` · ${suburb}` : ""}
                    {phone ? " · 📞" : ""}
                    {isOnline && website ? " · 🔗" : ""}
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
                    fontWeight: 950,
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
