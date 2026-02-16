// src/components/trip/TripView.tsx
"use client";

import { useEffect, useMemo, useState, useCallback } from "react";
import type { NavPack, CorridorGraphPack, TrafficOverlay, HazardOverlay } from "@/lib/types/navigation";
import type { TripStop } from "@/lib/types/trip";
import type { PlacesPack, PlaceItem } from "@/lib/types/places";
import type { RoamPosition } from "@/lib/native/geolocation";
import { haptic } from "@/lib/native/haptics";
import { hideKeyboard } from "@/lib/native/keyboard";
import { shortId } from "@/lib/utils/ids";

import { TripAlertsPanel, type AlertFocusEvent } from "@/components/trip/TripAlertsPanel";
import { TripSuggestionsPanel } from "@/components/trip/TripSuggestionsPanel";

/* ── Types ────────────────────────────────────────────────────────────── */

export type TripEditorRebuildMode = "auto" | "online" | "offline";

type ActiveSection = "route" | "alerts" | "suggestions";

/* ── Helpers ──────────────────────────────────────────────────────────── */

function ensureStopIds(stops: TripStop[]): TripStop[] {
  return (stops ?? []).map((s) => (s.id ? s : { ...s, id: shortId() }));
}

function isLockedStop(s: TripStop) {
  const t = s.type ?? "poi";
  return t === "start" || t === "end";
}

function stopLabel(s: TripStop, idx: number) {
  const t = s.type ?? "poi";
  const name = s.name?.trim();
  if (name) return name;
  if (t === "start") return "Start";
  if (t === "end") return "End";
  return `Stop ${idx + 1}`;
}

function stopTypeColor(type: string | undefined): string {
  switch (type) {
    case "start": return "#22c55e";
    case "end":   return "#ef4444";
    case "via":   return "#a855f7";
    default:      return "#2e7cf6";
  }
}

function formatDist(m: number): string {
  if (m < 1000) return `${Math.round(m)} m`;
  return `${(m / 1000).toFixed(1)} km`;
}

function formatDur(s: number): string {
  const hrs = Math.floor(s / 3600);
  const mins = Math.round((s % 3600) / 60);
  if (hrs === 0) return `${mins} min`;
  return `${hrs}h ${mins}m`;
}

/* ── Component ────────────────────────────────────────────────────────── */

export function TripView({
  planId,
  navpack,
  corridor,
  places,
  traffic,
  hazards,

  focusedStopId,
  onFocusStop,
  focusedPlaceId,
  onFocusPlace,

  onRebuildRequested,
  onAddSuggestion,
  onFocusTrafficEvent,
  onFocusHazardEvent,
  onFocusAlert,
  userPosition,
}: {
  planId: string;
  navpack: NavPack | null;
  corridor: CorridorGraphPack | null;
  places?: PlacesPack | null;
  traffic?: TrafficOverlay | null;
  hazards?: HazardOverlay | null;

  focusedStopId: string | null;
  onFocusStop: (id: string | null) => void;
  focusedPlaceId?: string | null;
  onFocusPlace?: (placeId: string | null) => void;

  onRebuildRequested?: (args: { stops: TripStop[]; mode: TripEditorRebuildMode }) => Promise<void>;
  onAddSuggestion?: (place: PlaceItem) => Promise<void> | void;
  onFocusTrafficEvent?: (id: string) => void;
  onFocusHazardEvent?: (id: string) => void;
  onFocusAlert?: (focus: AlertFocusEvent) => void;
  userPosition?: RoamPosition | null;
}) {
  /* ── Editor state ───────────────────────────────────────────────────── */
  const [stops, setStops] = useState<TripStop[]>(() => ensureStopIds(navpack?.req?.stops ?? []));
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [activeSection, setActiveSection] = useState<ActiveSection>("route");
  const [mode] = useState<TripEditorRebuildMode>("auto");

  // Sync stops from navpack when it changes
  useEffect(() => {
    setStops(ensureStopIds(navpack?.req?.stops ?? []));
    setDirty(false);
    setErr(null);
  }, [navpack]);

  const canRebuild = stops.length >= 2 && !!corridor && !!onRebuildRequested;

  /* ── Stop editing ───────────────────────────────────────────────────── */
  const moveStop = useCallback((fromIdx: number, dir: -1 | 1) => {
    haptic.selection();
    setStops((prev) => {
      const toIdx = fromIdx + dir;
      if (toIdx < 0 || toIdx >= prev.length) return prev;
      const from = prev[fromIdx];
      const to = prev[toIdx];
      if (!from || !to || isLockedStop(from) || isLockedStop(to)) return prev;
      const out = [...prev];
      const [moved] = out.splice(fromIdx, 1);
      out.splice(toIdx, 0, moved);
      return out;
    });
    setDirty(true);
  }, []);

  const removeStop = useCallback((id?: string | null) => {
    if (!id) return;
    haptic.medium();
    setStops((prev) => {
      const s = prev.find((x) => x.id === id);
      if (!s || isLockedStop(s)) return prev;
      return prev.filter((x) => x.id !== id);
    });
    if (focusedStopId === id) onFocusStop(null);
    setDirty(true);
  }, [focusedStopId, onFocusStop]);

  const addStopFromPlace = useCallback((p: PlaceItem) => {
    haptic.tap();
    if (onAddSuggestion) {
      onAddSuggestion(p);
      return;
    }
    setStops((prev) => {
      const out = [...prev];
      const endIdx = out.findIndex((s) => (s.type ?? "poi") === "end");
      const next: TripStop = { id: shortId(), type: "poi", name: p.name, lat: p.lat, lng: p.lng };
      if (endIdx >= 0) out.splice(endIdx, 0, next); else out.push(next);
      return out;
    });
    setDirty(true);
    hideKeyboard();
    setActiveSection("route");
  }, [onAddSuggestion]);

  const reset = useCallback(() => {
    haptic.tap();
    setStops(ensureStopIds(navpack?.req?.stops ?? []));
    setDirty(false);
    setErr(null);
  }, [navpack]);

  const rebuild = useCallback(async () => {
    if (!canRebuild || !onRebuildRequested) return;
    haptic.medium();
    hideKeyboard();
    setBusy("rebuilding");
    setErr(null);
    try {
      await onRebuildRequested({ stops: ensureStopIds(stops), mode });
      setDirty(false);
      haptic.success();
    } catch (e: any) {
      setErr(e?.message ?? "Rebuild failed");
      haptic.error();
    } finally {
      setBusy(null);
    }
  }, [canRebuild, onRebuildRequested, stops, mode]);

  /* ── Derived ────────────────────────────────────────────────────────── */
  const distance = navpack?.primary?.distance_m ?? 0;
  const duration = navpack?.primary?.duration_s ?? 0;
  const alertCount = (traffic?.items?.length ?? 0) + (hazards?.items?.length ?? 0);
  const highAlertCount =
    (traffic?.items?.filter((t) => t.severity === "major").length ?? 0) +
    (hazards?.items?.filter((h) => h.severity === "high").length ?? 0);

  /* ── Render: no navpack ─────────────────────────────────────────────── */
  if (!navpack) {
    return (
      <div style={{ color: "var(--roam-text-muted)", fontWeight: 700, fontSize: 14, padding: "20px 0" }}>
        No route active.
      </div>
    );
  }

  /* ── Section tabs ───────────────────────────────────────────────────── */
  const tabs: { key: ActiveSection; label: string; badge?: string; badgeColor?: string }[] = [
    { key: "route", label: "Route" },
    {
      key: "alerts",
      label: "Alerts",
      badge: alertCount > 0 ? String(alertCount) : undefined,
      badgeColor: highAlertCount > 0 ? "#ef4444" : alertCount > 0 ? "#f59e0b" : undefined,
    },
    { key: "suggestions", label: "Places", badge: places?.items?.length ? String(places.items.length) : undefined },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {/* Route Summary Card */}
      <div
        style={{
          padding: "14px 16px",
          background: "color-mix(in srgb, var(--roam-surface-hover) 78%, var(--roam-surface) 22%)",
          borderRadius: 16,
          boxShadow: "var(--shadow-soft)",
          border: "1px solid color-mix(in srgb, var(--roam-surface-hover) 55%, transparent)",
        }}
      >
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12 }}>
          <div style={{ fontSize: 14, fontWeight: 900, color: "var(--roam-text)", margin: 0 }}>
            Route Overview
          </div>
          <div style={{ fontSize: 12, fontWeight: 850, color: "var(--roam-text-muted)" }}>
            {formatDist(distance)} · {formatDur(duration)}
          </div>
        </div>

        {/* Quick alert banner if high severity */}
        {highAlertCount > 0 && (
          <div
            onClick={() => { haptic.selection(); setActiveSection("alerts"); }}
            style={{
              marginTop: 10,
              padding: "8px 12px",
              borderRadius: 10,
              background: "rgba(239,68,68,0.10)",
              border: "1px solid rgba(239,68,68,0.18)",
              display: "flex",
              alignItems: "center",
              gap: 8,
              cursor: "pointer",
            }}
          >
            <span style={{ fontSize: 13 }}>🚨</span>
            <span style={{ fontSize: 11, fontWeight: 900, color: "#ef4444" }}>
              {highAlertCount} critical alert{highAlertCount !== 1 ? "s" : ""} — tap to view
            </span>
          </div>
        )}

        {/* Dirty indicator */}
        {dirty && (
          <div
            style={{
              marginTop: 10,
              padding: "6px 10px",
              borderRadius: 8,
              background: "rgba(245,158,11,0.10)",
              border: "1px solid rgba(245,158,11,0.18)",
              fontSize: 11,
              fontWeight: 900,
              color: "#f59e0b",
              display: "flex",
              alignItems: "center",
              gap: 6,
            }}
          >
            <span>✏️</span> Unsaved route changes
          </div>
        )}
      </div>

      {/* Error display */}
      {err && (
        <div
          style={{
            padding: "10px 14px",
            borderRadius: 12,
            background: "rgba(239,68,68,0.10)",
            border: "1px solid rgba(239,68,68,0.15)",
            fontSize: 12,
            fontWeight: 800,
            color: "#ef4444",
          }}
        >
          {err}
        </div>
      )}

      {/* Section Tabs */}
      <div style={{ display: "flex", gap: 6, overflowX: "auto", WebkitOverflowScrolling: "touch" }}>
        {tabs.map((tab) => {
          const active = activeSection === tab.key;
          return (
            <button
              key={tab.key}
              type="button"
              onClick={() => { haptic.selection(); setActiveSection(tab.key); }}
              style={{
                padding: "8px 14px",
                borderRadius: 12,
                border: "none",
                fontSize: 13,
                fontWeight: 950,
                cursor: "pointer",
                whiteSpace: "nowrap",
                background: active ? "var(--roam-accent, #2563eb)" : "var(--roam-surface-hover)",
                color: active ? "#fff" : "var(--roam-text-muted)",
                boxShadow: active ? "0 2px 8px rgba(37,99,235,0.25)" : "none",
                transition: "all 0.12s ease",
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
              }}
            >
              {tab.label}
              {tab.badge && (
                <span
                  style={{
                    fontSize: 10,
                    fontWeight: 950,
                    background: active
                      ? "rgba(255,255,255,0.25)"
                      : tab.badgeColor
                        ? `color-mix(in srgb, ${tab.badgeColor} 15%, transparent)`
                        : "rgba(100,116,139,0.12)",
                    color: active ? "#fff" : tab.badgeColor ?? "var(--roam-text-muted)",
                    padding: "2px 6px",
                    borderRadius: 6,
                    minWidth: 18,
                    textAlign: "center",
                  }}
                >
                  {tab.badge}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* ── Route Section ──────────────────────────────────────────────── */}
      {activeSection === "route" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {stops.map((stop, index) => {
            const isFocused = focusedStopId === stop.id;
            const locked = isLockedStop(stop);
            const typeColor = stopTypeColor(stop.type);

            return (
              <div
                key={stop.id ?? index}
                onClick={() => { haptic.selection(); onFocusStop(stop.id ?? null); }}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  padding: "11px 12px",
                  borderRadius: 16,
                  cursor: "pointer",
                  background: isFocused
                    ? "color-mix(in srgb, var(--roam-surface-hover) 86%, var(--roam-surface) 14%)"
                    : "var(--roam-surface)",
                  boxShadow: isFocused ? "var(--shadow-heavy)" : "var(--shadow-soft)",
                  outline: isFocused ? `2.5px solid ${typeColor}` : "2.5px solid transparent",
                  outlineOffset: -2.5,
                  border: "1px solid color-mix(in srgb, var(--roam-surface-hover) 45%, transparent)",
                  transition: "outline 0.12s ease, box-shadow 0.12s ease",
                }}
              >
                {/* Index pill */}
                <div
                  style={{
                    width: 28,
                    height: 28,
                    borderRadius: 999,
                    background: typeColor,
                    color: "#fff",
                    display: "grid",
                    placeItems: "center",
                    fontSize: 12,
                    fontWeight: 950,
                    flexShrink: 0,
                    boxShadow: `0 2px 6px color-mix(in srgb, ${typeColor} 40%, transparent)`,
                  }}
                >
                  {index + 1}
                </div>

                {/* Name + coords */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    style={{
                      fontSize: 14,
                      fontWeight: 950,
                      color: "var(--roam-text)",
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      letterSpacing: "-0.1px",
                    }}
                  >
                    {stopLabel(stop, index)}
                  </div>
                  {typeof stop.lat === "number" && typeof stop.lng === "number" && (
                    <div style={{ fontSize: 11, color: "var(--roam-text-muted)", marginTop: 2, fontWeight: 700 }}>
                      {stop.lat.toFixed(4)}, {stop.lng.toFixed(4)}
                    </div>
                  )}
                </div>

                {/* Edit controls */}
                {!locked && (
                  <div style={{ display: "flex", gap: 5, alignItems: "center" }}>
                    {index > 1 && (
                      <button
                        type="button"
                        disabled={!!busy}
                        onClick={(e) => { e.stopPropagation(); moveStop(index, -1); }}
                        style={{
                          width: 36, height: 36, borderRadius: 12, border: "none",
                          background: "var(--roam-surface-hover)", color: "var(--roam-text-muted)",
                          fontSize: 14, fontWeight: 900, cursor: "pointer",
                          boxShadow: "var(--shadow-button)",
                          display: "grid", placeItems: "center",
                        }}
                        aria-label="Move up"
                      >
                        ↑
                      </button>
                    )}
                    {index < stops.length - 2 && (
                      <button
                        type="button"
                        disabled={!!busy}
                        onClick={(e) => { e.stopPropagation(); moveStop(index, 1); }}
                        style={{
                          width: 36, height: 36, borderRadius: 12, border: "none",
                          background: "var(--roam-surface-hover)", color: "var(--roam-text-muted)",
                          fontSize: 14, fontWeight: 900, cursor: "pointer",
                          boxShadow: "var(--shadow-button)",
                          display: "grid", placeItems: "center",
                        }}
                        aria-label="Move down"
                      >
                        ↓
                      </button>
                    )}
                    <button
                      type="button"
                      disabled={!!busy}
                      onClick={(e) => { e.stopPropagation(); removeStop(stop.id); }}
                      style={{
                        width: 36, height: 36, borderRadius: 12, border: "none",
                        background: "color-mix(in srgb, var(--roam-danger) 12%, var(--roam-surface-hover))",
                        color: "color-mix(in srgb, var(--roam-danger) 72%, var(--roam-text))",
                        fontSize: 14, fontWeight: 950, cursor: "pointer",
                        boxShadow: "var(--shadow-button)",
                        display: "grid", placeItems: "center",
                      }}
                      aria-label="Remove stop"
                    >
                      ✕
                    </button>
                  </div>
                )}
              </div>
            );
          })}

          {/* Add stop button */}
          <button
            type="button"
            onClick={() => { haptic.tap(); setActiveSection("suggestions"); }}
            disabled={!!busy}
            style={{
              padding: "12px 16px",
              borderRadius: 14,
              border: "2px dashed color-mix(in srgb, var(--roam-text-muted) 30%, transparent)",
              background: "transparent",
              color: "var(--roam-text-muted)",
              fontSize: 13,
              fontWeight: 900,
              cursor: "pointer",
              textAlign: "center",
              transition: "border-color 0.12s ease, color 0.12s ease",
            }}
          >
            + Add Stop from Places
          </button>

          {/* Save / Reset footer */}
          {dirty && (
            <div style={{ display: "flex", gap: 10, marginTop: 4 }}>
              <button
                type="button"
                disabled={!!busy}
                onClick={reset}
                style={{
                  flex: 1,
                  padding: "12px 0",
                  borderRadius: 14,
                  border: "1px solid color-mix(in srgb, var(--roam-text-muted) 25%, transparent)",
                  background: "transparent",
                  color: "var(--roam-text-muted)",
                  fontSize: 13,
                  fontWeight: 950,
                  cursor: "pointer",
                }}
              >
                Reset
              </button>
              <button
                type="button"
                disabled={!!busy || !canRebuild}
                onClick={rebuild}
                style={{
                  flex: 2,
                  padding: "12px 0",
                  borderRadius: 14,
                  border: "none",
                  background: canRebuild ? "var(--roam-accent, #2563eb)" : "var(--roam-surface-hover)",
                  color: canRebuild ? "#fff" : "var(--roam-text-muted)",
                  fontSize: 13,
                  fontWeight: 950,
                  cursor: canRebuild ? "pointer" : "not-allowed",
                  boxShadow: canRebuild ? "0 2px 8px rgba(37,99,235,0.25)" : "none",
                  transition: "all 0.12s ease",
                  position: "relative",
                  overflow: "hidden",
                }}
              >
                {busy ? (
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                    <span
                      style={{
                        width: 14, height: 14, borderRadius: 999,
                        border: "2px solid rgba(255,255,255,0.3)",
                        borderTopColor: "#fff",
                        animation: "roam-spin 0.6s linear infinite",
                        display: "inline-block",
                      }}
                    />
                    Saving…
                  </span>
                ) : "Save Route"}
              </button>
            </div>
          )}
        </div>
      )}

      {/* ── Alerts Section ─────────────────────────────────────────────── */}
      {activeSection === "alerts" && (
        <TripAlertsPanel
          traffic={traffic ?? null}
          hazards={hazards ?? null}
          routeGeometry={navpack?.primary?.geometry ?? null}
          userPosition={userPosition}
          onFocusAlert={onFocusAlert}
        />
      )}

      {/* ── Suggestions Section ────────────────────────────────────────── */}
      {activeSection === "suggestions" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {places && places.items.length > 0 ? (
            <TripSuggestionsPanel
              places={places}
              enableSearch={true}
              maxHeight="50vh"
              focusedPlaceId={focusedPlaceId ?? null}
              onFocusPlace={onFocusPlace}
              onAddStopFromPlace={addStopFromPlace}
            />
          ) : (
            <div
              style={{
                padding: "20px 14px",
                borderRadius: 16,
                background: "var(--roam-surface-hover)",
                textAlign: "center",
              }}
            >
              <div style={{ fontSize: 24, marginBottom: 8 }}>🗺️</div>
              <div style={{ fontSize: 13, fontWeight: 900, color: "var(--roam-text)" }}>
                No places loaded yet
              </div>
              <div style={{ fontSize: 11, fontWeight: 700, color: "var(--roam-text-muted)", marginTop: 4 }}>
                Places will appear here once your route corridor is loaded
              </div>
            </div>
          )}
        </div>
      )}

      {/* Spinner animation */}
      <style>{`
        @keyframes roam-spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}