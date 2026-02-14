"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import type { OfflinePlanRecord } from "@/lib/offline/plansStore";
import { deleteOfflinePlan, getCurrentPlanId, getOfflinePlan, setCurrentPlanId } from "@/lib/offline/plansStore";

import type { NavPack, CorridorGraphPack, TrafficOverlay, HazardOverlay } from "@/lib/types/navigation";
import type { PlacesPack, PlaceItem, PlaceCategory } from "@/lib/types/places";
import type { TripStop } from "@/lib/types/trip";

import { TripMap } from "@/components/trip/TripMap";
import { TripEditorSheet, type TripEditorRebuildMode } from "@/components/trip/TripEditorSheet";

import { hasCorePacks, getAllPacks, putPack } from "@/lib/offline/packsStore";
import { unpackAndStoreBundle } from "@/lib/offline/unpackBundle";
import { rebuildNavpackOffline } from "@/lib/offline/rebuildNavpack";

import { healthApi } from "@/lib/api/health";
import { navApi } from "@/lib/api/nav";
import { placesApi } from "@/lib/api/places";

type LoadState = "idle" | "loading" | "ready" | "missing" | "error";
type RebuildMode = "auto" | "online" | "offline";

function fmtKm(m: number) {
  const km = m / 1000;
  return km >= 10 ? `${km.toFixed(0)} km` : `${km.toFixed(1)} km`;
}
function fmtMin(s: number) {
  const min = s / 60;
  return min >= 60 ? `${(min / 60).toFixed(1)} h` : `${min.toFixed(0)} min`;
}

async function backendHealthOk(): Promise<boolean> {
  try {
    const res = await healthApi.get();
    return !!res?.ok;
  } catch {
    return false;
  }
}

function ensureStopIds(stops: TripStop[]): TripStop[] {
  return (stops ?? []).map((s, i) => (s.id ? s : { ...s, id: `${Date.now()}_${i}_${Math.random().toString(16).slice(2)}` }));
}

function fmtCat(c: PlaceCategory) {
  return c.replace(/_/g, " ");
}

const DEFAULT_CATS: PlaceCategory[] = [
  "fuel", "camp", "water", "toilet", "town", "grocery", "mechanic", 
  "hospital", "pharmacy", "cafe", "restaurant", "fast_food", "park", "beach",
];

export function TripClientPage(props: { initialPlanId: string | null }) {
  const router = useRouter();

  const [state, setState] = useState<LoadState>("idle");
  const [err, setErr] = useState<string | null>(null);

  const [plan, setPlan] = useState<OfflinePlanRecord | null>(null);
  const [currentId, setCurrentId] = useState<string | null>(null);

  const [navpack, setNavpack] = useState<NavPack | null>(null);
  const [corridor, setCorridor] = useState<CorridorGraphPack | null>(null);
  const [places, setPlaces] = useState<PlacesPack | null>(null);
  const [traffic, setTraffic] = useState<TrafficOverlay | null>(null);
  const [hazards, setHazards] = useState<HazardOverlay | null>(null);

  const [busy, setBusy] = useState<string | null>(null);

  const [focusedStopId, setFocusedStopId] = useState<string | null>(null);
  const [focusedPlaceId, setFocusedPlaceId] = useState<string | null>(null);

  const [styleId, setStyleId] = useState<string>("roam-basemap-hybrid");
  const [backendOk, setBackendOk] = useState<boolean | null>(null);

  const [showEditor, setShowEditor] = useState<boolean>(false);
  const [showSuggestions, setShowSuggestions] = useState<boolean>(false);

  const [q, setQ] = useState<string>("");
  const [cats, setCats] = useState<Set<PlaceCategory>>(new Set(DEFAULT_CATS));

  const listRef = useRef<HTMLDivElement | null>(null);
  const rowRefs = useRef<Map<string, HTMLDivElement>>(new Map());

  const openedViaQuery = useMemo(() => !!props.initialPlanId, [props.initialPlanId]);
  const planIdToLoad = useMemo(() => props.initialPlanId ?? null, [props.initialPlanId]);

  useEffect(() => {
    let cancelled = false;

    async function boot() {
      setErr(null); setState("loading"); setPlan(null); setNavpack(null);
      setCorridor(null); setPlaces(null); setTraffic(null); setHazards(null);
      setFocusedStopId(null); setFocusedPlaceId(null);
      setShowEditor(false); setShowSuggestions(false);

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
        if (!has) { await unpackAndStoreBundle(rec); }

        const packs = await getAllPacks(rec.plan_id);
        if (cancelled) return;

        setPlan(rec);
        setNavpack(packs.navpack ?? null);
        setCorridor(packs.corridor ?? null);
        setPlaces(packs.places ?? null);
        setTraffic((packs as any).traffic ?? null);
        setHazards((packs as any).hazards ?? null);

        setState("ready");
      } catch (e: any) {
        if (cancelled) return;
        setErr(e?.message ?? "Failed to load plan");
        setState("error");
      }
    }

    boot();
    return () => { cancelled = true; };
  }, [planIdToLoad]);

  const isCurrent = plan?.plan_id && plan.plan_id === currentId;

  const downloadZip = async () => {
    if (!plan?.zip_blob) return;
    const url = URL.createObjectURL(plan.zip_blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${plan.plan_id}.zip`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const effectiveStops: TripStop[] | null = navpack?.req?.stops ?? plan?.preview?.stops ?? null;
  const effectiveGeom = navpack?.primary?.geometry ?? plan?.preview?.geometry ?? null;
  const effectiveBbox = navpack?.primary?.bbox ?? plan?.preview?.bbox ?? null;

  const effectiveDist = navpack?.primary?.distance_m ?? plan?.preview?.distance_m ?? 0;
  const effectiveDur = navpack?.primary?.duration_s ?? plan?.preview?.duration_s ?? 0;
  const effectiveProfile = navpack?.primary?.profile ?? plan?.preview?.profile ?? "drive";

  const filteredPlaces = useMemo(() => {
    const items = places?.items ?? [];
    const qq = q.trim().toLowerCase();
    return items
      .filter((p) => (cats.size ? cats.has(p.category) : true))
      .filter((p) => {
        if (!qq) return true;
        const n = (p.name ?? "").toLowerCase();
        const c = (p.category ?? "").toLowerCase();
        return n.includes(qq) || c.includes(qq);
      });
  }, [places, q, cats]);

  const filteredSuggestionIds = useMemo(() => {
    if (!places) return null;
    const s = new Set<string>();
    for (const p of filteredPlaces) s.add(p.id);
    return s;
  }, [places, filteredPlaces]);

  useEffect(() => {
    const id = focusedPlaceId ?? null;
    if (!id) return;
    const el = rowRefs.current.get(id);
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [focusedPlaceId]);

  async function onlineRebuild(stopsRaw: TripStop[]) {
    if (!plan) throw new Error("No plan loaded");
    const stops = ensureStopIds(stopsRaw);

    const nextNav = await navApi.route({
      stops, profile: effectiveProfile, prefs: {}, avoid: [], depart_at: null,
    });

    const geom = nextNav?.primary?.geometry;
    if (!geom) throw new Error("Backend returned navpack without primary.geometry");

    const meta = await navApi.corridorEnsure({
      route_key: nextNav.primary.route_key, geometry: geom,
      profile: effectiveProfile, buffer_m: null, max_edges: null,
    });

    const corridorKey = meta?.corridor_key;
    if (!corridorKey) throw new Error("corridorEnsure returned no corridor_key");

    const nextCorr = await navApi.corridorGet(corridorKey);

    let nextPlaces: PlacesPack | null = null;
    try { nextPlaces = await placesApi.corridor({ geometry: geom } as any); } catch { nextPlaces = null; }

    let nextTraffic: TrafficOverlay | null = null;
    let nextHazards: HazardOverlay | null = null;
    const bbox = nextNav?.primary?.bbox;

    if (bbox) {
      try { nextTraffic = await navApi.trafficPoll({ bbox }); } catch { nextTraffic = null; }
      try { nextHazards = await navApi.hazardsPoll({ bbox, sources: [] }); } catch { nextHazards = null; }
    }

    await Promise.all([
      putPack(plan.plan_id, "navpack", nextNav),
      putPack(plan.plan_id, "corridor", nextCorr),
      nextPlaces ? putPack(plan.plan_id, "places", nextPlaces) : Promise.resolve(),
      nextTraffic ? putPack(plan.plan_id, "traffic", nextTraffic) : Promise.resolve(),
      nextHazards ? putPack(plan.plan_id, "hazards", nextHazards) : Promise.resolve(),
    ]);

    setNavpack(nextNav); setCorridor(nextCorr);
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

  function insertStopBeforeEnd(stops: TripStop[], next: TripStop): TripStop[] {
    const out = [...stops];
    const endIdx = out.findIndex((s) => (s.type ?? "poi") === "end");
    if (endIdx >= 0) out.splice(endIdx, 0, next);
    else out.push(next);
    return out;
  }

  async function addPlaceAsStop(p: PlaceItem) {
    if (!navpack) return;
    setBusy("add_place"); setErr(null);

    try {
      const baseStops = ensureStopIds(navpack.req.stops);
      const nextStop: TripStop = {
        id: `${Date.now()}_${Math.random().toString(16).slice(2)}`,
        type: "poi", name: p.name, lat: p.lat, lng: p.lng,
      };
      const nextStops = insertStopBeforeEnd(baseStops, nextStop);

      setShowEditor(true); setShowSuggestions(true);
      await rebuildFromStops(nextStops, "auto");
    } catch (e: any) {
      setErr(e?.message ?? "Failed to add stop");
    } finally {
      setBusy(null);
    }
  }

  if (state === "missing") {
    return (
      <div className="trip-wrap">
        <div className="trip-card">
          <div className="trip-h1">Trip</div>
          <div className="trip-muted">No plan selected.</div>
          <div style={{ height: 10 }} />
          <button className="trip-interactive trip-btn trip-btn-primary" onClick={() => router.push("/plans")} type="button">Go to Plans</button>
          <button className="trip-interactive trip-btn trip-btn-secondary" onClick={() => router.push("/new")} type="button">Create New</button>
        </div>
      </div>
    );
  }

  if (state === "error") {
    return (
      <div className="trip-wrap">
        <div className="trip-card">
          <div className="trip-h1">Trip</div>
          <div className="trip-err-box">{err ?? "Unknown error"}</div>
          <div style={{ height: 10 }} />
          <button className="trip-interactive trip-btn trip-btn-primary" onClick={() => router.push("/plans")} type="button">Go to Plans</button>
        </div>
      </div>
    );
  }

  if (state !== "ready" || !plan || !effectiveStops || !effectiveGeom || !effectiveBbox) {
    return (
      <div className="trip-wrap">
        <div className="trip-card">
          <div className="trip-h1">Trip</div>
          <div className="trip-muted">Loading…</div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: "100vh" }}>
      <TripMap
        styleId={styleId} stops={effectiveStops} geometry={effectiveGeom} bbox={effectiveBbox}
        focusedStopId={focusedStopId} onStopPress={(id) => setFocusedStopId(id)}
        suggestions={places?.items ?? null} filteredSuggestionIds={filteredSuggestionIds} focusedSuggestionId={focusedPlaceId}
        onSuggestionPress={(placeId) => { setFocusedPlaceId(placeId); setShowSuggestions(true); }}
      />

      <div className="trip-sheet-wrap">
        <div className="trip-sheet">
          <div className="trip-row-between">
            <div>
              <div className="trip-h1" style={{ display: "flex", alignItems: "center" }}>
                Trip{" "}
                {isCurrent ? <span className="trip-badge trip-badge-blue" style={{ marginLeft: 8 }}>Current</span> 
                 : openedViaQuery ? <span className="trip-badge trip-badge-soft" style={{ marginLeft: 8 }}>Preview</span> : null}
              </div>
              <div className="trip-muted">
                {fmtKm(effectiveDist)} · {fmtMin(effectiveDur)} · {effectiveProfile}{" "}
                {backendOk === null ? null : backendOk ? <span className="trip-badge trip-badge-ok" style={{ marginLeft: 8 }}>Online</span> : <span className="trip-badge trip-badge-bad" style={{ marginLeft: 8 }}>Offline</span>}
              </div>
            </div>

            <select value={styleId} onChange={(e) => setStyleId(e.currentTarget.value)} className="trip-interactive trip-select" aria-label="Map style">
              <option value="roam-basemap-hybrid">Hybrid</option>
              <option value="roam-basemap-vector-bright">Vector (Bright)</option>
              <option value="roam-basemap-vector-dark">Vector (Dark)</option>
            </select>
          </div>

          <div className="trip-kv-row">
            <div className="trip-kv"><div className="trip-kv-k">plan_id</div><div className="trip-kv-v">{plan.plan_id}</div></div>
            <div className="trip-kv"><div className="trip-kv-k">route_key</div><div className="trip-kv-v">{plan.route_key}</div></div>
          </div>

          <div className="trip-actions">
            <button type="button" className="trip-interactive trip-btn trip-btn-secondary" disabled={!!busy}
              onClick={async () => { setBusy("set_current"); try { await setCurrentPlanId(plan.plan_id); setCurrentId(plan.plan_id); } finally { setBusy(null); } }}>
              Set current
            </button>
            <button type="button" className="trip-interactive trip-btn trip-btn-secondary" disabled={!!busy}
              onClick={async () => { setBusy("clear_current"); try { await setCurrentPlanId(null); setCurrentId(null); } finally { setBusy(null); } }}>
              Clear current
            </button>
            <button type="button" className="trip-interactive trip-btn trip-btn-primary" onClick={() => router.push("/plans")} disabled={!!busy}>
              Plans
            </button>
          </div>

          <div className="trip-actions">
            <button type="button" className="trip-interactive trip-btn trip-btn-secondary" onClick={downloadZip} disabled={!plan.zip_blob || !!busy}>Download zip</button>
            <button type="button" className="trip-interactive trip-btn trip-btn-secondary" disabled={!!busy || !navpack || !corridor} title="Explicit offline rebuild (stored corridor only)"
              onClick={async () => {
                if (!navpack || !corridor) return;
                setBusy("rebuild_offline"); setErr(null);
                try { await offlineRebuild(navpack.req.stops); } 
                catch (e: any) { setErr((e?.message ?? "Offline rebuild failed") + "\n\nIf you changed stops outside the stored corridor, go Online and rebuild."); } 
                finally { setBusy(null); }
              }}>
              Rebuild offline
            </button>
            <button type="button" className="trip-interactive trip-btn trip-btn-secondary" onClick={() => router.push("/new")} disabled={!!busy}>New</button>
          </div>

          <div style={{ display: "flex", gap: 10 }}>
            <button type="button" className="trip-interactive trip-btn trip-btn-primary" style={{ flex: 1 }} disabled={!!busy || !navpack || !corridor} onClick={() => setShowEditor((v) => !v)} title={!navpack || !corridor ? "Missing navpack/corridor packs" : "Edit stops and rebuild"}>
              {showEditor ? "Hide editor" : "Edit stops"}
            </button>
            <button type="button" className="trip-interactive trip-btn trip-btn-primary" style={{ flex: 1 }} disabled={!!busy || !places} onClick={() => setShowSuggestions((v) => !v)} title={!places ? "No places pack in this bundle" : "Show stop suggestions"}>
              {showSuggestions ? "Hide suggestions" : "Suggestions"}
            </button>
            <button type="button" className="trip-btn trip-btn-secondary" style={{ flex: 1 }} disabled={true} title={places ? `${places.items.length} places packed` : "No places"}>
              Places: {places ? places.items.length : "—"}
            </button>
          </div>

          {showSuggestions && places ? (
            <div className="trip-panel">
              <div className="trip-row-between">
                <div>
                  <div className="trip-title">Stop suggestions</div>
                  <div className="trip-muted-small">Filtered: {filteredPlaces.length} / {places.items.length} {focusedPlaceId ? <span style={{ marginLeft: 8, opacity: 0.85 }}>· Focused ✅</span> : null}</div>
                </div>
                <input value={q} onChange={(e) => setQ(e.currentTarget.value)} placeholder="Search…" className="trip-search" style={{ width: 140 }} />
              </div>

              <div className="trip-cat-row">
                <button type="button" className={`trip-interactive trip-pill-btn`} data-active={cats.size === DEFAULT_CATS.length} onClick={() => setCats(new Set(DEFAULT_CATS))}>All</button>
                <button type="button" className={`trip-interactive trip-pill-btn`} data-active={cats.size === 0} onClick={() => setCats(new Set())}>None</button>
                {DEFAULT_CATS.map((c) => (
                  <button key={c} type="button" className={`trip-interactive trip-pill-btn`} data-active={cats.has(c)}
                    onClick={() => { setCats((prev) => { const next = new Set(prev); if (next.has(c)) next.delete(c); else next.add(c); return next; }); }}>
                    {fmtCat(c)}
                  </button>
                ))}
              </div>

              <div ref={listRef} className="trip-list-container trip-places-list">
                {filteredPlaces.length ? (
                  filteredPlaces.slice(0, 600).map((p) => {
                    const focused = focusedPlaceId === p.id;
                    return (
                      <div key={p.id} ref={(el) => { if (el) rowRefs.current.set(p.id, el); else rowRefs.current.delete(p.id); }}
                        role="button" tabIndex={0} className="trip-interactive trip-list-row" data-focused={focused}
                        onClick={() => setFocusedPlaceId(p.id)}
                        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setFocusedPlaceId(p.id); } }}>
                        <div style={{ minWidth: 0, flex: 1 }}>
                          <div className="trip-title trip-truncate" style={{ fontSize: 13 }}>{p.name}</div>
                          <div className="trip-muted-small trip-truncate">{fmtCat(p.category)} · {p.lat.toFixed(3)}, {p.lng.toFixed(3)}</div>
                        </div>
                        <button type="button" className="trip-interactive trip-btn-sm" disabled={!!busy || !navpack}
                          onClick={(e) => { e.stopPropagation(); addPlaceAsStop(p); }}>
                          + Add
                        </button>
                      </div>
                    );
                  })
                ) : <div className="trip-empty">No matches.</div>}
              </div>
            </div>
          ) : null}

          {showEditor && navpack && corridor ? (
            <div className="trip-panel">
              <TripEditorSheet planId={plan.plan_id} navpack={navpack} corridor={corridor} places={places}
                focusedStopId={focusedStopId} onFocusStop={setFocusedStopId} allowModeToggle={true}
                setBusy={(v) => setBusy(v)} setErr={(v) => setErr(v)}
                onRebuildRequested={async (args: { stops: TripStop[]; mode: TripEditorRebuildMode }) => { await rebuildFromStops(args.stops, args.mode); }}
              />
            </div>
          ) : null}

          {err ? <div className="trip-err-box">{err}</div> : null}

          <div className="trip-actions">
            <button type="button" className="trip-interactive trip-btn trip-btn-danger" disabled={!!busy}
              onClick={async () => { if (!window.confirm("Delete this offline plan from this device?")) return; await deleteOfflinePlan(plan.plan_id); router.push("/plans"); }}>
              Delete
            </button>
            <button type="button" className="trip-btn trip-btn-secondary" disabled={true}>{showEditor ? "Editing" : "View"}</button>
            <button type="button" className="trip-btn trip-btn-secondary" disabled={true} title={traffic ? `${traffic.items.length} traffic` : "No traffic pack loaded"}>
              Traffic: {traffic ? traffic.items.length : "—"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}