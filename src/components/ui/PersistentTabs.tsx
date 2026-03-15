// src/components/ui/PersistentTabs.tsx
"use client";

import { Suspense, useRef, useState, useEffect, useCallback } from "react";
import { usePathname, useRouter } from "next/navigation";

import { TripClientPage } from "@/app/(app)/trip/ClientPage";
import GuideClientPage from "@/app/(app)/guide/ClientPage";
import EmergencyClientPage from "@/app/(app)/sos/ClientPage";

import { TripSkeleton } from "@/app/(app)/trip/TripSkeleton";
import { GuideSkeleton } from "@/app/(app)/guide/GuideSkeleton";

/* ── Tab definitions ─────────────────────────────────────────────────── */

const TAB_ROUTES = ["/guide", "/trip", "/sos"] as const;
type TabRoute = (typeof TAB_ROUTES)[number];

function isTabRoute(path: string): path is TabRoute {
  return TAB_ROUTES.includes(path as TabRoute);
}

/* ── Component ───────────────────────────────────────────────────────── */

/**
 * Mounts all 3 tab pages once and keeps them alive.
 * The active tab is shown via CSS `display`; inactive tabs use `display: none`
 * so they retain full React state (scroll position, map instance, chat history)
 * but don't paint or trigger layout.
 *
 * Non-tab routes (e.g. /new, /login) render via the normal `children` prop.
 */
export function PersistentTabs({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  // Track which tabs have been visited so we lazy-mount on first visit
  // (avoids booting all 3 pages on initial app load)
  const [mounted, setMounted] = useState<Set<TabRoute>>(() => {
    const initial = new Set<TabRoute>();
    if (isTabRoute(pathname)) initial.add(pathname);
    return initial;
  });

  // When navigating to a tab route, mark it as mounted
  useEffect(() => {
    if (isTabRoute(pathname) && !mounted.has(pathname)) {
      setMounted((prev) => new Set(prev).add(pathname));
    }
  }, [pathname]); // eslint-disable-line react-hooks/exhaustive-deps

  const isOnTab = isTabRoute(pathname);
  const activeTab = isOnTab ? pathname : null;

  return (
    <>
      {/* ── Persistent tab panes ──────────────────────────────────── */}
      <div
        className="roam-tab-pane"
        style={{ display: activeTab === "/trip" ? "contents" : "none" }}
      >
        {mounted.has("/trip") && (
          <Suspense fallback={<TripSkeleton />}>
            <TripClientPage initialPlanId={null} />
          </Suspense>
        )}
      </div>

      <div
        className="roam-tab-pane"
        style={{ display: activeTab === "/guide" ? "contents" : "none" }}
      >
        {mounted.has("/guide") && (
          <Suspense fallback={<GuideSkeleton />}>
            <GuideClientPage initialPlanId={null} initialFocusPlaceId={null} />
          </Suspense>
        )}
      </div>

      <div
        className="roam-tab-pane"
        style={{ display: activeTab === "/sos" ? "contents" : "none" }}
      >
        {mounted.has("/sos") && <EmergencyClientPage />}
      </div>

      {/* ── Non-tab routes render normally ─────────────────────────── */}
      {!isOnTab && children}
    </>
  );
}
