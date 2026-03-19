// src/components/ui/PersistentTabs.tsx
"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import dynamic from "next/dynamic";

import { TripSkeleton } from "@/app/(app)/trip/TripSkeleton";
import { GuideSkeleton } from "@/app/(app)/guide/GuideSkeleton";
import { DiscoverSkeleton } from "@/app/(app)/discover/DiscoverSkeleton";
import { JournalSkeleton } from "@/app/(app)/journal/JournalSkeleton";

const TripClientPage = dynamic(
  () => import("@/app/(app)/trip/ClientPage").then((m) => ({ default: m.TripClientPage })),
  { ssr: false }
);
const GuideClientPage = dynamic(
  () => import("@/app/(app)/guide/ClientPage"),
  { ssr: false }
);
const EmergencyClientPage = dynamic(
  () => import("@/app/(app)/sos/ClientPage"),
  { ssr: false }
);
const DiscoverClientPage = dynamic(
  () => import("@/app/(app)/discover/ClientPage"),
  { ssr: false }
);
const MemoriesClientPage = dynamic(
  () => import("@/app/(app)/journal/ClientPage"),
  { ssr: false }
);

/* ── Tab definitions ─────────────────────────────────────────────────── */

// Tab order must match BottomTabBar TABS order for correct slide animation direction.
// guide | discover | trip (center) | journal | sos
const TAB_ROUTES = ["/guide", "/discover", "/trip", "/journal", "/sos"] as const;
type TabRoute = (typeof TAB_ROUTES)[number];

function normalizeTabRoute(path: string): TabRoute | null {
  const clean = path.replace(/\/+$/, "") || "/";
  return TAB_ROUTES.includes(clean as TabRoute) ? (clean as TabRoute) : null;
}

/* ── CSS is in globals.css §19 (cacheable, not re-injected per render) ── */

type AnimState =
  | "hidden" | "visible"
  | "in-right" | "in-left"
  | "out-left" | "out-right";

/* ── Component ───────────────────────────────────────────────────────── */

export function PersistentTabs({ children }: { children: React.ReactNode }) {
  const rawPathname = usePathname();
  const [isClient, setIsClient] = useState(false);
  useEffect(() => { setIsClient(true); }, []);

  // Normalize: strip trailing slash so "/trip/" matches "/trip"
  const activeTab = normalizeTabRoute(rawPathname);

  // All hidden on SSR - effects reveal on client
  const [mounted, setMounted] = useState<Set<TabRoute>>(new Set());
  const [animStates, setAnimStates] = useState<Record<TabRoute, AnimState>>({
    "/guide":    "hidden",
    "/discover": "hidden",
    "/trip":     "hidden",
    "/journal": "hidden",
    "/sos":      "hidden",
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
  if (!isClient) return null;

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
      <div ref={setPaneRef("/guide")} className={paneClass("/guide")}>
        {mounted.has("/guide") && (
          <Suspense fallback={<GuideSkeleton />}>
            <GuideClientPage initialPlanId={null} initialFocusPlaceId={null} />
          </Suspense>
        )}
      </div>

      <div ref={setPaneRef("/discover")} className={paneClass("/discover")}>
        {mounted.has("/discover") && (
          <Suspense fallback={<DiscoverSkeleton />}>
            <DiscoverClientPage />
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

      <div ref={setPaneRef("/journal")} className={paneClass("/journal")}>
        {mounted.has("/journal") && (
          <Suspense fallback={<JournalSkeleton />}>
            <MemoriesClientPage />
          </Suspense>
        )}
      </div>

      <div ref={setPaneRef("/sos")} className={paneClass("/sos")}>
        {mounted.has("/sos") && <EmergencyClientPage />}
      </div>
    </div>
  );
}
