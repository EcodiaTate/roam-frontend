// src/components/ui/BottomTabBar.tsx

import { useLocation, useNavigate } from "react-router";
import { memo, useCallback } from "react";
import type { CSSProperties, ReactNode } from "react";
import { haptic } from "@/lib/native/haptics";
import { cx } from "@/lib/utils/cx";
import { useUIMode } from "@/lib/hooks/useUIMode";

/* ── Types ────────────────────────────────────────────────────────────── */

type Tab = {
  key: string;
  href: string;
  label: string;
  /** Renders the icon - receives active state for filled/outlined swap */
  icon: (active: boolean) => ReactNode;
  /** Center raised button (Trip) */
  isCenter?: boolean;
  /** SOS emphasized styling */
  emergency?: boolean;
};


/* ── Nav styles ───────────────────────────────────────────────────────── */

const NAV_STYLE: CSSProperties = {
  backgroundColor: "color-mix(in srgb, var(--roam-bg) 80%, transparent)",
  backdropFilter: "blur(24px) saturate(140%)",
  WebkitBackdropFilter: "blur(24px) saturate(140%)",
  borderTop: "1px solid color-mix(in srgb, var(--roam-text) 8%, transparent)",
  boxShadow: "0 -1px 0 color-mix(in srgb, var(--roam-text) 5%, transparent)",
};

// Safe-area leg below the nav - extends the blur into the home indicator zone
const SAFE_LEG_STYLE: CSSProperties = {
  position: "absolute",
  top: "100%",
  left: 0,
  right: 0,
  height: "env(safe-area-inset-bottom, 0px)",
  backgroundColor: "color-mix(in srgb, var(--roam-bg) 80%, transparent)",
  backdropFilter: "blur(24px) saturate(140%)",
  WebkitBackdropFilter: "blur(24px) saturate(140%)",
};

/* ── Icons ────────────────────────────────────────────────────────────
   Native convention: active = filled, inactive = outlined (stroke only).
   All icons are 24×24 viewBox, rendered at container size via CSS.
   Kept as inline SVG for zero-bundle-cost + instant paint.
   ──────────────────────────────────────────────────────────────────── */

/** Trip - map with fold lines (center tab, shown inside raised button) */
function IconTrip(active: boolean) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      {active ? (
        <path
          fill="currentColor"
          d="M9 2.5L3.5 4.8a1 1 0 0 0-.5.9v15a.8.8 0 0 0 1.1.7L9 19l6 2.5 5.5-2.3a1 1 0 0 0 .5-.9v-15a.8.8 0 0 0-1.1-.7L15 5 9 2.5z"
        />
      ) : (
        <>
          <path
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinejoin="round"
            d="M9 3L3.7 5.2a.8.8 0 0 0-.7.8V20a.6.6 0 0 0 .9.5L9 18.5l6 2.5 5.3-2.2a.8.8 0 0 0 .7-.8V4a.6.6 0 0 0-.9-.5L15 5.5 9 3z"
          />
          <line
            stroke="currentColor" strokeWidth="1.5"
            x1="9" y1="3" x2="9" y2="18.5" opacity="0.35"
          />
          <line
            stroke="currentColor" strokeWidth="1.5"
            x1="15" y1="5.5" x2="15" y2="21" opacity="0.35"
          />
        </>
      )}
    </svg>
  );
}

/** Explore - compass (discover places along route) */
function IconGuide(active: boolean) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      {active ? (
        <>
          <circle fill="currentColor" cx="12" cy="12" r="10" />
          <path
            fill="var(--roam-surface, #f4efe6)"
            d="M14.5 7.5l-6 3-1 5 6-3z"
          />
        </>
      ) : (
        <>
          <circle
            fill="none" stroke="currentColor" strokeWidth="1.8"
            cx="12" cy="12" r="9.2"
          />
          <path
            fill="currentColor" opacity="0.85"
            d="M14.5 7.5l-6 3-1 5 6-3z"
          />
        </>
      )}
    </svg>
  );
}

/** Places - bookmark / saved places */
function IconPlaces(active: boolean) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      {active ? (
        <path
          fill="currentColor"
          d="M17 3H7a2 2 0 0 0-2 2v16l7-3 7 3V5a2 2 0 0 0-2-2z"
        />
      ) : (
        <path
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinejoin="round"
          strokeLinecap="round"
          d="M17 3H7a2 2 0 0 0-2 2v16l7-3 7 3V5a2 2 0 0 0-2-2z"
        />
      )}
    </svg>
  );
}

/** Discover - globe (public trip feed) */
function IconDiscover(active: boolean) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      {active ? (
        <>
          <circle fill="currentColor" cx="12" cy="12" r="10" />
          <ellipse
            fill="none" stroke="var(--roam-surface, #f4efe6)"
            strokeWidth="1.4"
            cx="12" cy="12" rx="4.5" ry="10"
          />
          <line
            stroke="var(--roam-surface, #f4efe6)" strokeWidth="1.4"
            x1="2" y1="12" x2="22" y2="12"
          />
          <line
            stroke="var(--roam-surface, #f4efe6)" strokeWidth="1.4"
            x1="4.2" y1="7.5" x2="19.8" y2="7.5"
          />
          <line
            stroke="var(--roam-surface, #f4efe6)" strokeWidth="1.4"
            x1="4.2" y1="16.5" x2="19.8" y2="16.5"
          />
        </>
      ) : (
        <>
          <circle
            fill="none" stroke="currentColor" strokeWidth="1.8"
            cx="12" cy="12" r="9.2"
          />
          <ellipse
            fill="none" stroke="currentColor" strokeWidth="1.4"
            cx="12" cy="12" rx="4" ry="9.2"
          />
          <line
            stroke="currentColor" strokeWidth="1.4" opacity="0.6"
            x1="2.8" y1="12" x2="21.2" y2="12"
          />
          <line
            stroke="currentColor" strokeWidth="1.2" opacity="0.4"
            x1="4.5" y1="7.5" x2="19.5" y2="7.5"
          />
          <line
            stroke="currentColor" strokeWidth="1.2" opacity="0.4"
            x1="4.5" y1="16.5" x2="19.5" y2="16.5"
          />
        </>
      )}
    </svg>
  );
}

/** Memories - open book / journal */
function IconMemories(active: boolean) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      {active ? (
        <>
          <path
            fill="currentColor"
            d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20V3H6.5A2.5 2.5 0 0 0 4 5.5v14z"
          />
          <path
            fill="currentColor"
            d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20v4H6.5A2.5 2.5 0 0 1 4 19.5z"
            opacity="0.6"
          />
          <circle fill="var(--roam-surface, #f4efe6)" cx="12" cy="10" r="2.5" />
        </>
      ) : (
        <>
          <path
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinejoin="round"
            d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20V3H6.5A2.5 2.5 0 0 0 4 5.5v14z"
          />
          <path
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinejoin="round"
            d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20v4H6.5A2.5 2.5 0 0 1 4 19.5z"
          />
          <circle
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            cx="12" cy="10" r="2.5"
            opacity="0.6"
          />
        </>
      )}
    </svg>
  );
}

/** SOS - shield with exclamation (emergency) */
function IconSos(active: boolean) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      {active ? (
        <>
          <path
            fill="currentColor"
            d="M12 2L4 6v5.1c0 5.1 3.4 9.8 8 11 4.6-1.2 8-5.9 8-11V6l-8-4z"
          />
          <rect fill="var(--roam-surface, #f4efe6)" x="11" y="7" width="2" height="6" rx="1" />
          <rect fill="var(--roam-surface, #f4efe6)" x="11" y="15" width="2" height="2" rx="1" />
        </>
      ) : (
        <>
          <path
            fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round"
            d="M12 3L4.5 6.8v4.3c0 4.8 3.2 9.2 7.5 10.4 4.3-1.2 7.5-5.6 7.5-10.4V6.8L12 3z"
          />
          <line
            stroke="currentColor" strokeWidth="2" strokeLinecap="round"
            x1="12" y1="8" x2="12" y2="13"
          />
          <circle fill="currentColor" cx="12" cy="16" r="1.1" />
        </>
      )}
    </svg>
  );
}

/* ── Tab definitions: Guide | Discover | Trip (center) | Journal | SOS ──
   Note: /plans is now integrated as a drawer within /trip.
   /places is merged into /journal (Journal tab).
   ──────────────────────────────────────────────────────────────────── */

const TABS: Tab[] = [
  { key: "guide",    href: "/guide",    label: "Guide",    icon: IconGuide },
  { key: "discover", href: "/discover", label: "Discover", icon: IconDiscover },
  { key: "trip",     href: "/trip",     label: "Trip",     icon: IconTrip, isCenter: true },
  { key: "journal",  href: "/journal",  label: "Journal",  icon: IconMemories },
  { key: "sos",      href: "/sos",      label: "SOS",      icon: IconSos, emergency: true },
];

/* ── Component ────────────────────────────────────────────────────────── */

/** Tabs shown in simple mode - Guide, Trip (center), SOS */
const SIMPLE_TAB_KEYS = new Set(["guide", "trip", "sos"]);

export const BottomTabBar = memo(function BottomTabBar() {
  const pathname = useLocation().pathname;
  const navigate = useNavigate();
  const { isSimple } = useUIMode();

  const visibleTabs = isSimple ? TABS.filter((t) => SIMPLE_TAB_KEYS.has(t.key)) : TABS;

  const resolveActive = useCallback(
    (href: string) =>
      pathname === href || (pathname ? pathname.startsWith(`${href}/`) : false),
    [pathname],
  );

  // "/" redirects to /trip per spec
  const activeKey =
    TABS.find((t) => resolveActive(t.href))?.key ??
    (pathname === "/" ? "trip" : null);

  /** Navigate via router.push for all tabs - prevents full page reload
   *  on Capacitor's static-export file server where <Link> can fail. */
  const handleTabPress = useCallback(
    (e: React.MouseEvent | React.PointerEvent, href: string, isActive: boolean) => {
      e.preventDefault();
      if (!isActive) haptic.tap();
      navigate(href);
    },
    [navigate],
  );

  return (
    <div className="roam-tabs-wrap" role="navigation" aria-label="Primary" data-simple={isSimple ? "true" : undefined}>
      <nav className="roam-tabs" role="tablist" aria-label="Primary tabs" style={NAV_STYLE}>
        {/* Safe-area blur extension - replaces CSS ::after */}
        <span aria-hidden="true" style={SAFE_LEG_STYLE} />

        {visibleTabs.map((tab) => {
          const active = tab.key === activeKey;

          if (tab.isCenter) {
            return (
              <a
                key={tab.key}
                href={tab.href}
                role="tab"
                aria-selected={active}
                aria-label={tab.label}
                aria-current={active ? ("page" as const) : undefined}
                className={cx("roam-tab roam-tab-center", active && "roam-tab-active")}
                data-active={active ? "true" : "false"}
                draggable={false}
                onClick={(e) => handleTabPress(e, tab.href, active)}
              >
                <span className="roam-tab-bump" aria-hidden="true" />
                <span className="roam-tab-inner">
                  <span className="roam-tab-icon" aria-hidden="true">
                    {tab.icon(active)}
                  </span>
                </span>
                <span className="roam-tab-label">{tab.label}</span>
              </a>
            );
          }

          return (
            <a
              key={tab.key}
              href={tab.href}
              role="tab"
              aria-selected={active}
              aria-label={tab.label}
              aria-current={active ? ("page" as const) : undefined}
              className={cx(
                "roam-tab",
                active && "roam-tab-active",
                tab.emergency && "roam-tab-sos",
              )}
              data-active={active ? "true" : "false"}
              draggable={false}
              onClick={(e) => handleTabPress(e, tab.href, active)}
            >
              <span className="roam-tab-icon" aria-hidden="true">
                {tab.icon(active)}
              </span>
              <span className="roam-tab-label">{tab.label}</span>
            </a>
          );
        })}
      </nav>
    </div>
  );
});
