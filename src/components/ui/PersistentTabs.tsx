// src/components/ui/PersistentTabs.tsx
"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";

import { TripClientPage } from "@/app/(app)/trip/ClientPage";
import GuideClientPage from "@/app/(app)/guide/ClientPage";
import EmergencyClientPage from "@/app/(app)/sos/ClientPage";

import { TripSkeleton } from "@/app/(app)/trip/TripSkeleton";
import { GuideSkeleton } from "@/app/(app)/guide/GuideSkeleton";
/* ── Tab definitions ─────────────────────────────────────────────────── */

const TAB_ROUTES = ["/guide", "/trip", "/sos"] as const;
type TabRoute = (typeof TAB_ROUTES)[number];

// (page-level swipe removed — navigation is tab-bar only)

function normalizeTabRoute(path: string): TabRoute | null {
  const clean = path.replace(/\/+$/, "") || "/";
  return TAB_ROUTES.includes(clean as TabRoute) ? (clean as TabRoute) : null;
}

/* ── CSS ─────────────────────────────────────────────────────────────── */

const STYLES = `
  .pt-wrap { position: absolute; inset: 0; overflow: hidden; }

  .pt-pane {
    position: absolute; inset: 0;
    will-change: transform, opacity;
  }
  .pt-pane-hidden { display: none; }

  /* Commit animations — used when trip is involved or on snap-back */
  @keyframes pt-in-right  { from { opacity:0; transform:translateX( 48px) } to { opacity:1; transform:translateX(0) } }
  @keyframes pt-in-left   { from { opacity:0; transform:translateX(-48px) } to { opacity:1; transform:translateX(0) } }
  @keyframes pt-out-left  { from { opacity:1; transform:translateX(0) } to { opacity:0; transform:translateX(-48px) } }
  @keyframes pt-out-right { from { opacity:1; transform:translateX(0) } to { opacity:0; transform:translateX( 48px) } }

  .pt-anim-in-right  { animation: pt-in-right  0.26s cubic-bezier(0.25,0.46,0.45,0.94) both; }
  .pt-anim-in-left   { animation: pt-in-left   0.26s cubic-bezier(0.25,0.46,0.45,0.94) both; }
  .pt-anim-out-left  { animation: pt-out-left  0.26s cubic-bezier(0.25,0.46,0.45,0.94) both; }
  .pt-anim-out-right { animation: pt-out-right 0.26s cubic-bezier(0.25,0.46,0.45,0.94) both; }

`;

type AnimState =
  | "hidden" | "visible"
  | "in-right" | "in-left"
  | "out-left" | "out-right";

/* ── Component ───────────────────────────────────────────────────────── */

export function PersistentTabs({ children }: { children: React.ReactNode }) {
  const rawPathname = usePathname();

  // Normalize: strip trailing slash so "/trip/" matches "/trip"
  const activeTab = normalizeTabRoute(rawPathname);

  // All hidden on SSR — effects reveal on client
  const [mounted, setMounted] = useState<Set<TabRoute>>(new Set());
  const [animStates, setAnimStates] = useState<Record<TabRoute, AnimState>>({
    "/guide": "hidden",
    "/trip":  "hidden",
    "/sos":   "hidden",
  });

  const prevIndexRef   = useRef(-1);
  const isFirstRender  = useRef(true);

  const paneRefs = useRef<Partial<Record<TabRoute, HTMLDivElement>>>({});

  // ── Mount active + neighbours ───────────────────────────────────────
  useEffect(() => {
    if (!activeTab) return;
    setMounted((prev) => {
      if (prev.has(activeTab)) return prev;
      return new Set(prev).add(activeTab);
    });
    const idx = TAB_ROUTES.indexOf(activeTab);
    const t = setTimeout(() => {
      setMounted((prev) => {
        const next = new Set(prev);
        if (idx > 0) next.add(TAB_ROUTES[idx - 1]);
        if (idx < TAB_ROUTES.length - 1) next.add(TAB_ROUTES[idx + 1]);
        return next;
      });
    }, 400);
    return () => clearTimeout(t);
  }, [activeTab]);

  // ── Animate on route change ─────────────────────────────────────────
  useEffect(() => {
    if (!activeTab) return;
    const nextIdx  = TAB_ROUTES.indexOf(activeTab);
    const prevIdx  = prevIndexRef.current;

    if (isFirstRender.current) {
      isFirstRender.current = false;
      prevIndexRef.current  = nextIdx;
      setAnimStates((s) => ({ ...s, [TAB_ROUTES[nextIdx]]: "visible" }));
      return;
    }

    if (prevIdx === nextIdx || prevIdx === -1) {
      prevIndexRef.current = nextIdx;
      return;
    }

    const goingRight = nextIdx > prevIdx;
    const prev = TAB_ROUTES[prevIdx];
    const next = TAB_ROUTES[nextIdx];

    setAnimStates((s) => ({
      ...s,
      [prev]: goingRight ? "out-left"  : "out-right",
      [next]: goingRight ? "in-right"  : "in-left",
    }));

    const t = setTimeout(() => {
      setAnimStates((s) => ({ ...s, [prev]: "hidden", [next]: "visible" }));
    }, 280);

    prevIndexRef.current = nextIdx;
    return () => clearTimeout(t);
  }, [activeTab]);

  if (!activeTab) return <>{children}</>;

  function paneClass(route: TabRoute) {
    const s = animStates[route];
    if (s === "hidden")    return "pt-pane pt-pane-hidden";
    if (s === "in-right")  return "pt-pane pt-anim-in-right";
    if (s === "in-left")   return "pt-pane pt-anim-in-left";
    if (s === "out-left")  return "pt-pane pt-anim-out-left";
    if (s === "out-right") return "pt-pane pt-anim-out-right";
    return "pt-pane"; // visible
  }

  function setPaneRef(route: TabRoute) {
    return (el: HTMLDivElement | null) => {
      if (el) paneRefs.current[route] = el;
      else delete paneRefs.current[route];
    };
  }

  return (
    <div className="pt-wrap">
      <style>{STYLES}</style>

      <div ref={setPaneRef("/guide")} className={paneClass("/guide")}>
        {mounted.has("/guide") && (
          <Suspense fallback={<GuideSkeleton />}>
            <GuideClientPage initialPlanId={null} initialFocusPlaceId={null} />
          </Suspense>
        )}
      </div>

      <div ref={setPaneRef("/trip")} className={paneClass("/trip")}>
        {mounted.has("/trip") && (
          <Suspense fallback={<TripSkeleton />}>
            <TripClientPage initialPlanId={null} />
          </Suspense>
        )}
      </div>

      <div ref={setPaneRef("/sos")} className={paneClass("/sos")}>
        {mounted.has("/sos") && <EmergencyClientPage />}
      </div>
    </div>
  );
}
