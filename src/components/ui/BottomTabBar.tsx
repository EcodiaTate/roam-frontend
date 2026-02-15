// src/components/ui/BottomTabBar.tsx
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { memo, useCallback } from "react";
import type { ReactNode } from "react";
import { haptic } from "@/lib/native/haptics";
import { haptics } from "@/lib/utils/haptics";

type Tab = {
  key: string;
  href: string;
  label: string;
  icon: (active: boolean) => ReactNode;
  /** If true, tab gets the center bump style */
  isCenter?: boolean;
  /** If true, tab gets the SOS emphasized style */
  emergency?: boolean;
};

// --- Icons (keep the styling set from your first component) ---
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
      <path
        fill="currentColor"
        d="M7 6h14v2H7V6zM7 11h14v2H7v-2zM7 16h14v2H7v-2z"
        opacity={active ? 1 : 0.9}
      />
      <path
        fill="currentColor"
        d="M3 6h2v2H3V6zM3 11h2v2H3v-2zM3 16h2v2H3v-2z"
        opacity={active ? 1 : 0.9}
      />
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
  { key: "guide", href: "/guide", label: "Guide", icon: IconSearch },
  { key: "trip", href: "/trip", label: "Trip", icon: IconMap, isCenter: true },
  { key: "sos", href: "/sos", label: "SOS", icon: IconSos, emergency: true },
];

export const BottomTabBar = memo(function BottomTabBar() {
  const pathname = usePathname();

  const isActive = useCallback(
    (href: string) => pathname === href || (pathname ? pathname.startsWith(`${href}/`) : false),
    [pathname],
  );

  // Match the older component behavior: treat "/" as "trip"
  const activeKey =
    TABS.find((t) => isActive(t.href))?.key ?? (pathname === "/" ? "trip" : null);

  return (
    <div className="roam-tabs-wrap" role="navigation" aria-label="Primary">
      <nav className="roam-tabs" role="tablist" aria-label="Primary tabs">
        {TABS.map((t) => {
          const active = t.key === activeKey;

          const classNameBase = t.isCenter ? "roam-tab roam-tab-center" : "roam-tab";
          const className = `${classNameBase} trip-interactive${active ? " roam-tab-active" : ""}${
            t.emergency ? " roam-tab-sos" : ""
          }`;

          return (
            <Link
              key={t.key}
              href={t.href}
              role="tab"
              aria-selected={active}
              aria-label={t.label}
              aria-current={active ? ("page" as const) : undefined}
              className={className}
              data-active={active ? "true" : "false"}
              draggable={false}
              prefetch={false}
              // Instant physical feedback on touch-down (mobile first)
              onPointerDown={() => {
                if (!active) {
                  // Keep both: web selection haptic + native tap haptic
                  try { haptics.selection(); } catch {}
                  try { haptic.tap(); } catch {}
                }
              }}
              // Keyboard / click fallback (desktop)
              onClick={() => {
                try { haptic.tap(); } catch {}
              }}
            >
              {t.isCenter ? (
                <>
                  <span className="roam-tab-bump" aria-hidden="true" />
                  <span className="roam-tab-inner">
                    <span className="roam-tab-icon" aria-hidden="true">
                      {t.icon(active)}
                    </span>
                  </span>
                  <span className="roam-tab-label">{t.label}</span>
                </>
              ) : (
                <>
                  <span className="roam-tab-icon" aria-hidden="true">
                    {t.icon(active)}
                  </span>
                  <span className="roam-tab-label">{t.label}</span>
                </>
              )}
            </Link>
          );
        })}
      </nav>
    </div>
  );
});
