import React, { useCallback } from "react";
import type { TripPreferences, CategoryGroup } from "@/lib/types/trip";
import {
  Fuel,
  Utensils,
  Tent,
  TreePine,
  Landmark,
  Baby,
  ShoppingCart,
  SlidersHorizontal,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { haptic } from "@/lib/native/haptics";

/* ── Category group metadata ─────────────────────────────────── */

type GroupMeta = {
  key: CategoryGroup;
  label: string;
  Icon: LucideIcon;
  color: string;
};

const GROUPS: GroupMeta[] = [
  { key: "essentials",     label: "Essentials",     Icon: Fuel,         color: "var(--roam-danger)" },
  { key: "food",           label: "Food & Drink",   Icon: Utensils,     color: "#f59e0b" },
  { key: "accommodation",  label: "Accommodation",  Icon: Tent,         color: "#8b5cf6" },
  { key: "nature",         label: "Nature",         Icon: TreePine,     color: "#22c55e" },
  { key: "culture",        label: "Culture",        Icon: Landmark,     color: "#3b82f6" },
  { key: "family",         label: "Family",         Icon: Baby,         color: "#ec4899" },
  { key: "supplies",       label: "Supplies",       Icon: ShoppingCart,  color: "#06b6d4" },
];

/* ── Density labels ──────────────────────────────────────────── */

const DENSITY_LABELS: Record<number, { label: string; desc: string }> = {
  1: { label: "Minimal",    desc: "Fuel & rest stops only" },
  2: { label: "Light",      desc: "Essentials + key highlights" },
  3: { label: "Balanced",   desc: "A good mix of everything" },
  4: { label: "Generous",   desc: "More stops to explore" },
  5: { label: "Everything", desc: "Maximum discovery" },
};

/* ── Component ───────────────────────────────────────────────── */

export function TripPrefsPanel({
  prefs,
  onChange,
  collapsed,
  onToggleCollapse,
}: {
  prefs: TripPreferences;
  onChange: (next: TripPreferences) => void;
  collapsed: boolean;
  onToggleCollapse: () => void;
}) {
  const setDensity = useCallback(
    (d: number) => {
      haptic.selection();
      onChange({ ...prefs, stop_density: d });
    },
    [prefs, onChange],
  );

  const toggleGroup = useCallback(
    (group: CategoryGroup) => {
      haptic.selection();
      // Don't allow disabling essentials
      if (group === "essentials") return;
      onChange({
        ...prefs,
        categories: {
          ...prefs.categories,
          [group]: !prefs.categories[group],
        },
      });
    },
    [prefs, onChange],
  );

  const densityMeta = DENSITY_LABELS[prefs.stop_density] ?? DENSITY_LABELS[3];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
      {/* ── Collapse header ── */}
      <button
        type="button"
        onClick={() => {
          haptic.selection();
          onToggleCollapse();
        }}
        className="trip-interactive"
        style={{
          all: "unset",
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "10px 2px",
          WebkitTapHighlightColor: "transparent",
        }}
      >
        <div
          style={{
            width: 28,
            height: 28,
            borderRadius: "var(--r-card)",
            display: "grid",
            placeItems: "center",
            background: "rgba(59,130,246,0.10)",
            color: "#3b82f6",
            flexShrink: 0,
          }}
        >
          <SlidersHorizontal size={14} />
        </div>
        <span
          style={{
            fontSize: 13,
            fontWeight: 700,
            color: "var(--roam-text)",
            flex: 1,
          }}
        >
          Trip Preferences
        </span>
        <svg
          width={16}
          height={16}
          viewBox="0 0 16 16"
          fill="none"
          style={{
            color: "var(--roam-text-muted)",
            transition: "transform 0.25s",
            transform: collapsed ? "rotate(0deg)" : "rotate(180deg)",
            flexShrink: 0,
          }}
        >
          <path
            d="M4 6l4 4 4-4"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>

      {/* ── Expandable content ── */}
      <div
        style={{
          overflow: "hidden",
          maxHeight: collapsed ? 0 : 500,
          opacity: collapsed ? 0 : 1,
          transition: "max-height 0.3s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.2s",
        }}
      >
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 16,
            padding: "4px 0 12px",
          }}
        >
          {/* ── Stop density slider ── */}
          <div>
            <div
              style={{
                display: "flex",
                alignItems: "baseline",
                justifyContent: "space-between",
                marginBottom: 8,
              }}
            >
              <span style={{ fontSize: 12, fontWeight: 700, color: "var(--roam-text)", letterSpacing: "-0.01em" }}>
                Stops Along the Way
              </span>
              <span style={{ fontSize: 11, fontWeight: 600, color: "var(--roam-text-muted)" }}>
                {densityMeta.label}
              </span>
            </div>

            {/* Range slider */}
            <div style={{ padding: "4px 2px" }}>
              <input
                type="range"
                min={1}
                max={5}
                step={1}
                value={prefs.stop_density}
                onChange={(e) => setDensity(Number(e.target.value))}
                aria-label="Stop density"
                style={{
                  width: "100%",
                  height: 6,
                  appearance: "none",
                  WebkitAppearance: "none",
                  background: `linear-gradient(to right, #2563eb 0%, #2563eb ${((prefs.stop_density - 1) / 4) * 100}%, var(--roam-border, #d1d5db) ${((prefs.stop_density - 1) / 4) * 100}%, var(--roam-border, #d1d5db) 100%)`,
                  borderRadius: 999,
                  outline: "none",
                  cursor: "pointer",
                }}
              />
              <div style={{ display: "flex", justifyContent: "space-between", marginTop: 4 }}>
                <span style={{ fontSize: 10, fontWeight: 600, color: "var(--roam-text-muted)" }}>Minimal</span>
                <span style={{ fontSize: 10, fontWeight: 600, color: "var(--roam-text-muted)" }}>Everything</span>
              </div>
            </div>

            <div
              style={{
                fontSize: 11,
                color: "var(--roam-text-muted)",
                fontWeight: 500,
                marginTop: 4,
                textAlign: "center",
              }}
            >
              {densityMeta.desc}
            </div>
          </div>

          {/* ── Category toggles ── */}
          <div>
            <div style={{ fontSize: 12, fontWeight: 700, color: "var(--roam-text)", marginBottom: 8, letterSpacing: "-0.01em" }}>
              What to Include
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: 6,
              }}
            >
              {GROUPS.map(({ key, label, Icon, color }) => {
                const on = prefs.categories[key] ?? true;
                const isEssentials = key === "essentials";
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => toggleGroup(key)}
                    className="trip-interactive"
                    style={{
                      all: "unset",
                      cursor: isEssentials ? "default" : "pointer",
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      padding: "10px 10px",
                      minHeight: 44,
                      boxSizing: "border-box",
                      borderRadius: "var(--r-card)",
                      border: `1.5px solid ${on ? `${color}40` : "var(--roam-border)"}`,
                      background: on ? `${color}0A` : "transparent",
                      opacity: on ? 1 : 0.5,
                      transition: "all 0.2s",
                      WebkitTapHighlightColor: "transparent",
                    }}
                  >
                    <Icon
                      size={14}
                      style={{
                        color: on ? color : "var(--roam-text-muted)",
                        flexShrink: 0,
                        transition: "color 0.2s",
                      }}
                    />
                    <span
                      style={{
                        fontSize: 12,
                        fontWeight: on ? 700 : 600,
                        color: on ? "var(--roam-text)" : "var(--roam-text-muted)",
                        transition: "color 0.2s",
                      }}
                    >
                      {label}
                    </span>
                    {isEssentials && (
                      <span style={{ fontSize: 9, fontWeight: 700, color, marginLeft: "auto", textTransform: "uppercase", letterSpacing: "0.04em" }}>
                        Always on
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
