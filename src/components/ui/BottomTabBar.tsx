"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { memo, useCallback } from "react";
import type { ReactNode } from "react";

type Tab = {
  key: string;
  href: string;
  label: string;
  icon: (active: boolean) => ReactNode;
  isCenter?: boolean;
};

// --- Icons ---
function IconPlus(active: boolean) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path
        fill="currentColor"
        d="M11 5a1 1 0 0 1 2 0v6h6a1 1 0 1 1 0 2h-6v6a1 1 0 1 1-2 0v-6H5a1 1 0 1 1 0-2h6V5z"
        opacity={active ? 1 : 0.9}
      />
    </svg>
  );
}

function IconList(active: boolean) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path fill="currentColor" d="M7 6h14v2H7V6zM7 11h14v2H7v-2zM7 16h14v2H7v-2z" opacity={active ? 1 : 0.9} />
      <path fill="currentColor" d="M3 6h2v2H3V6zM3 11h2v2H3v-2zM3 16h2v2H3v-2z" opacity={active ? 1 : 0.9} />
    </svg>
  );
}

function IconMap(active: boolean) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path
        fill="currentColor"
        d="M15 4l-6 2-6-2v16l6 2 6-2 6 2V6l-6-2zm-6 3.1l6-2V19l-6 2V7.1z"
        opacity={active ? 1 : 0.9}
      />
    </svg>
  );
}

function IconSearch(active: boolean) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path
        fill="currentColor"
        d="M10 4a6 6 0 1 1 0 12A6 6 0 0 1 10 4zm0 2a4 4 0 1 0 0 8a4 4 0 0 0 0-8zm8.7 12.3a1 1 0 0 1 0 1.4l-.6.6a1 1 0 0 1-1.4 0l-3.2-3.2a1 1 0 1 1 1.4-1.4l3.8 3.8z"
        opacity={active ? 1 : 0.9}
      />
    </svg>
  );
}

function IconSos(active: boolean) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path
        fill="currentColor"
        d="M12 2c4.4 0 8 3.6 8 8c0 5.4-6.2 11.4-7.2 12.3a1.2 1.2 0 0 1-1.6 0C10.2 21.4 4 15.4 4 10c0-4.4 3.6-8 8-8zm0 2a6 6 0 0 0-6 6c0 4 4.6 9 6 10.4c1.4-1.4 6-6.4 6-10.4a6 6 0 0 0-6-6zm-1 3h2v4h-2V7zm0 6h2v2h-2v-2z"
        opacity={active ? 1 : 0.9}
      />
    </svg>
  );
}

const TABS: Tab[] = [
  { key: "new", href: "/new", label: "New", icon: IconPlus },
  { key: "plans", href: "/plans", label: "Plans", icon: IconList },
  { key: "trip", href: "/trip", label: "Trip", icon: IconMap, isCenter: true },
  { key: "explore", href: "/explore", label: "Explore", icon: IconSearch },
  { key: "sos", href: "/sos", label: "SOS", icon: IconSos },
];

/**
 * Mobile-first tab bar:
 * - big hit targets (CSS should enforce >= 48px)
 * - safe-area inset friendly (CSS should use env(safe-area-inset-bottom))
 * - no heavy state; "active" derived from pathname
 * - optional micro-haptic via Vibration API (guarded, tiny)
 */
export const BottomTabBar = memo(function BottomTabBar() {
  const pathname = usePathname();

  const isActive = useCallback(
    (href: string) => pathname === href || (pathname ? pathname.startsWith(`${href}/`) : false),
    [pathname],
  );

  const microHaptic = useCallback(() => {
    // Super light, best-effort, won’t throw in unsupported environments.
    try {
      if (typeof navigator !== "undefined" && "vibrate" in navigator) navigator.vibrate(6);
    } catch {
      // ignore
    }
  }, []);

  return (
    <div className="roam-tabs-wrap" role="navigation" aria-label="Primary">
      <nav className="roam-tabs" aria-label="Primary tabs">
        {TABS.map((t) => {
          const active = isActive(t.href);

          // 🚨 FIX: Removed 'key' from commonProps!
          const commonProps = {
            href: t.href,
            className: t.isCenter ? "roam-tab roam-tab-center" : "roam-tab",
            "data-active": active ? "true" : "false",
            "aria-current": active ? ("page" as const) : undefined,
            onPointerDown: microHaptic,
            draggable: false,
            prefetch: false as const,
          };

          if (t.isCenter) {
            return (
              // 🚨 FIX: Explicitly passing key={t.key} here
              <Link key={t.key} {...commonProps}>
                <span className="roam-tab-bump" aria-hidden="true" />
                <span className="roam-tab-inner">
                  <span className="roam-tab-icon" aria-hidden="true">
                    {t.icon(active)}
                  </span>
                </span>
                {/* Notice the label is outside the inner floating button to dock at the bottom */}
                <span className="roam-tab-label">{t.label}</span>
              </Link>
            );
          }

          return (
            // 🚨 FIX: Explicitly passing key={t.key} here
            <Link key={t.key} {...commonProps}>
              <span className="roam-tab-icon" aria-hidden="true">
                {t.icon(active)}
              </span>
              <span className="roam-tab-label">{t.label}</span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
});