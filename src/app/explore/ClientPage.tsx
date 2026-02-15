// src/app/explore/ClientPage.tsx
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import type { OfflinePlanRecord } from "@/lib/offline/plansStore";
import { addPlaceToTrip } from "@/lib/explore/addToTrip";

import {
  getCurrentPlanId,
  getOfflinePlan,
  updateOfflinePlanAtomic,
} from "@/lib/offline/plansStore";

import type { NavPack, CorridorGraphPack, TrafficOverlay, HazardOverlay } from "@/lib/types/navigation";
import type { PlacesPack, PlaceItem, PlaceCategory } from "@/lib/types/places";
import type { TripStop } from "@/lib/types/trip";

import { TripMap } from "@/components/trip/TripMap";
import { SyncStatusBadge } from "@/components/ui/SyncStatusBadge";

import { hasCorePacks, getAllPacks, putPack } from "@/lib/offline/packsStore";
import { unpackAndStoreBundle } from "@/lib/offline/unpackBundle";
import { rebuildNavpackOffline } from "@/lib/offline/rebuildNavpack";

import { healthApi } from "@/lib/api/health";
import { navApi } from "@/lib/api/nav";
import { placesApi } from "@/lib/api/places";

import { haptic } from "@/lib/native/haptics";
import { useGeolocation } from "@/lib/native/geolocation";
import { planSync } from "@/lib/offline/planSync";

import type { ExplorePack } from "@/lib/types/explore";
import { createExplorePack, exploreSendMessage } from "@/lib/explore/exploreEngine";
import { getExplorePack, putExplorePack } from "@/lib/offline/explorePacksStore";

type LoadState = "idle" | "loading" | "ready" | "missing" | "error";
type RebuildMode = "auto" | "online" | "offline";

function nowIso() { return new Date().toISOString(); }

function fmtKm(m: number) {
  const km = m / 1000;
  return km >= 10 ? `${km.toFixed(0)} km` : `${km.toFixed(1)} km`;
}
function fmtMin(s: number) {
  const min = s / 60;
  return min >= 60 ? `${(min / 60).toFixed(1)} h` : `${min.toFixed(0)} min`;
}

async function backendHealthOk(): Promise<boolean> {
  try { const res = await healthApi.get(); return !!res?.ok; } catch { return false; }
}

function ensureStopIds(stops: TripStop[]): TripStop[] {
  return (stops ?? []).map((s, i) =>
    s.id ? s : { ...s, id: `${Date.now()}_${i}_${Math.random().toString(16).slice(2)}` },
  );
}

function insertStopBeforeEnd(stops: TripStop[], next: TripStop): TripStop[] {
  const out = [...stops];
  const endIdx = out.findIndex((s) => (s.type ?? "poi") === "end");
  if (endIdx >= 0) out.splice(endIdx, 0, next);
  else out.push(next);
  return out;
}

const DEFAULT_CATS: PlaceCategory[] = [
  "fuel", "camp", "water", "toilet", "town",
  "grocery", "mechanic", "hospital", "pharmacy",
  "cafe", "restaurant", "fast_food", "park", "beach",
];

function fmtCat(c: PlaceCategory) { return c.replace(/_/g, " "); }

function aggregateExplorePlaces(pack: ExplorePack | null): PlaceItem[] {
  if (!pack) return [];
  const out: PlaceItem[] = [];
  const seen = new Set<string>();
  for (const tr of pack.tool_results ?? []) {
    if (!tr?.ok) continue;
    if (tr.tool === "places_search" || tr.tool === "places_corridor") {
      const items = (tr.result as any)?.items ?? [];
      for (const p of items as PlaceItem[]) {
        if (!p?.id || seen.has(p.id)) continue;
        seen.add(p.id);
        out.push(p);
      }
    } else if (tr.tool === "places_suggest") {
      const clusters = (tr.result as any)?.clusters ?? [];
      for (const cl of clusters) {
        const items = cl?.places?.items ?? [];
        for (const p of items as PlaceItem[]) {
          if (!p?.id || seen.has(p.id)) continue;
          seen.add(p.id);
          out.push(p);
        }
      }
    }
  }
  return out;
}

export default function ExploreClientPage(props: { initialPlanId: string | null }) {
  const router = useRouter();
  const geo = useGeolocation({ autoStart: true, highAccuracy: true });

  const [state, setState] = useState<LoadState>("idle");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const [plan, setPlan] = useState<OfflinePlanRecord | null>(null);
  const [currentId, setCurrentId] = useState<string | null>(null);

  const [navpack, setNavpack] = useState<NavPack | null>(null);
  const [corridor, setCorridor] = useState<CorridorGraphPack | null>(null);
  const [places, setPlaces] = useState<PlacesPack | null>(null);
  const [traffic, setTraffic] = useState<TrafficOverlay | null>(null);
  const [hazards, setHazards] = useState<HazardOverlay | null>(null);
  const [backendOk, setBackendOk] = useState<boolean | null>(null);

  const [styleId, setStyleId] = useState<string>("roam-basemap-hybrid");
  const [focusedStopId, setFocusedStopId] = useState<string | null>(null);
  const [focusedPlaceId, setFocusedPlaceId] = useState<string | null>(null);

  // Explore session state
  const [exploreKey, setExploreKey] = useState<string | null>(null);
  const [explorePack, setExplorePackState] = useState<ExplorePack | null>(null);
  const [exploreContext, setExploreContext] = useState<any | null>(null); // ExploreContext type is in exploreEngine

  // UI
  const [showExplore, setShowExplore] = useState(true);
  const [chatInput, setChatInput] = useState("");
  const chatEndRef = useRef<HTMLDivElement | null>(null);

  const [q, setQ] = useState<string>("");
  const [cats, setCats] = useState<Set<PlaceCategory>>(new Set(DEFAULT_CATS));

  const openedViaQuery = useMemo(() => !!props.initialPlanId, [props.initialPlanId]);
  const planIdToLoad = useMemo(() => props.initialPlanId ?? null, [props.initialPlanId]);

  // ─────────────────────────────────────────────────────────────
  // Boot
  // ─────────────────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;

    async function boot() {
      setErr(null); setState("loading");
      setPlan(null); setNavpack(null); setCorridor(null); setPlaces(null); setTraffic(null); setHazards(null);
      setExploreKey(null); setExplorePackState(null); setExploreContext(null);

      try {
        const cur = await getCurrentPlanId();
        if (cancelled) return;
        setCurrentId(cur);

        const id = planIdToLoad ?? cur;
        if (!id) { setState("missing"); return; }

        const rec = await getOfflinePlan(id);
        if (cancelled) return;
        if (!rec) { setState("missing"); return; }

        backendHealthOk().then((ok) => { if (!cancelled) setBackendOk(ok); });

        const has = await hasCorePacks(rec.plan_id);
        if (!has) await unpackAndStoreBundle(rec);

        const packs = await getAllPacks(rec.plan_id);
        if (cancelled) return;

        setPlan(rec);
        setNavpack(packs.navpack ?? null);
        setCorridor(packs.corridor ?? null);
        setPlaces(packs.places ?? null);
        setTraffic((packs as any).traffic ?? null);
        setHazards((packs as any).hazards ?? null);

        // Create or restore Explore session
        const stops = packs.navpack?.req?.stops ?? rec.preview?.stops ?? [];
        const bootstrap = await createExplorePack({
          planId: rec.plan_id,
          label: rec.label ?? rec.plan_id.slice(0, 8),
          stops,
          navpack: packs.navpack ?? null,
          corridor: packs.corridor ?? null,
          places: packs.places ?? null,
          traffic: (packs as any).traffic ?? null,
          hazards: (packs as any).hazards ?? null,
          manifest: packs.manifest ?? null,
        });

        const existing = await getExplorePack(rec.plan_id, bootstrap.exploreKey);
        const packToUse = existing ?? bootstrap.pack;

        setExploreKey(bootstrap.exploreKey);
        setExplorePackState(packToUse);
        setExploreContext(bootstrap.context);

        setState("ready");
        haptic.success();
      } catch (e: any) {
        if (cancelled) return;
        setErr(e?.message ?? "Failed to load");
        setState("error");
        haptic.error();
      }
    }

    boot();
    return () => { cancelled = true; };
  }, [planIdToLoad]);

  const isCurrent = plan?.plan_id && plan.plan_id === currentId;

  const effectiveStops: TripStop[] | null = navpack?.req?.stops ?? plan?.preview?.stops ?? null;
  const effectiveGeom = navpack?.primary?.geometry ?? plan?.preview?.geometry ?? null;
  const effectiveBbox = navpack?.primary?.bbox ?? plan?.preview?.bbox ?? null;
  const effectiveDist = navpack?.primary?.distance_m ?? plan?.preview?.distance_m ?? 0;
  const effectiveDur = navpack?.primary?.duration_s ?? plan?.preview?.duration_s ?? 0;
  const effectiveProfile = navpack?.primary?.profile ?? plan?.preview?.profile ?? "drive";

  // Suggestions shown on map/list = Explore tool results + (optional) corridor places pack
  const explorePlacesAll = useMemo(() => aggregateExplorePlaces(explorePack), [explorePack]);

  const mergedPlaces: PlaceItem[] = useMemo(() => {
    // Merge Explore results with existing corridor places pack
    const out: PlaceItem[] = [];
    const seen = new Set<string>();
    const add = (arr: PlaceItem[]) => {
      for (const p of arr ?? []) {
        if (!p?.id || seen.has(p.id)) continue;
        seen.add(p.id);
        out.push(p);
      }
    };
    add(explorePlacesAll);
    add((places?.items ?? []) as any);
    return out;
  }, [explorePlacesAll, places]);

  const filteredPlaces = useMemo(() => {
    const items = mergedPlaces ?? [];
    const qq = q.trim().toLowerCase();
    return items
      .filter((p) => (cats.size ? cats.has(p.category) : true))
      .filter((p) => {
        if (!qq) return true;
        return (p.name ?? "").toLowerCase().includes(qq) || (p.category ?? "").toLowerCase().includes(qq);
      });
  }, [mergedPlaces, q, cats]);

  const filteredSuggestionIds = useMemo(() => {
    const s = new Set<string>();
    for (const p of filteredPlaces) s.add(p.id);
    return s;
  }, [filteredPlaces]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [explorePack?.thread?.length, explorePack?.tool_results?.length]);

  // ─────────────────────────────────────────────────────────────
  // Rebuild helpers (same semantics as Trip page)
  // ─────────────────────────────────────────────────────────────
  async function onlineRebuild(stopsRaw: TripStop[]) {
    if (!plan) throw new Error("No plan loaded");
    const stops = ensureStopIds(stopsRaw);

    const nextNav = await navApi.route({ stops, profile: effectiveProfile, prefs: {}, avoid: [], depart_at: null });
    const geom = nextNav?.primary?.geometry;
    if (!geom) throw new Error("Backend returned navpack without primary.geometry");

    const meta = await navApi.corridorEnsure({
      route_key: nextNav.primary.route_key,
      geometry: geom,
      profile: effectiveProfile,
      buffer_m: null,
      max_edges: null,
    });
    const corridorKey = meta?.corridor_key;
    if (!corridorKey) throw new Error("corridorEnsure returned no corridor_key");

    const nextCorr = await navApi.corridorGet(corridorKey);

    let nextPlaces: PlacesPack | null = null;
    try {
      // ✅ correct schema: /places/corridor expects corridor_key
      nextPlaces = await placesApi.corridor({ corridor_key: corridorKey, categories: [], limit: 8000 });
    } catch {
      nextPlaces = null;
    }

    let nextTraffic: TrafficOverlay | null = null;
    let nextHazards: HazardOverlay | null = null;
    const bbox = nextNav?.primary?.bbox;
    if (bbox) {
      try { nextTraffic = await navApi.trafficPoll({ bbox }); } catch { nextTraffic = null; }
      try { nextHazards = await navApi.hazardsPoll({ bbox, sources: [] }); } catch { nextHazards = null; }
    }

    // Persist packs
    await Promise.all([
      putPack(plan.plan_id, "navpack", nextNav),
      putPack(plan.plan_id, "corridor", nextCorr),
      nextPlaces ? putPack(plan.plan_id, "places", nextPlaces) : Promise.resolve(),
      nextTraffic ? putPack(plan.plan_id, "traffic", nextTraffic) : Promise.resolve(),
      nextHazards ? putPack(plan.plan_id, "hazards", nextHazards) : Promise.resolve(),
    ]);

    // Persist plan preview + keys (so /plans list + sync have correct snapshot)
    await updateOfflinePlanAtomic(plan.plan_id, {
      route_key: nextNav.primary.route_key,
      corridor_key: corridorKey,
      places_key: nextPlaces?.places_key ?? null,
      traffic_key: (nextTraffic as any)?.traffic_key ?? null,
      hazards_key: (nextHazards as any)?.hazards_key ?? null,
      preview: {
        stops,
        geometry: nextNav.primary.geometry,
        bbox: nextNav.primary.bbox,
        distance_m: nextNav.primary.distance_m,
        duration_s: nextNav.primary.duration_s,
        profile: nextNav.primary.profile,
      },
    });

    // enqueue cloud sync (deduped)
    await planSync.enqueuePlanUpsert(plan.plan_id);

    setNavpack(nextNav);
    setCorridor(nextCorr);
    if (nextPlaces) setPlaces(nextPlaces);
    if (nextTraffic) setTraffic(nextTraffic);
    if (nextHazards) setHazards(nextHazards);
  }

  async function offlineRebuild(stopsRaw: TripStop[]) {
    if (!plan) throw new Error("No plan loaded");
    if (!navpack || !corridor) throw new Error("Missing packs for offline rebuild");

    const stops = ensureStopIds(stopsRaw);
    const route_key = navpack?.primary?.route_key ?? plan.route_key;
    const rebuilt = rebuildNavpackOffline({ prevNavpack: navpack, corridor, stops, route_key });

    await putPack(plan.plan_id, "navpack", rebuilt);
    await updateOfflinePlanAtomic(plan.plan_id, {
      route_key: rebuilt.primary.route_key,
      preview: {
        stops,
        geometry: rebuilt.primary.geometry,
        bbox: rebuilt.primary.bbox,
        distance_m: rebuilt.primary.distance_m,
        duration_s: rebuilt.primary.duration_s,
        profile: rebuilt.primary.profile,
      },
    });

    await planSync.enqueuePlanUpsert(plan.plan_id);

    setNavpack(rebuilt);
  }

  async function rebuildFromStops(stops: TripStop[], mode: RebuildMode) {
    if (mode === "offline") return offlineRebuild(stops);
    if (mode === "online") {
      const ok = await backendHealthOk();
      setBackendOk(ok);
      if (!ok) throw new Error("Backend not reachable. Switch to Offline or go online.");
      return onlineRebuild(stops);
    }
    const ok = await backendHealthOk();
    setBackendOk(ok);
    if (ok) return onlineRebuild(stops);
    try { return offlineRebuild(stops); } catch (e: any) {
      throw new Error((e?.message ?? "Offline rebuild failed") + "\n\nBackend is offline. If stops moved outside the stored corridor, you must go online to refresh the corridor.");
    }
  }
  async function addPlaceAsStop(p: PlaceItem) {
    if (!plan || !navpack) return;
    setBusy("add_place"); setErr(null);
    try {
      const res = await addPlaceToTrip({
        plan,
        place: p,
        navpack,
        corridor,
        profile: effectiveProfile,
        mode: "auto",
      });
  
      // update local state from returned packs
      if ((res as any).navpack) setNavpack((res as any).navpack);
      if ((res as any).corridor) setCorridor((res as any).corridor);
      if ((res as any).places) setPlaces((res as any).places);
      if ((res as any).traffic) setTraffic((res as any).traffic);
      if ((res as any).hazards) setHazards((res as any).hazards);
  
      setFocusedPlaceId(p.id);
      haptic.success();
    } catch (e: any) {
      setErr(e?.message ?? "Failed to add stop");
      haptic.error();
    } finally {
      setBusy(null);
    }
  }
  
  // ─────────────────────────────────────────────────────────────
  // Explore chat
  // ─────────────────────────────────────────────────────────────
  async function sendChat() {
    if (!plan || !exploreKey || !explorePack || !exploreContext) return;
    const text = chatInput.trim();
    if (!text) return;

    setChatInput("");
    setBusy("explore_turn");
    setErr(null);

    try {
      const { pack: nextPack } = await exploreSendMessage({
        planId: plan.plan_id,
        exploreKey,
        pack: explorePack,
        context: exploreContext,
        userText: text,
        preferredCategories: Array.from(cats),
        maxSteps: 4,
      });

      setExplorePackState(nextPack);
      await putExplorePack(plan.plan_id, exploreKey, nextPack);
      haptic.success();
    } catch (e: any) {
      setErr(e?.message ?? "Explore failed");
      haptic.error();
    } finally {
      setBusy(null);
    }
  }

  // ─────────────────────────────────────────────────────────────
  // Missing / Error
  // ─────────────────────────────────────────────────────────────
  if (state === "missing") {
    return (
      <div className="trip-app-container trip-wrap-center">
        <div className="trip-card">
          <div className="trip-h1">Explore</div>
          <div className="trip-muted">No plan selected.</div>
          <div className="trip-flex-col">
            <button className="trip-interactive trip-btn trip-btn-primary" onClick={() => { haptic.tap(); router.push("/plans"); }} type="button">Go to Plans</button>
            <button className="trip-interactive trip-btn trip-btn-secondary" onClick={() => { haptic.tap(); router.push("/new"); }} type="button">Create New</button>
          </div>
        </div>
      </div>
    );
  }

  if (state === "error") {
    return (
      <div className="trip-app-container trip-wrap-center">
        <div className="trip-card">
          <div className="trip-h1">Explore</div>
          <div className="trip-err-box">{err ?? "Unknown error"}</div>
          <button className="trip-interactive trip-btn trip-btn-primary" onClick={() => { haptic.tap(); router.push("/plans"); }} type="button">Go to Plans</button>
        </div>
      </div>
    );
  }

  if (state !== "ready" || !plan || !effectiveStops || !effectiveGeom || !effectiveBbox) {
    return (
      <div className="trip-app-container trip-wrap-center">
        <div className="trip-card">
          <div className="trip-h1">Explore</div>
          <div className="trip-muted">Loading…</div>
        </div>
      </div>
    );
  }

  const label = plan.label ?? plan.plan_id.slice(0, 8);

  return (
    <div className="trip-app-container">
      <TripMap
        styleId={styleId}
        stops={effectiveStops}
        geometry={effectiveGeom}
        bbox={effectiveBbox}
        focusedStopId={focusedStopId}
        onStopPress={(id) => { haptic.selection(); setFocusedStopId(id); }}
        suggestions={mergedPlaces}
        filteredSuggestionIds={filteredSuggestionIds}
        focusedSuggestionId={focusedPlaceId}
        onSuggestionPress={(placeId) => {
          haptic.selection();
          setFocusedPlaceId(placeId);
          setShowExplore(true);
        }}
        userPosition={geo.position}
        onMapLongPress={(lat, lng) => {
          // optional: drop pin -> ask Explore
          haptic.heavy();
          setChatInput(`Find something interesting near ${lat.toFixed(3)}, ${lng.toFixed(3)} (scenic spot, cafe, or campsite).`);
          setShowExplore(true);
        }}
      />

      {/* Top controls */}
      <div className="trip-map-switcher" style={{ display: "flex", gap: 8 }}>
        <select
          value={styleId}
          onChange={(e) => { haptic.selection(); setStyleId(e.currentTarget.value); }}
          className="trip-interactive trip-select"
          aria-label="Map style"
          style={{ padding: "8px 12px" }}
        >
          <option value="roam-basemap-hybrid">Hybrid</option>
          <option value="roam-basemap-vector-bright">Vector Light</option>
          <option value="roam-basemap-vector-dark">Vector Dark</option>
        </select>

        <button
          type="button"
          className="trip-interactive trip-btn-sm"
          onClick={() => { haptic.tap(); router.push(`/trip?plan_id=${plan.plan_id}`); }}
          disabled={!!busy}
        >
          Trip
        </button>
      </div>

      {/* Bottom sheet (Explore) */}
      <div className="trip-bottom-sheet-wrap" style={{ transform: "translateY(0px)" }}>
        <div className="trip-bottom-sheet">
          <div className="trip-sheet-header">
            <div className="trip-row-between">
              <div>
                <div className="trip-h1" style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  Explore · {label}
                  {isCurrent ? <span className="trip-badge trip-badge-blue">Current</span>
                    : openedViaQuery ? <span className="trip-badge trip-badge-soft">Preview</span> : null}
                  <SyncStatusBadge />
                </div>
                <div className="trip-muted" style={{ marginTop: 4, display: "flex", alignItems: "center", gap: 8 }}>
                  {fmtKm(effectiveDist)} · {fmtMin(effectiveDur)} · {effectiveProfile}
                  {backendOk === null ? null : backendOk
                    ? <span className="trip-badge trip-badge-ok">Online</span>
                    : <span className="trip-badge trip-badge-bad">Offline</span>}
                </div>
              </div>

              <button
                type="button"
                className="trip-interactive trip-btn-sm"
                onClick={() => { haptic.tap(); setShowExplore((v) => !v); }}
                disabled={!!busy}
              >
                {showExplore ? "Hide" : "Show"}
              </button>
            </div>
          </div>

          {showExplore ? (
            <div className="trip-sheet-content">
              {/* Suggestions filters */}
              <div className="trip-panel">
                <div className="trip-row-between">
                  <div>
                    <div className="trip-title">Suggestions</div>
                    <div className="trip-muted-small">
                      Showing: {filteredPlaces.length} / {mergedPlaces.length}
                      {focusedPlaceId ? <span style={{ marginLeft: 8, opacity: 0.85 }}>· Focused ✅</span> : null}
                    </div>
                  </div>
                  <div style={{ background: "var(--roam-surface)", padding: "0 12px", borderRadius: "12px", display: "flex", alignItems: "center" }}>
                    <input value={q} onChange={(e) => setQ(e.currentTarget.value)} placeholder="Search…" className="trip-input" style={{ width: 140 }} />
                  </div>
                </div>

                <div className="trip-cat-row">
                  <button type="button" className="trip-interactive trip-pill-btn" data-active={cats.size === DEFAULT_CATS.length}
                    onClick={() => { haptic.selection(); setCats(new Set(DEFAULT_CATS)); }}>
                    All
                  </button>
                  <button type="button" className="trip-interactive trip-pill-btn" data-active={cats.size === 0}
                    onClick={() => { haptic.selection(); setCats(new Set()); }}>
                    None
                  </button>
                  {DEFAULT_CATS.map((c) => (
                    <button
                      key={c}
                      type="button"
                      className="trip-interactive trip-pill-btn"
                      data-active={cats.has(c)}
                      onClick={() => {
                        haptic.selection();
                        setCats((prev) => {
                          const next = new Set(prev);
                          if (next.has(c)) next.delete(c);
                          else next.add(c);
                          return next;
                        });
                      }}
                    >
                      {fmtCat(c)}
                    </button>
                  ))}
                </div>

                <div style={{ display: "flex", gap: 10, flexDirection: "column", marginTop: 10, maxHeight: "32vh", overflow: "auto" }}>
                  {filteredPlaces.slice(0, 220).map((p) => {
                    const focused = focusedPlaceId === p.id;
                    return (
                      <div
                        key={p.id}
                        role="button"
                        tabIndex={0}
                        className="trip-interactive trip-list-row"
                        data-focused={focused}
                        onClick={() => { haptic.selection(); setFocusedPlaceId(p.id); }}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            haptic.selection();
                            setFocusedPlaceId(p.id);
                          }
                        }}
                      >
                        <div style={{ minWidth: 0, flex: 1 }}>
                          <div className="trip-title trip-truncate" style={{ fontSize: 14 }}>{p.name}</div>
                          <div className="trip-muted-small trip-truncate" style={{ marginTop: 2 }}>
                            {fmtCat(p.category)} · {p.lat.toFixed(3)}, {p.lng.toFixed(3)}
                          </div>
                        </div>
                        <button
                          type="button"
                          className="trip-interactive trip-btn-sm"
                          disabled={!!busy || !navpack}
                          onClick={(e) => { e.stopPropagation(); addPlaceAsStop(p); }}
                        >
                          + Add
                        </button>
                      </div>
                    );
                  })}
                  {!filteredPlaces.length ? (
                    <div className="trip-muted" style={{ padding: 16, textAlign: "center" }}>No matches.</div>
                  ) : null}
                </div>
              </div>

              {/* Chat */}
              <div className="trip-panel" style={{ marginTop: 12 }}>
                <div className="trip-title">Ask Explore</div>
                <div className="trip-muted-small" style={{ marginTop: 4 }}>
                  Example: “Find scenic viewpoints + a campsite every ~2 hours” · “Best food stops near Townsville” · “Avoid flood risk; show safer alternates”
                </div>

                <div style={{
                  marginTop: 10,
                  borderRadius: 14,
                  background: "rgba(255,255,255,0.04)",
                  border: "1px solid rgba(255,255,255,0.08)",
                  padding: 12,
                  maxHeight: "26vh",
                  overflow: "auto",
                  display: "flex",
                  flexDirection: "column",
                  gap: 10,
                }}>
                  {(explorePack?.thread ?? []).map((m, i) => (
                    <div key={i} style={{
                      alignSelf: m.role === "user" ? "flex-end" : "flex-start",
                      maxWidth: "92%",
                      padding: "10px 12px",
                      borderRadius: 14,
                      background: m.role === "user" ? "rgba(59,130,246,0.18)" : "rgba(0,0,0,0.25)",
                      border: "1px solid rgba(255,255,255,0.08)",
                      whiteSpace: "pre-wrap",
                      lineHeight: 1.25,
                      fontSize: 13,
                    }}>
                      {m.content}
                    </div>
                  ))}
                  <div ref={chatEndRef} />
                </div>

                <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
                  <input
                    className="trip-input"
                    value={chatInput}
                    onChange={(e) => setChatInput(e.currentTarget.value)}
                    placeholder={busy === "explore_turn" ? "Thinking…" : "Ask Explore…"}
                    disabled={!!busy}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        sendChat();
                      }
                    }}
                    style={{ flex: 1 }}
                  />
                  <button
                    type="button"
                    className="trip-interactive trip-btn trip-btn-primary"
                    onClick={() => { haptic.tap(); sendChat(); }}
                    disabled={!!busy || !chatInput.trim()}
                    style={{ padding: "10px 14px" }}
                  >
                    Send
                  </button>
                </div>

                <div className="trip-actions" style={{ marginTop: 10 }}>
                  <button
                    type="button"
                    className="trip-interactive trip-btn-sm"
                    disabled={!!busy}
                    onClick={() => { haptic.tap(); setChatInput("Find the best fuel + toilets + food stops along this route."); }}
                  >
                    Quick: essentials
                  </button>
                  <button
                    type="button"
                    className="trip-interactive trip-btn-sm"
                    disabled={!!busy}
                    onClick={() => { haptic.tap(); setChatInput("Suggest 6 scenic stops and 2 campgrounds spaced along the route."); }}
                  >
                    Quick: scenic + camp
                  </button>
                  <button
                    type="button"
                    className="trip-interactive trip-btn-sm"
                    disabled={!!busy}
                    onClick={() => { haptic.tap(); setChatInput("Show me stops that avoid flood risk or closures; focus on safety."); }}
                  >
                    Quick: safety
                  </button>
                </div>
              </div>

              {err ? <div className="trip-err-box">{err}</div> : null}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
