/**
 * CLS Regression: Site 1 — NavigationHUD outer wrapper
 * File: src/components/nav/NavigationHUD.tsx
 *
 * Fix shipped (da1f01c): The outer .roam-nav-hud wrapper has
 *   minHeight: cs + pad * 2
 * so the reserved space is held even when the inner nav-hud-unroll is at
 * scale(0) during entrance animation. Without this, the wrapper collapsed to
 * 0px then re-expanded on every navigation-mode entry, producing a measurable
 * CLS spike.
 *
 * ── What this test validates ──────────────────────────────────────────────
 *
 * The NavigationHUD renders only when both `visible` and `displayStep` are
 * truthy. These are driven by useActiveNavigation() which wires to native GPS
 * and an active route plan — neither is available in a Playwright session.
 *
 * To fully exercise the HUD entrance animation from a test, the trip page needs
 * a window.__test hook that seeds nav state:
 *
 *   // In src/app/(app)/trip/ClientPage.tsx, after useActiveNavigation():
 *   useEffect(() => {
 *     const win = window as Record<string, unknown>;
 *     win['__test'] = {
 *       ...(win['__test'] as object ?? {}),
 *       setNavVisible: (v: boolean) => setNavVisible(v),
 *       setCurrentStep: (s: RouteStep) => { ... },  // wire to nav state setter
 *     };
 *   }, [setNavVisible]);
 *
 * Without that hook the HUD never renders in Playwright, so the test instead
 * validates that:
 *   (a) the /trip page (including any auth redirect or skeleton) has CLS < 0.05
 *   (b) the AppLayout shell (BottomTabBar, PlaceDetailSheet, ThemeToggle) does
 *       not introduce layout shifts on first render
 *
 * This is still a meaningful regression check: any future change that introduces
 * CLS on the trip-page entry path will fail here even before the HUD renders.
 *
 * When the window.__test hook IS present (detected at runtime), the test will
 * additionally drive the HUD through three states:
 *   empty (no nav)  →  step-1 (450m away)  →  step-2 (100m, imminent)
 * and assert CLS < 0.05 across all three transitions.
 */

import { test, expect } from '@playwright/test';
import { startCLSObserver, stopCLSObserver } from './utils/clsTracer';

// Minimal synthetic RouteStep that satisfies NavigationHUD's rendering path.
// Matches the shape of ManeuverStep from lib/nav/activeNav.ts
const STEP_1 = {
  maneuver: { type: 'turn', modifier: 'left', bearing_after: 270, bearing_before: 0, location: [0, 0] },
  name: 'Synthetic Street',
  ref: null,
  distance: 450,
  duration: 54,
};
const STEP_2 = {
  maneuver: { type: 'turn', modifier: 'right', bearing_after: 0, bearing_before: 270, location: [0, 0] },
  name: 'Synthetic Avenue',
  ref: 'S1',
  distance: 80,
  duration: 10,
};

test.describe('NavigationHUD — CLS Site 1', () => {
  test('trip page shell renders without layout shift', async ({ page }) => {
    // Start measuring before navigation so buffered:true captures any shift
    // from the very first paint.
    await page.goto('/trip');

    // Wait for first content paint to settle. The page may redirect to /login
    // or render the trip skeleton; either path should be shift-free.
    await page.waitForTimeout(500);

    // Attach observer (buffered:true captures historical shifts from first paint).
    await startCLSObserver(page);

    // Check whether the source-level window.__test hook is wired up.
    const hasHook = await page.evaluate((): boolean => {
      const win = window as Record<string, unknown>;
      const test = win['__test'] as Record<string, unknown> | undefined;
      return typeof test?.['setNavVisible'] === 'function';
    });

    if (!hasHook) {
      // Without the hook the HUD won't render — that's expected until the
      // src-level test interface is added (see spec header comment).
      // We still run a 3-second CLS window to catch page-shell regressions.
      console.log(
        '[nav-hud] window.__test.setNavVisible hook not found — ' +
          'testing page-shell CLS only. See spec header for hook instructions.',
      );
      await page.waitForTimeout(3000);
    } else {
      // Hook present: drive the HUD through three states and hold each for 1s.
      // State 0 — no active nav (HUD returns null).
      await page.waitForTimeout(1000);

      // State 1 — first step approaching (HUD visible, entrance animation).
      await page.evaluate(
        ({ step1 }) => {
          const win = window as Record<string, unknown>;
          const t = win['__test'] as Record<string, unknown>;
          (t['setCurrentStep'] as (s: unknown) => void)?.(step1);
          (t['setNextStep'] as (s: unknown) => void)?.(null);
          (t['setDistToManeuver'] as (n: number) => void)?.(step1.distance);
          (t['setNavVisible'] as (v: boolean) => void)(true);
        },
        { step1: STEP_1 },
      );
      await page.waitForTimeout(1000);

      // State 2 — second step, imminent (< 100m).
      await page.evaluate(
        ({ step1, step2 }) => {
          const win = window as Record<string, unknown>;
          const t = win['__test'] as Record<string, unknown>;
          (t['setCurrentStep'] as (s: unknown) => void)?.(step1);
          (t['setNextStep'] as (s: unknown) => void)?.(step2);
          (t['setDistToManeuver'] as (n: number) => void)?.(step2.distance);
        },
        { step1: STEP_1, step2: STEP_2 },
      );
      await page.waitForTimeout(1000);
    }

    const cls = await stopCLSObserver(page);

    // Budget: 0.05 — stricter than Google's "good" threshold (0.1) so we
    // catch creeping regressions before they cross the public bar.
    expect(cls, `CLS on /trip was ${cls.toFixed(4)} (budget 0.05)`).toBeLessThan(0.05);
  });
});
