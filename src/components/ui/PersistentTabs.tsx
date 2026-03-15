// src/components/ui/PersistentTabs.tsx
"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";

import { TripClientPage } from "@/app/(app)/trip/ClientPage";
import GuideClientPage from "@/app/(app)/guide/ClientPage";
import EmergencyClientPage from "@/app/(app)/sos/ClientPage";

import { TripSkeleton } from "@/app/(app)/trip/TripSkeleton";
import { GuideSkeleton } from "@/app/(app)/guide/GuideSkeleton";
import { haptic } from "@/lib/native/haptics";

/* ── Tab definitions ─────────────────────────────────────────────────── */

const TAB_ROUTES = ["/guide", "/trip", "/sos"] as const;
type TabRoute = (typeof TAB_ROUTES)[number];

// Which tabs can be live-dragged (not position:fixed full-viewport)
const DRAGGABLE: Set<TabRoute> = new Set(["/guide", "/sos"]);

function isTabRoute(path: string): path is TabRoute {
  return TAB_ROUTES.includes(path as TabRoute);
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

  /* Snap-back transition applied inline via JS */
  .pt-snap { transition: transform 0.3s cubic-bezier(0.25,0.46,0.45,0.94),
                         opacity  0.3s cubic-bezier(0.25,0.46,0.45,0.94); }
`;

type AnimState =
  | "hidden" | "visible"
  | "in-right" | "in-left"
  | "out-left" | "out-right";

/* ── Component ───────────────────────────────────────────────────────── */

export function PersistentTabs({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router   = useRouter();

  // All hidden on SSR — effects reveal on client
  const [mounted, setMounted] = useState<Set<TabRoute>>(new Set());
  const [animStates, setAnimStates] = useState<Record<TabRoute, AnimState>>({
    "/guide": "hidden",
    "/trip":  "hidden",
    "/sos":   "hidden",
  });

  const prevIndexRef   = useRef(-1);
  const isFirstRender  = useRef(true);

  // Refs to pane DOM nodes for imperative drag transforms
  const paneRefs = useRef<Partial<Record<TabRoute, HTMLDivElement>>>({});

  // ── Mount active + neighbours ───────────────────────────────────────
  useEffect(() => {
    if (!isTabRoute(pathname)) return;
    setMounted((prev) => {
      if (prev.has(pathname as TabRoute)) return prev;
      return new Set(prev).add(pathname as TabRoute);
    });
    const idx = TAB_ROUTES.indexOf(pathname as TabRoute);
    const t = setTimeout(() => {
      setMounted((prev) => {
        const next = new Set(prev);
        if (idx > 0) next.add(TAB_ROUTES[idx - 1]);
        if (idx < TAB_ROUTES.length - 1) next.add(TAB_ROUTES[idx + 1]);
        return next;
      });
    }, 400);
    return () => clearTimeout(t);
  }, [pathname]);

  // ── Animate on route change ─────────────────────────────────────────
  useEffect(() => {
    if (!isTabRoute(pathname)) return;
    const nextIdx  = TAB_ROUTES.indexOf(pathname as TabRoute);
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
  }, [pathname]);

  // ── Swipe gesture with live-drag for non-trip panes ─────────────────
  const isOnTab    = isTabRoute(pathname);
  const activeIndex = isOnTab ? TAB_ROUTES.indexOf(pathname as TabRoute) : -1;

  const touch = useRef<{
    x: number; y: number; t: number;
    locked: boolean; // true = horizontal swipe locked in
    activePaneEl: HTMLDivElement | null;
    neighbourEl:  HTMLDivElement | null;
    neighbourDir: 1 | -1; // +1 = right, -1 = left
    canDrag: boolean; // false when active tab is trip
  } | null>(null);

  useEffect(() => {
    if (!isOnTab) return;

    const W = () => window.innerWidth;

    function applyDrag(activeEl: HTMLDivElement | null, neighbourEl: HTMLDivElement | null, neighbourDir: 1 | -1, dx: number) {
      // rubber-band at the edge
      const atEdge = (activeIndex === 0 && dx > 0) || (activeIndex === TAB_ROUTES.length - 1 && dx < 0);
      const offset = atEdge ? dx * 0.18 : dx;

      if (activeEl) {
        activeEl.style.transform = `translateX(${offset}px)`;
        activeEl.style.opacity   = `${Math.max(0.6, 1 - Math.abs(offset) / W() * 0.5)}`;
      }
      if (neighbourEl && !atEdge) {
        // neighbour starts 100% off-screen in its direction, tracks alongside
        const neighbourOffset = neighbourDir * W() + offset;
        neighbourEl.style.display   = "";
        neighbourEl.style.transform = `translateX(${neighbourOffset}px)`;
        neighbourEl.style.opacity   = `${Math.min(1, Math.abs(offset) / W() * 1.5)}`;
      }
    }

    function resetDrag(activeEl: HTMLDivElement | null, neighbourEl: HTMLDivElement | null, animated: boolean) {
      [activeEl, neighbourEl].forEach((el) => {
        if (!el) return;
        if (animated) el.classList.add("pt-snap");
        el.style.transform = "";
        el.style.opacity   = "";
        if (animated) {
          el.addEventListener("transitionend", () => el.classList.remove("pt-snap"), { once: true });
        }
      });
      if (neighbourEl && !animated) {
        // re-hide if we're just resetting without committing
        const route = (Object.entries(paneRefs.current) as [TabRoute, HTMLDivElement][])
          .find(([, el]) => el === neighbourEl)?.[0];
        if (route) {
          const s = animStates[route];
          if (s === "hidden") neighbourEl.style.display = "none";
        }
      }
    }

    function onTouchStart(e: TouchEvent) {
      const t = e.touches[0];
      const activeRoute  = TAB_ROUTES[activeIndex];
      const canDrag      = DRAGGABLE.has(activeRoute);
      const activePaneEl = canDrag ? (paneRefs.current[activeRoute] ?? null) : null;

      touch.current = {
        x: t.clientX, y: t.clientY, t: Date.now(),
        locked: false,
        activePaneEl,
        neighbourEl:  null,
        neighbourDir: 1,
        canDrag,
      };
    }

    function onTouchMove(e: TouchEvent) {
      if (!touch.current) return;
      const t  = e.touches[0];
      const dx = t.clientX - touch.current.x;
      const dy = t.clientY - touch.current.y;

      if (!touch.current.locked) {
        if (Math.abs(dx) < 8) return;
        if (Math.abs(dy) > Math.abs(dx)) { touch.current = null; return; } // vertical — bail
        touch.current.locked = true;

        // Identify the neighbour pane that will slide in
        if (touch.current.canDrag) {
          const neighbourIndex = dx < 0 ? activeIndex + 1 : activeIndex - 1;
          if (neighbourIndex >= 0 && neighbourIndex < TAB_ROUTES.length) {
            const nRoute = TAB_ROUTES[neighbourIndex];
            const nEl    = paneRefs.current[nRoute] ?? null;
            touch.current.neighbourEl  = nEl;
            touch.current.neighbourDir = dx < 0 ? 1 : -1;
          }
        }
      }

      if (touch.current.canDrag) {
        applyDrag(touch.current.activePaneEl, touch.current.neighbourEl, touch.current.neighbourDir, dx);
      }
    }

    function onTouchEnd(e: TouchEvent) {
      if (!touch.current?.locked) { touch.current = null; return; }

      const t   = e.changedTouches[0];
      const dx  = t.clientX - touch.current.x;
      const dy  = t.clientY - touch.current.y;
      const dt  = Date.now() - touch.current.t;
      const { activePaneEl, neighbourEl, canDrag } = touch.current;
      touch.current = null;

      if (Math.abs(dx) < Math.abs(dy) * 1.5) {
        if (canDrag) resetDrag(activePaneEl, neighbourEl, true);
        return;
      }

      const velocity  = Math.abs(dx) / dt;
      const threshold = W() * 0.30;
      const commit    = Math.abs(dx) > threshold || velocity > 0.3;

      if (commit && dx < 0 && activeIndex < TAB_ROUTES.length - 1) {
        haptic.selection();
        // For draggable panes: clear inline styles so CSS animation takes over cleanly
        if (canDrag) { if (activePaneEl) activePaneEl.style.cssText = ""; if (neighbourEl) neighbourEl.style.cssText = ""; }
        router.push(TAB_ROUTES[activeIndex + 1]);
      } else if (commit && dx > 0 && activeIndex > 0) {
        haptic.selection();
        if (canDrag) { if (activePaneEl) activePaneEl.style.cssText = ""; if (neighbourEl) neighbourEl.style.cssText = ""; }
        router.push(TAB_ROUTES[activeIndex - 1]);
      } else {
        if (canDrag) resetDrag(activePaneEl, neighbourEl, true);
      }
    }

    document.addEventListener("touchstart", onTouchStart, { passive: true });
    document.addEventListener("touchmove",  onTouchMove,  { passive: true });
    document.addEventListener("touchend",   onTouchEnd,   { passive: true });
    return () => {
      document.removeEventListener("touchstart", onTouchStart);
      document.removeEventListener("touchmove",  onTouchMove);
      document.removeEventListener("touchend",   onTouchEnd);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOnTab, activeIndex, router]);

  if (!isOnTab) return <>{children}</>;

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
