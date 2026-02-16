// src/components/trip/TripSuggestionsPanel.tsx
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { PlaceCategory, PlaceItem, PlacesPack } from "@/lib/types/places";
import { haptic } from "@/lib/native/haptics";

import type { LucideIcon } from "lucide-react";
import {
  Search,
  Layers,
  Fuel,
  Zap,
  ParkingMeter,
  Bath,
  Droplets,
  Trash2,
  Wrench,
  Hospital,
  Pill,
  ShoppingCart,
  Building2,
  Banknote,
  Shirt,
  Star,
  Coffee,
  Utensils,
  Beer,
  Wine,
  Tent,
  Bed,
  Eye,
  Waves,
  Mountain,
  TreePine,
  Thermometer,
  Baby,
  Compass,
  Info,
  Landmark,
  Camera,
  Store,
  MapPin,
} from "lucide-react";

function fmtCat(c: PlaceCategory) {
  return c.replace(/_/g, " ");
}

// ──────────────────────────────────────────────────────────────
// All categories — matches backend _CORRIDOR_DEFAULT_CATS exactly.
// Organised: safety → supplies → food → accommodation →
// nature → family → culture → geocoding
// ──────────────────────────────────────────────────────────────

const ALL_CATS: PlaceCategory[] = [
  // Essentials & safety
  "fuel", "ev_charging", "rest_area", "toilet", "water",
  "dump_point", "mechanic", "hospital", "pharmacy",
  // Supplies
  "grocery", "town", "atm", "laundromat",
  // Food & drink
  "bakery", "cafe", "restaurant", "fast_food", "pub", "bar",
  // Accommodation
  "camp", "hotel", "motel", "hostel",
  // Nature & outdoors
  "viewpoint", "waterfall", "swimming_hole", "beach",
  "national_park", "hiking", "picnic", "hot_spring",
  // Family & recreation
  "playground", "pool", "zoo", "theme_park",
  // Culture & sightseeing
  "visitor_info", "museum", "gallery", "heritage",
  "winery", "brewery", "attraction", "market", "park",
];

// ──────────────────────────────────────────────────────────────
// Chip config — icon + label for the filter bar
// ──────────────────────────────────────────────────────────────

type ChipDef = { key: PlaceCategory | "all"; label: string; Icon: LucideIcon };

const CHIP_DEFS: ChipDef[] = [
  { key: "all",           label: "All",         Icon: Layers },
  // Safety & essentials
  { key: "fuel",          label: "Fuel",        Icon: Fuel },
  { key: "ev_charging",   label: "EV",          Icon: Zap },
  { key: "rest_area",     label: "Rest",        Icon: ParkingMeter },
  { key: "toilet",        label: "Toilets",     Icon: Bath },
  { key: "water",         label: "Water",       Icon: Droplets },
  { key: "dump_point",    label: "Dump",        Icon: Trash2 },
  { key: "mechanic",      label: "Mechanic",    Icon: Wrench },
  { key: "hospital",      label: "Hospital",    Icon: Hospital },
  { key: "pharmacy",      label: "Pharmacy",    Icon: Pill },
  // Supplies
  { key: "grocery",       label: "Grocery",     Icon: ShoppingCart },
  { key: "town",          label: "Towns",       Icon: Building2 },
  { key: "atm",           label: "ATM",         Icon: Banknote },
  { key: "laundromat",    label: "Laundry",     Icon: Shirt },
  // Food & drink
  { key: "bakery",        label: "Bakery",      Icon: Star },
  { key: "cafe",          label: "Café",        Icon: Coffee },
  { key: "restaurant",    label: "Food",        Icon: Utensils },
  { key: "fast_food",     label: "Takeaway",    Icon: Utensils },
  { key: "pub",           label: "Pub",         Icon: Beer },
  { key: "bar",           label: "Bar",         Icon: Beer },
  // Accommodation
  { key: "camp",          label: "Camp",        Icon: Tent },
  { key: "hotel",         label: "Hotel",       Icon: Bed },
  { key: "motel",         label: "Motel",       Icon: Bed },
  { key: "hostel",        label: "Hostel",      Icon: Bed },
  // Nature & outdoors
  { key: "viewpoint",     label: "Views",       Icon: Eye },
  { key: "waterfall",     label: "Waterfall",   Icon: Waves },
  { key: "swimming_hole", label: "Swim",        Icon: Waves },
  { key: "beach",         label: "Beach",       Icon: Waves },
  { key: "national_park", label: "Nat Parks",   Icon: TreePine },
  { key: "hiking",        label: "Hiking",      Icon: Mountain },
  { key: "picnic",        label: "Picnic",      Icon: TreePine },
  { key: "hot_spring",    label: "Hot Spring",  Icon: Thermometer },
  // Family & recreation
  { key: "playground",    label: "Kids",        Icon: Baby },
  { key: "pool",          label: "Pool",        Icon: Waves },
  { key: "zoo",           label: "Zoo",         Icon: Compass },
  { key: "theme_park",    label: "Theme Park",  Icon: Star },
  // Culture & sightseeing
  { key: "visitor_info",  label: "Info",        Icon: Info },
  { key: "museum",        label: "Museum",      Icon: Landmark },
  { key: "gallery",       label: "Gallery",     Icon: Landmark },
  { key: "heritage",      label: "Heritage",    Icon: Landmark },
  { key: "winery",        label: "Wine",        Icon: Wine },
  { key: "brewery",       label: "Brew",        Icon: Beer },
  { key: "attraction",    label: "Sights",      Icon: Camera },
  { key: "market",        label: "Market",      Icon: Store },
  { key: "park",          label: "Park",        Icon: TreePine },
];

const CATEGORY_ICON: Record<string, LucideIcon> = {};
for (const c of CHIP_DEFS) CATEGORY_ICON[c.key] = c.Icon;

// ──────────────────────────────────────────────────────────────
// Score: priority sort when no search query is active.
// Higher score → shown first.
// Tuned for Australian road trips: fuel/water/rest are king,
// then food, sleep, nature discoveries, then everything else.
// ──────────────────────────────────────────────────────────────

function scorePlace(p: PlaceItem): number {
  const cat = String(p.category ?? "");

  // ── Essentials & safety ─────────────────────────────────
  if (cat === "fuel")          return 100;
  if (cat === "ev_charging")   return 98;
  if (cat === "water")         return 95;
  if (cat === "rest_area")     return 93;
  if (cat === "toilet")        return 90;
  if (cat === "hospital")      return 88;
  if (cat === "pharmacy")      return 85;
  if (cat === "mechanic")      return 83;
  if (cat === "dump_point")    return 80;

  // ── Anchor towns ────────────────────────────────────────
  if (cat === "town")          return 78;

  // ── Supplies ────────────────────────────────────────────
  if (cat === "grocery")       return 75;
  if (cat === "atm")           return 60;
  if (cat === "laundromat")    return 55;

  // ── Food & drink ────────────────────────────────────────
  if (cat === "bakery")        return 72;
  if (cat === "cafe")          return 70;
  if (cat === "restaurant")    return 68;
  if (cat === "fast_food")     return 65;
  if (cat === "pub")           return 62;
  if (cat === "bar")           return 58;

  // ── Accommodation ───────────────────────────────────────
  if (cat === "camp")          return 76;
  if (cat === "motel")         return 66;
  if (cat === "hotel")         return 64;
  if (cat === "hostel")        return 56;

  // ── Nature & outdoors ───────────────────────────────────
  if (cat === "viewpoint")     return 50;
  if (cat === "national_park") return 49;
  if (cat === "waterfall")     return 48;
  if (cat === "swimming_hole") return 47;
  if (cat === "beach")         return 46;
  if (cat === "hiking")        return 45;
  if (cat === "hot_spring")    return 44;
  if (cat === "picnic")        return 42;

  // ── Family & recreation ─────────────────────────────────
  if (cat === "playground")    return 38;
  if (cat === "pool")          return 37;
  if (cat === "zoo")           return 36;
  if (cat === "theme_park")    return 35;

  // ── Culture & sightseeing ───────────────────────────────
  if (cat === "winery")        return 40;
  if (cat === "brewery")       return 39;
  if (cat === "visitor_info")  return 34;
  if (cat === "museum")        return 33;
  if (cat === "gallery")       return 32;
  if (cat === "heritage")      return 31;
  if (cat === "attraction")    return 30;
  if (cat === "market")        return 29;
  if (cat === "park")          return 28;

  return 20;
}

// ──────────────────────────────────────────────────────────────
// Component
// ──────────────────────────────────────────────────────────────

export function TripSuggestionsPanel(props: {
  places: PlacesPack;
  focusedPlaceId?: string | null;
  onFocusPlace?: (placeId: string | null) => void;
  onAddStopFromPlace?: (place: PlaceItem) => void;
  enableSearch?: boolean;
  initialCats?: PlaceCategory[];
  maxHeight?: string | number;
}) {
  const items = props.places.items ?? [];
  const [q, setQ] = useState("");

  // Default: show ALL categories (was previously a hardcoded subset of 14)
  const [activeCat, setActiveCat] = useState<PlaceCategory | "all">(
    props.initialCats?.length === 1 ? props.initialCats[0] : "all",
  );

  const listRef = useRef<HTMLDivElement | null>(null);
  const rowRefs = useRef<Map<string, HTMLDivElement>>(new Map());

  const filtered = useMemo(() => {
    const qq = q.trim().toLowerCase();
    const out = items
      .filter((p) => (activeCat === "all" ? true : p.category === activeCat))
      .filter((p) => {
        if (!qq) return true;
        return (
          (p.name ?? "").toLowerCase().includes(qq) ||
          String(p.category ?? "").toLowerCase().includes(qq)
        );
      })
      .slice(0, 1200);

    if (!qq) out.sort((a, b) => scorePlace(b) - scorePlace(a));
    return out.slice(0, 600);
  }, [items, q, activeCat]);

  // Count per category for badge display
  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const p of items) {
      const cat = p.category ?? "town";
      counts[cat] = (counts[cat] ?? 0) + 1;
    }
    return counts;
  }, [items]);

  useEffect(() => {
    const id = props.focusedPlaceId ?? null;
    if (!id) return;
    const el = rowRefs.current.get(id);
    el?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [props.focusedPlaceId]);

  return (
    <div className="trip-flex-col">
      {/* Header and Search */}
      <div className="trip-flex-row trip-justify-between trip-align-center trip-mb-sm">
        <div>
          <h3 className="trip-title">Library</h3>
          <p className="trip-muted-small trip-mt-xs">
            {items.length} known locations
            {activeCat !== "all" ? ` · ${filtered.length} ${fmtCat(activeCat)}` : ""}
          </p>
        </div>

        {props.enableSearch && (
          <div className="trip-search-box">
            <span className="trip-search-icon">
              <Search />
            </span>
            <input
              value={q}
              onChange={(e) => setQ(e.currentTarget.value)}
              placeholder="Filter..."
              className="trip-input-borderless"
              aria-label="Search places"
            />
          </div>
        )}
      </div>

      {/* Categories Row (Horizontal Scroll) — full set with icons */}
      <div
        style={{
          display: "flex",
          gap: 8,
          overflowX: "auto",
          paddingBottom: 4,
          WebkitOverflowScrolling: "touch",
          marginBottom: 10,
        }}
      >
        {CHIP_DEFS.map((chip) => {
          const isActive = activeCat === chip.key;
          const count = chip.key === "all" ? items.length : (categoryCounts[chip.key] ?? 0);
          const CI = chip.Icon;

          // Skip chips with 0 items (except "all")
          if (chip.key !== "all" && count === 0) return null;

          return (
            <button
              key={chip.key}
              type="button"
              className="trip-interactive"
              onClick={() => {
                haptic.selection();
                setActiveCat(chip.key);
              }}
              style={{
                flex: "0 0 auto",
                borderRadius: 999,
                border: "none",
                padding: "8px 12px",
                fontSize: 13,
                fontWeight: 950,
                background: isActive
                  ? "var(--roam-surface-hover)"
                  : "var(--roam-surface)",
                color: isActive ? "var(--roam-text)" : "var(--roam-text-muted)",
                boxShadow: isActive
                  ? "var(--shadow-button)"
                  : "var(--shadow-soft)",
                display: "flex",
                gap: 6,
                alignItems: "center",
                cursor: "pointer",
                whiteSpace: "nowrap",
              }}
            >
              <CI size={14} />
              {chip.label}
              {count > 0 && chip.key !== "all" ? (
                <span
                  style={{
                    fontSize: 10,
                    fontWeight: 950,
                    background: isActive ? "var(--roam-accent)" : "rgba(0,0,0,0.06)",
                    color: isActive ? "white" : "var(--roam-text-muted)",
                    borderRadius: 999,
                    padding: "1px 5px",
                    minWidth: 16,
                    textAlign: "center",
                  }}
                >
                  {count}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>

      {/* Results List */}
      <div
        ref={listRef}
        className="trip-list-compact"
        style={{ maxHeight: props.maxHeight ?? "35vh", overflowY: "auto" }}
      >
        {filtered.length ? (
          filtered.map((p) => {
            const focused = props.focusedPlaceId === p.id;
            const CatIcon = CATEGORY_ICON[p.category] ?? MapPin;
            const extra: any = p.extra ?? {};
            const suburb =
              extra["addr:suburb"] || extra["addr:city"] || extra.address;

            return (
              <div
                key={p.id}
                ref={(el) => {
                  if (el) rowRefs.current.set(p.id, el);
                  else rowRefs.current.delete(p.id);
                }}
                role="button"
                tabIndex={0}
                className="trip-list-row"
                data-focused={focused}
                onClick={() => {
                  haptic.selection();
                  props.onFocusPlace?.(p.id);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    haptic.selection();
                    props.onFocusPlace?.(p.id);
                  }
                }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    flex: 1,
                    minWidth: 0,
                  }}
                >
                  <div
                    style={{
                      width: 30,
                      height: 30,
                      borderRadius: 8,
                      background: "var(--roam-surface-hover)",
                      display: "grid",
                      placeItems: "center",
                      flexShrink: 0,
                    }}
                  >
                    <CatIcon size={15} />
                  </div>
                  <div className="trip-list-row-content" style={{ minWidth: 0 }}>
                    <div className="trip-title trip-truncate">{p.name}</div>
                    <div className="trip-muted-small trip-truncate trip-mt-xs">
                      {fmtCat(p.category)}
                      {suburb
                        ? ` · ${typeof suburb === "string" ? suburb.split(",")[0] : suburb}`
                        : ""}
                    </div>
                  </div>
                </div>

                {props.onAddStopFromPlace && (
                  <button
                    type="button"
                    className="trip-btn-xs trip-btn-secondary"
                    onClick={(e) => {
                      e.stopPropagation();
                      haptic.tap();
                      props.onAddStopFromPlace?.(p);
                    }}
                  >
                    + Add
                  </button>
                )}
              </div>
            );
          })
        ) : (
          <div className="trip-empty-state">
            No matches found
            {activeCat !== "all" ? ` for "${fmtCat(activeCat)}"` : ""}.
            {activeCat !== "all" ? " Try All." : " Adjust filters."}
          </div>
        )}
      </div>
    </div>
  );
}