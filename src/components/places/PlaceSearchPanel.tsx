// src/components/places/PlaceSearchPanel.tsx
// Structured offline place search + filter panel.
// Works 100% offline against the local PlacesPack (IndexedDB).

import {
    memo,
    useCallback,
    useDeferredValue,
    useEffect,
    useLayoutEffect,
    useMemo,
    useRef,
    useState,
} from "react";
import type { PlaceCategory, PlaceItem, PlacesPack } from "@/lib/types/places";
import type { TripProgress } from "@/lib/types/guide";
import {
    searchPlaces,
    type PlaceFilter,
    type SearchResult,
    type UserPosition,
} from "@/lib/places/offlineSearch";
import { haptic } from "@/lib/native/haptics";
import { placesApi } from "@/lib/api/places";
import { CATEGORY_ICON } from "@/lib/places/categoryMeta";

import { fmtCat } from "@/lib/places/format";
import { TogglePill } from "@/components/ui/TogglePill";
import { PlaceRow } from "@/components/places/PlaceRow";
import { useSavedPlaces } from "@/lib/hooks/useSavedPlaces";
import type { SavedPlace } from "@/lib/offline/savedPlacesStore";

import type { LucideIcon } from "lucide-react";
import {
    Search,
    X,
    SlidersHorizontal,
    ChevronDown,
    ChevronUp,
    ArrowUpDown,
    MapPin,
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
    Dog,
    Film,
    Fish,
    BookOpen,
    Flag,
    ArrowUp,
    Clock,
    Plus,
    Loader2,
    Globe,
} from "lucide-react";

// ──────────────────────────────────────────────────────────────
// Category chip definitions - grouped by theme
// ──────────────────────────────────────────────────────────────

type ChipDef = { key: PlaceCategory; label: string; Icon: LucideIcon };

const CHIP_GROUPS: { label: string; chips: ChipDef[] }[] = [
  {
    label: "Essentials",
    chips: [
      { key: "fuel",        label: "Fuel",      Icon: Fuel },
      { key: "ev_charging", label: "EV",        Icon: Zap },
      { key: "water",       label: "Water",     Icon: Droplets },
      { key: "toilet",      label: "Toilets",   Icon: Bath },
      { key: "dump_point",  label: "Dump",      Icon: Trash2 },
      { key: "rest_area",   label: "Rest Area", Icon: ParkingMeter },
    ],
  },
  {
    label: "Food",
    chips: [
      { key: "cafe",        label: "Café",      Icon: Coffee },
      { key: "restaurant",  label: "Food",      Icon: Utensils },
      { key: "bakery",      label: "Bakery",    Icon: Star },
      { key: "fast_food",   label: "Takeaway",  Icon: Utensils },
      { key: "pub",         label: "Pub",       Icon: Beer },
      { key: "grocery",     label: "Grocery",   Icon: ShoppingCart },
    ],
  },
  {
    label: "Sleep",
    chips: [
      { key: "camp",        label: "Camp",      Icon: Tent },
      { key: "hotel",       label: "Hotel",     Icon: Bed },
      { key: "motel",       label: "Motel",     Icon: Bed },
      { key: "hostel",      label: "Hostel",    Icon: Bed },
    ],
  },
  {
    label: "Explore",
    chips: [
      { key: "viewpoint",     label: "Views",     Icon: Eye },
      { key: "national_park", label: "Nat Park",  Icon: TreePine },
      { key: "beach",         label: "Beach",     Icon: Waves },
      { key: "hiking",        label: "Hiking",    Icon: Mountain },
      { key: "swimming_hole", label: "Swim",      Icon: Waves },
      { key: "waterfall",     label: "Waterfall", Icon: Waves },
      { key: "hot_spring",    label: "Hot Spring",Icon: Thermometer },
      { key: "fishing",       label: "Fishing",   Icon: Fish },
      { key: "surf",          label: "Surf",      Icon: Waves },
    ],
  },
  {
    label: "More",
    chips: [
      { key: "mechanic",     label: "Mechanic",  Icon: Wrench },
      { key: "hospital",     label: "Hospital",  Icon: Hospital },
      { key: "pharmacy",     label: "Pharmacy",  Icon: Pill },
      { key: "atm",          label: "ATM",       Icon: Banknote },
      { key: "town",         label: "Towns",     Icon: Building2 },
      { key: "winery",       label: "Wine",      Icon: Wine },
      { key: "brewery",      label: "Brew",      Icon: Beer },
      { key: "playground",   label: "Kids",      Icon: Baby },
      { key: "pool",         label: "Pool",      Icon: Waves },
      { key: "dog_park",     label: "Dogs",      Icon: Dog },
      { key: "museum",       label: "Museum",    Icon: Landmark },
      { key: "gallery",      label: "Gallery",   Icon: Landmark },
      { key: "heritage",     label: "Heritage",  Icon: Landmark },
      { key: "attraction",   label: "Sights",    Icon: Camera },
      { key: "visitor_info", label: "Info",      Icon: Info },
      { key: "market",       label: "Market",    Icon: Store },
      { key: "cinema",       label: "Cinema",    Icon: Film },
      { key: "zoo",          label: "Zoo",       Icon: Compass },
      { key: "theme_park",   label: "Theme Park",Icon: Star },
      { key: "golf",         label: "Golf",      Icon: Flag },
      { key: "cave",         label: "Cave",      Icon: Mountain },
      { key: "picnic",       label: "Picnic",    Icon: TreePine },
      { key: "park",         label: "Park",      Icon: TreePine },
      { key: "laundromat",   label: "Laundry",   Icon: Shirt },
      { key: "library",      label: "Library",   Icon: BookOpen },
      { key: "showground",   label: "Showground",Icon: Flag },
      { key: "bar",          label: "Bar",       Icon: Beer },
    ],
  },
];

const ALL_CHIPS: ChipDef[] = CHIP_GROUPS.flatMap((g) => g.chips);

// Default-visible essentials shown inline. Everything else is tucked under
// a single "More" pill so the chip row doesn't dwarf the results on load.
const ESSENTIAL_CHIP_KEYS: PlaceCategory[] = [
  "fuel", "water", "toilet", "rest_area", "restaurant", "camp",
];
const ESSENTIAL_CHIPS: ChipDef[] = ESSENTIAL_CHIP_KEYS
  .map((k) => ALL_CHIPS.find((c) => c.key === k))
  .filter((c): c is ChipDef => !!c);

// ──────────────────────────────────────────────────────────────
// Category-specific sub-filters
// ──────────────────────────────────────────────────────────────

type SubFilter = { key: string; label: string };

const CAT_SUBFILTERS: Partial<Record<PlaceCategory, SubFilter[]>> = {
  fuel: [
    { key: "has_diesel",   label: "Diesel" },
    { key: "has_unleaded", label: "Unleaded" },
    { key: "has_lpg",      label: "LPG" },
  ],
  ev_charging: [
    { key: "has_diesel",   label: "Also Fuel" }, // reuse key intentionally
  ],
  camp: [
    { key: "free",          label: "Free" },
    { key: "powered_sites", label: "Powered" },
    { key: "pets_allowed",  label: "Pets" },
    { key: "fires_allowed", label: "Fires" },
    { key: "has_showers",   label: "Showers" },
    { key: "has_toilets",   label: "Toilets" },
    { key: "has_water",     label: "Water" },
  ],
  dump_point: [
    { key: "free",      label: "Free" },
    { key: "has_rinse", label: "Rinse Water" },
  ],
  water: [
    { key: "water_treated", label: "Potable" },
  ],
};

// ──────────────────────────────────────────────────────────────
// Distance options
// ──────────────────────────────────────────────────────────────

const DIST_OPTIONS = [5, 10, 25, 50, 100] as const;

// ──────────────────────────────────────────────────────────────
// Sort options
// ──────────────────────────────────────────────────────────────

type SortMode = "distance" | "alpha";

// ──────────────────────────────────────────────────────────────
// localStorage persistence key
// ──────────────────────────────────────────────────────────────

const LS_KEY = "roam:place_search_filter_v1";

type PersistedState = {
  categories: PlaceCategory[];
  free: boolean;
  openNow: boolean;
  accessible: boolean;
  maxDistanceKm: number | null;
  aheadOnly: boolean;
  subFilters: Record<string, boolean>;
  filtersExpanded: boolean;
  sortMode: SortMode;
};

function loadPersistedState(): PersistedState | null {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as PersistedState;
  } catch {
    return null;
  }
}

function savePersistedState(s: PersistedState) {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(s));
  } catch {
    // Storage quota or SSR - ignore
  }
}

// ──────────────────────────────────────────────────────────────
// Windowed list - only renders rows visible in the scroll
// viewport + a small overscan buffer. Keeps DOM node count
// constant (~20-30 nodes) regardless of total list size.
// No external dependency - uses a single scroll listener.
// ──────────────────────────────────────────────────────────────

const ROW_HEIGHT = 60; // px - fixed estimate per row
const OVERSCAN = 5;    // extra rows rendered above/below viewport

type VirtualListProps = {
  items: SearchResult[];
  savedIds: Set<string>;
  onSelect?: (p: PlaceItem) => void;
  onShowOnMap?: (p: PlaceItem) => void;
  onToggleSave: (p: PlaceItem) => void;
  height: string | number;
};

const VirtualList = memo(function VirtualList({
  items,
  savedIds,
  onSelect,
  onShowOnMap,
  onToggleSave,
  height,
}: VirtualListProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [containerHeight, setContainerHeight] = useState(0);

  // Measure container and listen for scroll
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const measure = () => setContainerHeight(el.clientHeight);
    measure();

    const onScroll = () => setScrollTop(el.scrollTop);
    el.addEventListener("scroll", onScroll, { passive: true });

    // ResizeObserver for dynamic container sizing
    let ro: ResizeObserver | null = null;
    if (typeof ResizeObserver !== "undefined") {
      ro = new ResizeObserver(measure);
      ro.observe(el);
    }

    return () => {
      el.removeEventListener("scroll", onScroll);
      ro?.disconnect();
    };
  }, []);

  // Reset scroll position when items change (new search/filter)
  useLayoutEffect(() => {
    containerRef.current?.scrollTo(0, 0);
    setScrollTop(0);
  }, [items]);

  const totalHeight = items.length * ROW_HEIGHT;
  const startIdx = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - OVERSCAN);
  const endIdx = Math.min(
    items.length,
    Math.ceil((scrollTop + containerHeight) / ROW_HEIGHT) + OVERSCAN,
  );

  const visibleItems = items.slice(startIdx, endIdx);

  return (
    <div
      ref={containerRef}
      style={{
        height,
        overflowY: "auto",
        WebkitOverflowScrolling: "touch",
        position: "relative",
      }}
    >
      {/* Spacer to create correct scrollbar height */}
      <div style={{ height: totalHeight, position: "relative" }}>
        {/* Positioned window of visible rows */}
        <div style={{ position: "absolute", top: startIdx * ROW_HEIGHT, left: 0, right: 0 }}>
          {visibleItems.map(({ place, distKm, ahead }) => (
            <PlaceRow
              key={place.id}
              place={place}
              distKm={distKm}
              ahead={ahead}
              onSelect={onSelect}
              onShowOnMap={onShowOnMap}
              isSaved={savedIds.has(place.id)}
              onToggleSave={onToggleSave}
            />
          ))}
        </div>
      </div>
    </div>
  );
});

// ──────────────────────────────────────────────────────────────
// Component
// ──────────────────────────────────────────────────────────────

export type PlaceSearchPanelProps = {
  places: PlacesPack | null;
  tripProgress?: TripProgress | null;
  /** Alternative to tripProgress - for components that have raw position but not a full TripProgress */
  userPosition?: UserPosition | null;
  /** Called when user taps a result row */
  onSelectPlace?: (place: PlaceItem) => void;
  /** Called when user taps "Add" on a saved place (adds to trip) */
  onAddSavedToTrip?: (place: SavedPlace) => void;
  /** Called when filters change - used to highlight map markers */
  onFilteredIdsChange?: (ids: Set<string> | null) => void;
  /** Called per-place when user taps the map icon on a row */
  onShowPlaceOnMap?: (place: PlaceItem) => void;
  /** Add an ambient-search result (not in the bundle) to the trip. Should
   *  trigger reroute + corridor extension. When provided, typing a query
   *  that matches few/no bundled places will surface live Mapbox results
   *  with an "Add" button. */
  onAddExternalPlace?: (place: PlaceItem) => Promise<void> | void;
  maxHeight?: string | number;
};

export function PlaceSearchPanel({
  places,
  tripProgress,
  userPosition: userPositionProp,
  onSelectPlace,
  onAddSavedToTrip: _onAddSavedToTrip,
  onFilteredIdsChange,
  onShowPlaceOnMap,
  onAddExternalPlace,
  maxHeight = "calc(100vh - 200px)",
}: PlaceSearchPanelProps) {
  const { savedIds, toggleSave, places: savedPlaces } = useSavedPlaces();
  const packItems = useMemo(
    () => Array.isArray(places?.items) ? places.items : [],
    [places],
  );

  // Merge saved places into the searchable pool - convert SavedPlace → PlaceItem
  // and deduplicate (pack items take priority since they have richer extra data).
  const items = useMemo(() => {
    if (savedPlaces.length === 0) return packItems;
    const existingIds = new Set(packItems.map((p) => p.id));
    const converted: PlaceItem[] = savedPlaces
      .filter((sp) => !existingIds.has(sp.place_id))
      .map((sp) => ({
        id: sp.place_id,
        name: sp.name,
        lat: sp.lat,
        lng: sp.lng,
        category: sp.category,
        ...(sp.extra ? { extra: sp.extra } : {}),
      }));
    if (converted.length === 0) return packItems;
    return [...packItems, ...converted];
  }, [packItems, savedPlaces]);

  // ── Load persisted state ──────────────────────────────────────
  const persisted = useMemo(() => loadPersistedState(), []);

  // ── Filter state ──────────────────────────────────────────────
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query);

  const [categories, setCategories] = useState<PlaceCategory[]>(
    persisted?.categories ?? [],
  );
  const [free, setFree] = useState(persisted?.free ?? false);
  const [openNow, setOpenNow] = useState(persisted?.openNow ?? false);
  const [accessible, setAccessible] = useState(persisted?.accessible ?? false);
  const [maxDistanceKm, setMaxDistanceKm] = useState<number | null>(
    persisted?.maxDistanceKm ?? null,
  );
  const [aheadOnly, setAheadOnly] = useState(persisted?.aheadOnly ?? false);
  const [subFilters, setSubFilters] = useState<Record<string, boolean>>(
    persisted?.subFilters ?? {},
  );

  // Filters panel starts collapsed every session so the UI isn't busy on
  // open; persisted filter *values* still restore, just not the expanded
  // chrome. Users can re-expand in one tap via the Filters pill.
  const [filtersExpanded, setFiltersExpanded] = useState(false);
  // Category chips: show only essentials by default, tucked-away long tail
  // is opt-in. Any already-selected category gets rendered inline so the
  // user can see their active filter without expanding.
  const [chipsExpanded, setChipsExpanded] = useState(false);
  const [sortMode, setSortMode] = useState<SortMode>(
    persisted?.sortMode ?? "distance",
  );

  // ── User position (prefer explicit prop, fall back to tripProgress) ──
  const userPosition = useMemo<UserPosition | null>(() => {
    if (userPositionProp) return userPositionProp;
    if (!tripProgress) return null;
    return {
      lat: tripProgress.user_lat,
      lng: tripProgress.user_lng,
      heading: tripProgress.user_heading,
    };
  }, [userPositionProp, tripProgress]);

  // ── Persist state on change ───────────────────────────────────
  useEffect(() => {
    savePersistedState({
      categories, free, openNow, accessible, maxDistanceKm,
      aheadOnly, subFilters, filtersExpanded, sortMode,
    });
  }, [categories, free, openNow, accessible, maxDistanceKm, aheadOnly, subFilters, filtersExpanded, sortMode]);

  // ── Build PlaceFilter ─────────────────────────────────────────
  const filter = useMemo<PlaceFilter>(() => {
    const attrs: Record<string, unknown> = {};
    if (accessible) attrs.wheelchair = "yes";
    for (const [k, v] of Object.entries(subFilters)) {
      if (v) attrs[k] = true;
    }
    return {
      query: deferredQuery,
      categories: categories.length > 0 ? categories : undefined,
      maxDistanceKm: maxDistanceKm ?? undefined,
      aheadOnly: aheadOnly || undefined,
      openNow: openNow || undefined,
      free: (free || subFilters["free"]) || undefined,
      attributes: Object.keys(attrs).length > 0 ? attrs : undefined,
    };
  }, [deferredQuery, categories, maxDistanceKm, aheadOnly, openNow, free, accessible, subFilters]);

  // ── Run search (returns results + category counts in one pass) ──
  const { results, categoryCounts: catCounts } = useMemo(
    () => searchPlaces(items, filter, userPosition),
    [items, filter, userPosition],
  );

  // ── Sort ──────────────────────────────────────────────────────
  const sorted = useMemo(() => {
    if (sortMode === "alpha") {
      return [...results].sort((a, b) =>
        a.place.name.localeCompare(b.place.name),
      );
    }
    return results; // already sorted by distance from searchPlaces
  }, [results, sortMode]);

  // ── Notify parent of filtered IDs ─────────────────────────────
  // Memoize the ID set so we only call the parent when the actual set of IDs
  // changes, preventing infinite re-render loops when the parent updates state.
  const filteredIds = useMemo<Set<string> | null>(() => {
    const hasFilter =
      filter.query ||
      (filter.categories?.length ?? 0) > 0 ||
      filter.free ||
      filter.openNow ||
      filter.aheadOnly ||
      filter.maxDistanceKm != null ||
      (filter.attributes && Object.keys(filter.attributes).length > 0);

    if (!hasFilter) return null;
    return new Set(sorted.map((r) => r.place.id));
  }, [sorted, filter]);

  const prevFilteredRef = useRef<Set<string> | null | undefined>(undefined);
  useEffect(() => {
    // Shallow-compare: skip if the set contents haven't changed
    const prev = prevFilteredRef.current;
    if (prev !== undefined) {
      if (prev === filteredIds) return;
      if (prev !== null && filteredIds !== null && prev.size === filteredIds.size) {
        let same = true;
        for (const id of filteredIds) {
          if (!prev.has(id)) { same = false; break; }
        }
        if (same) return;
      }
    }
    prevFilteredRef.current = filteredIds;
    onFilteredIdsChange?.(filteredIds);
  }, [filteredIds, onFilteredIdsChange]);

  // ── Category chip toggle ──────────────────────────────────────
  const toggleCategory = useCallback((cat: PlaceCategory) => {
    haptic.selection();
    setCategories((prev) =>
      prev.includes(cat) ? prev.filter((c) => c !== cat) : [...prev, cat],
    );
    setSubFilters({});
  }, []);

  const clearCategories = useCallback(() => {
    haptic.selection();
    setCategories([]);
    setSubFilters({});
  }, []);

  // ── Sub-filter toggle ─────────────────────────────────────────
  const toggleSubFilter = useCallback((key: string) => {
    haptic.selection();
    setSubFilters((prev) => ({ ...prev, [key]: !prev[key] }));
  }, []);

  // ── Clear all ─────────────────────────────────────────────────
  const clearAll = useCallback(() => {
    haptic.medium();
    setQuery("");
    setCategories([]);
    setFree(false);
    setOpenNow(false);
    setAccessible(false);
    setMaxDistanceKm(null);
    setAheadOnly(false);
    setSubFilters({});
  }, []);

  const hasActiveFilters =
    query.trim() ||
    categories.length > 0 ||
    free || openNow || accessible ||
    maxDistanceKm != null ||
    aheadOnly ||
    Object.values(subFilters).some(Boolean);

  // Count of *attribute* filters active (for the "Filters (N)" badge on
  // the toggle). Category chips have their own visual active state so
  // aren't counted here.
  const activeFilterCount =
    (free ? 1 : 0) +
    (openNow ? 1 : 0) +
    (accessible ? 1 : 0) +
    (aheadOnly ? 1 : 0) +
    (maxDistanceKm != null ? 1 : 0) +
    Object.values(subFilters).filter(Boolean).length;

  // Which category chips to render inline. Essentials always; any category
  // the user has already selected so they can see/toggle it; and everything
  // else only when the "More" pill has been expanded. Non-zero-count
  // filtering happens in the render above, not here, so counts update with
  // the current item set.
  const visibleChips = useMemo<ChipDef[]>(() => {
    if (chipsExpanded) return ALL_CHIPS;
    const essentialKeys = new Set(ESSENTIAL_CHIP_KEYS);
    const activeKeys = new Set(categories);
    return ALL_CHIPS.filter(
      (c) => essentialKeys.has(c.key) || activeKeys.has(c.key),
    );
  }, [chipsExpanded, categories]);

  // How many additional chips the "More" pill would reveal (only counting
  // those with non-zero items, so the pill doesn't lie).
  const extraChipsAvailable = useMemo(() => {
    if (chipsExpanded) return 0;
    const visibleKeys = new Set(visibleChips.map((c) => c.key));
    return ALL_CHIPS.filter(
      (c) => !visibleKeys.has(c.key) && (catCounts[c.key] ?? 0) > 0,
    ).length;
  }, [chipsExpanded, visibleChips, catCounts]);

  // ── Category-specific sub-filters ────────────────────────────
  const activeSubFilters = useMemo<SubFilter[]>(() => {
    if (categories.length !== 1) return [];
    return CAT_SUBFILTERS[categories[0] as PlaceCategory] ?? [];
  }, [categories]);

  // ── Ambient external search (Mapbox) ─────────────────────────
  // When the in-bundle results are sparse, fire a debounced live search so
  // the user can find places that weren't prefetched into the bundle (e.g.
  // a specific address). Tapping "Add" triggers reroute + corridor extension.
  const EXTERNAL_SEARCH_ENABLED = !!onAddExternalPlace;
  const [externalResults, setExternalResults] = useState<PlaceItem[]>([]);
  const [externalLoading, setExternalLoading] = useState(false);
  const [addingId, setAddingId] = useState<string | null>(null);
  const externalReqIdRef = useRef(0);

  useEffect(() => {
    if (!EXTERNAL_SEARCH_ENABLED) return;
    const q = deferredQuery.trim();
    // Only trigger for non-trivial queries; short strings would spam Mapbox
    // and the in-bundle search already handles them fine.
    if (q.length < 3) {
      setExternalResults([]);
      setExternalLoading(false);
      return;
    }
    // Skip if the bundle already has plenty of matches - no need to reach out.
    if (sorted.length >= 5) {
      setExternalResults([]);
      setExternalLoading(false);
      return;
    }

    const reqId = ++externalReqIdRef.current;
    setExternalLoading(true);
    const center = userPosition
      ? { lat: userPosition.lat, lng: userPosition.lng }
      : { lat: -27.4705, lng: 153.026 }; // Brisbane fallback
    const timer = setTimeout(() => {
      placesApi
        .search({ center, radius_m: 200_000, query: q, limit: 10, categories: [] })
        .then((res) => {
          if (externalReqIdRef.current !== reqId) return;
          // Hide results that are already in the bundle (by id or close proximity).
          const existingIds = new Set(sorted.map((r) => r.place.id));
          const filtered = (res.items ?? []).filter((it) => !existingIds.has(it.id));
          setExternalResults(filtered);
        })
        .catch(() => {
          if (externalReqIdRef.current !== reqId) return;
          setExternalResults([]);
        })
        .finally(() => {
          if (externalReqIdRef.current === reqId) setExternalLoading(false);
        });
    }, 350);
    return () => clearTimeout(timer);
  }, [deferredQuery, sorted, userPosition, EXTERNAL_SEARCH_ENABLED]);

  const handleAddExternal = useCallback(
    async (place: PlaceItem) => {
      if (!onAddExternalPlace) return;
      setAddingId(place.id);
      haptic.medium();
      try {
        await onAddExternalPlace(place);
        haptic.success();
      } catch {
        haptic.error();
      } finally {
        setAddingId(null);
      }
    },
    [onAddExternalPlace],
  );


  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 0, height: "100%" }}>

      {/* ── Search bar ──────────────────────────────────────────── */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "10px 16px 0",
        }}
      >
        <div
          style={{
            flex: 1,
            display: "flex",
            alignItems: "center",
            gap: 8,
            background: "var(--roam-surface-hover)",
            borderRadius: "var(--r-card)",
            padding: "8px 12px",
          }}
        >
          <Search size={16} style={{ color: "var(--roam-text-muted)", flexShrink: 0 }} />
          <input
            value={query}
            onChange={(e) => setQuery(e.currentTarget.value)}
            placeholder="Search places…"
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
            aria-label="Search places"
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

        {/* Filters toggle */}
        <button
          type="button"
          onClick={() => { haptic.selection(); setFiltersExpanded((v) => !v); }}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            background: filtersExpanded ? "var(--roam-accent)" : "var(--roam-surface-hover)",
            color: filtersExpanded ? "var(--on-color)" : "var(--roam-text-muted)",
            border: "none",
            borderRadius: "var(--r-card)",
            padding: "8px 12px",
            fontSize: 13,
            fontWeight: 700,
            cursor: "pointer",
            flexShrink: 0,
            whiteSpace: "nowrap",
          }}
        >
          <SlidersHorizontal size={14} />
          Filters
          {activeFilterCount > 0 && (
            <span style={badgeStyle(true)}>{activeFilterCount}</span>
          )}
          {filtersExpanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
        </button>
      </div>

      {/* ── Category chips (essentials inline, rest behind "More") ── */}
      <div style={{ padding: "10px 16px 0" }}>
        <div
          style={{
            display: "flex",
            gap: 6,
            overflowX: "auto",
            WebkitOverflowScrolling: "touch",
            paddingBottom: 2,
          }}
        >
          <button
            type="button"
            onClick={clearCategories}
            style={chipStyle(categories.length === 0)}
          >
            <Layers size={13} />
            All
            <span style={badgeStyle(categories.length === 0)}>
              {items.length}
            </span>
          </button>

          {visibleChips.map((chip) => {
            const count = catCounts[chip.key] ?? 0;
            if (count === 0) return null;
            const active = categories.includes(chip.key);
            const CI = chip.Icon;
            return (
              <button
                key={chip.key}
                type="button"
                onClick={() => toggleCategory(chip.key)}
                style={chipStyle(active)}
              >
                <CI size={13} />
                {chip.label}
                <span style={badgeStyle(active)}>{count}</span>
              </button>
            );
          })}

          {extraChipsAvailable > 0 && (
            <button
              type="button"
              onClick={() => { haptic.selection(); setChipsExpanded((v) => !v); }}
              style={chipStyle(false)}
              aria-expanded={chipsExpanded}
            >
              {chipsExpanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
              {chipsExpanded ? "Less" : "More"}
              {!chipsExpanded && (
                <span style={badgeStyle(false)}>{extraChipsAvailable}</span>
              )}
            </button>
          )}
        </div>
      </div>

      {/* ── Expandable attribute filters ────────────────────────── */}
      {filtersExpanded && (
        <div
          style={{
            padding: "10px 16px",
            background: "var(--roam-surface)",
            margin: "8px 16px 0",
            borderRadius: "var(--r-card)",
            display: "flex",
            flexDirection: "column",
            gap: 10,
          }}
        >
          {/* Toggle row */}
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            <TogglePill active={free} onToggle={() => { haptic.selection(); setFree((v) => !v); }} label="Free" />
            <TogglePill active={openNow} onToggle={() => { haptic.selection(); setOpenNow((v) => !v); }} label="Open now" icon={<Clock size={12} />} />
            <TogglePill active={accessible} onToggle={() => { haptic.selection(); setAccessible((v) => !v); }} label="Accessible ♿" />
            <TogglePill active={aheadOnly} onToggle={() => { haptic.selection(); setAheadOnly((v) => !v); }} label="Ahead only" icon={<ArrowUp size={12} />} />
          </div>

          {/* Distance slider */}
          <div>
            <div
              style={{
                fontSize: 12,
                fontWeight: 700,
                color: "var(--roam-text-muted)",
                marginBottom: 6,
              }}
            >
              Within
            </div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {DIST_OPTIONS.map((km) => (
                <button
                  key={km}
                  type="button"
                  onClick={() => {
                    haptic.selection();
                    setMaxDistanceKm((prev) => (prev === km ? null : km));
                  }}
                  style={chipStyle(maxDistanceKm === km, true)}
                >
                  {km} km
                </button>
              ))}
              {maxDistanceKm && (
                <button
                  type="button"
                  onClick={() => { haptic.selection(); setMaxDistanceKm(null); }}
                  style={chipStyle(false, true)}
                >
                  <X size={11} />
                  Any
                </button>
              )}
            </div>
          </div>

          {/* Category-specific sub-filters */}
          {activeSubFilters.length > 0 && (
            <div>
              <div
                style={{
                  fontSize: 12,
                  fontWeight: 700,
                  color: "var(--roam-text-muted)",
                  marginBottom: 6,
                }}
              >
                {fmtCat(categories[0] ?? "")} options
              </div>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {activeSubFilters.map((sf) => (
                  <TogglePill
                    key={sf.key}
                    active={!!subFilters[sf.key]}
                    onToggle={() => toggleSubFilter(sf.key)}
                    label={sf.label}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Results header ───────────────────────────────────────── */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "10px 16px 6px",
          flexShrink: 0,
        }}
      >
        <div style={{ fontSize: 12, fontWeight: 700, color: "var(--roam-text-muted)" }}>
          {sorted.length === items.length
            ? `${items.length} places`
            : `${sorted.length} of ${items.length}`}
          {hasActiveFilters && (
            <button
              type="button"
              onClick={clearAll}
              style={{
                marginLeft: 8,
                fontSize: 11,
                fontWeight: 700,
                color: "var(--roam-danger)",
                background: "none",
                border: "none",
                cursor: "pointer",
                padding: 0,
              }}
            >
              Clear
            </button>
          )}
        </div>

        {/* Sort toggle only. "Show on map" was redundant - the map is
           already visible behind the sheet, and filters highlight
           matching markers via onFilteredIdsChange. Sort is a short
           icon-label combo to keep the header quiet. */}
        <button
          type="button"
          onClick={() => {
            haptic.selection();
            setSortMode((m) => (m === "distance" ? "alpha" : "distance"));
          }}
          aria-label={sortMode === "distance" ? "Sort alphabetically" : "Sort by nearest"}
          style={{
            fontSize: 12,
            fontWeight: 700,
            background: "transparent",
            color: "var(--roam-text-muted)",
            border: "none",
            borderRadius: "var(--r-card)",
            padding: "4px 8px",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            gap: 4,
          }}
        >
          <ArrowUpDown size={11} />
          {sortMode === "distance" ? "A–Z" : "Near"}
        </button>
      </div>

      {/* ── Ambient external results (Mapbox) ────────────────────── */}
      {EXTERNAL_SEARCH_ENABLED && (externalLoading || externalResults.length > 0) && (
        <div style={{ padding: "4px 16px 6px", flexShrink: 0 }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              fontSize: 11,
              fontWeight: 800,
              color: "var(--roam-text-muted)",
              textTransform: "uppercase",
              letterSpacing: 0.4,
              marginBottom: 6,
            }}
          >
            <Globe size={11} />
            More places
            {externalLoading && (
              <Loader2 size={11} style={{ marginLeft: 4, animation: "spin 1s linear infinite" }} />
            )}
          </div>
          {externalResults.map((p) => {
            const CatIcon = CATEGORY_ICON[p.category] ?? MapPin;
            const extra = (p.extra ?? {}) as Record<string, unknown>;
            const placeName = extra.place_name as string | undefined;
            const address = extra.address as string | undefined;
            const subtitle =
              placeName && placeName !== p.name
                ? placeName
                : address || fmtCat(p.category);
            const isAdding = addingId === p.id;
            return (
              <div
                key={p.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  padding: "8px 0",
                  minWidth: 0,
                }}
              >
                <div
                  style={{
                    width: 30,
                    height: 30,
                    borderRadius: "var(--r-card)",
                    background: "var(--roam-surface-hover)",
                    display: "grid",
                    placeItems: "center",
                    flexShrink: 0,
                  }}
                >
                  <CatIcon size={15} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="trip-title trip-truncate">{p.name}</div>
                  <div className="trip-muted-small trip-truncate trip-mt-xs">{subtitle}</div>
                </div>
                <button
                  type="button"
                  disabled={isAdding || !!addingId}
                  onClick={() => handleAddExternal(p)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 4,
                    background: isAdding ? "var(--roam-surface-hover)" : "var(--accent-tint)",
                    color: "var(--roam-accent)",
                    border: "none",
                    borderRadius: "var(--r-card)",
                    padding: "6px 10px",
                    fontSize: 12,
                    fontWeight: 800,
                    cursor: isAdding ? "default" : "pointer",
                    opacity: !isAdding && addingId ? 0.5 : 1,
                    flexShrink: 0,
                  }}
                  aria-label={`Add ${p.name} to trip`}
                >
                  {isAdding ? <Loader2 size={12} style={{ animation: "spin 1s linear infinite" }} /> : <Plus size={12} />}
                  {isAdding ? "Adding" : "Add"}
                </button>
              </div>
            );
          })}
        </div>
      )}

      {/* ── Results list ─────────────────────────────────────────── */}
      {sorted.length === 0 ? (
        <div
          style={{
            padding: "32px 24px",
            textAlign: "center",
            color: "var(--roam-text-muted)",
            fontSize: 14,
            fontWeight: 600,
          }}
        >
          No places found
          {hasActiveFilters && (
            <div style={{ fontSize: 12, marginTop: 6, fontWeight: 500 }}>
              Try adjusting your filters
            </div>
          )}
        </div>
      ) : (
        <VirtualList
          items={sorted}
          savedIds={savedIds}
          onSelect={onSelectPlace}
          onShowOnMap={onShowPlaceOnMap}
          onToggleSave={toggleSave}
          height={maxHeight}
        />
      )}
    </div>
  );
}

// ──────────────────────────────────────────────────────────────
// Style helpers
// ──────────────────────────────────────────────────────────────

// Pre-computed style objects - avoids allocations on every render.
// 4 variants: active/inactive × normal/small for chips, active/inactive for badges.

const CHIP_BASE: React.CSSProperties = {
  flex: "0 0 auto",
  borderRadius: 999,
  border: "none",
  display: "flex",
  gap: 5,
  alignItems: "center",
  cursor: "pointer",
  whiteSpace: "nowrap",
  outline: "none",
  transition: "background 100ms ease, color 100ms ease, box-shadow 100ms ease, transform 80ms ease",
};

const CHIP_STYLES = {
  active:       { ...CHIP_BASE, padding: "7px 11px", fontSize: 13, fontWeight: 800, background: "var(--roam-surface-hover)", color: "var(--roam-text)", boxShadow: "var(--shadow-button)" } as React.CSSProperties,
  inactive:     { ...CHIP_BASE, padding: "7px 11px", fontSize: 13, fontWeight: 800, background: "var(--roam-surface)", color: "var(--roam-text-muted)", boxShadow: "var(--shadow-soft)" } as React.CSSProperties,
  activeSmall:  { ...CHIP_BASE, padding: "6px 10px", fontSize: 12, fontWeight: 800, background: "var(--roam-surface-hover)", color: "var(--roam-text)", boxShadow: "var(--shadow-button)" } as React.CSSProperties,
  inactiveSmall:{ ...CHIP_BASE, padding: "6px 10px", fontSize: 12, fontWeight: 800, background: "var(--roam-surface)", color: "var(--roam-text-muted)", boxShadow: "var(--shadow-soft)" } as React.CSSProperties,
};

const BADGE_STYLES = {
  active:   { fontSize: 10, fontWeight: 800, background: "var(--roam-accent)", color: "var(--on-color)", borderRadius: 999, padding: "1px 5px", minWidth: 16, textAlign: "center", transition: "background 100ms ease, color 100ms ease" } as React.CSSProperties,
  inactive: { fontSize: 10, fontWeight: 800, background: "var(--roam-border-strong)", color: "var(--roam-text-muted)", borderRadius: 999, padding: "1px 5px", minWidth: 16, textAlign: "center", transition: "background 100ms ease, color 100ms ease" } as React.CSSProperties,
};

function chipStyle(active: boolean, small = false): React.CSSProperties {
  if (small) return active ? CHIP_STYLES.activeSmall : CHIP_STYLES.inactiveSmall;
  return active ? CHIP_STYLES.active : CHIP_STYLES.inactive;
}

function badgeStyle(active: boolean): React.CSSProperties {
  return active ? BADGE_STYLES.active : BADGE_STYLES.inactive;
}
