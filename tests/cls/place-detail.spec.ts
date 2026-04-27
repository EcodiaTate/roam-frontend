/**
 * CLS Regression: Sites 3 & 4 — PlaceDetailSheet backdrop + drag zone
 * File: src/components/places/PlaceDetailSheet.tsx
 *
 * Site 3 — backdrop element is position:fixed (audit-only, already correct).
 *   The .place-detail-backdrop is position:fixed, so it never participates
 *   in normal document flow and opening the sheet cannot shift page content.
 *   This test verifies the property is set correctly after any future refactor.
 *
 * Site 4 — drag zone is pre-sized to 150px.
 *   Fix shipped (da1f01c): .place-detail-drag-zone has
 *     height: 150, background: var(--roam-surface-hover), overflow: hidden
 *   so the space is reserved before the PlaceMapPreview lazy chunk loads.
 *   Without this the container collapsed to 0px then jumped to 150px as the
 *   Suspense resolved — a ~0.04 CLS score on a standard mobile viewport.
 *
 * ── Environment variables ─────────────────────────────────────────────────
 *
 * ROAM_TEST_LAT          — Latitude of a fixture place (e.g. -26.85)
 * ROAM_TEST_LNG          — Longitude of a fixture place (e.g. 152.98)
 * ROAM_TEST_PLACE_NAME   — Display name for the fixture place (e.g. "Maleny")
 *
 * All three are required for the sheet tests. Skip if unset.
 *
 * ROAM_TEST_SUPABASE_TOKEN — Optional auth token (same as trip-map.spec.ts).
 *
 * ── Triggering the sheet from Playwright ─────────────────────────────────
 *
 * PlaceDetailSheet is controlled by PlaceDetailContext whose openPlace() fn
 * is a React state setter — not accessible from outside the React tree.
 * To call it from Playwright the app needs a window-level test hook:
 *
 *   // In src/app/(app)/layout.tsx (inside PlaceDetailProvider consumer):
 *   const { openPlace } = usePlaceDetail();
 *   useEffect(() => {
 *     (window as Record<string, unknown>)['__openPlace'] = openPlace;
 *   }, [openPlace]);
 *
 * Until that hook is added, these tests skip even when lat/lng env vars are set.
 * The hook can be gated behind `if (import.meta.env.DEV)` to keep prod clean.
 *
 * When both the env vars AND the hook are present the full CLS measurement runs.
 */

import { test, expect } from '@playwright/test';
import { startCLSObserver, stopCLSObserver } from './utils/clsTracer';

const LAT   = process.env.ROAM_TEST_LAT;
const LNG   = process.env.ROAM_TEST_LNG;
const PLACE = process.env.ROAM_TEST_PLACE_NAME ?? 'Fixture Place';
const SUPABASE_TOKEN = process.env.ROAM_TEST_SUPABASE_TOKEN;

/** Returns true if the fixture env vars required to open a sheet are set. */
function fixtureReady(): boolean {
  return !!(LAT && LNG);
}

test.describe('PlaceDetailSheet — CLS Sites 3 & 4', () => {
  test.beforeEach(async ({ page }) => {
    if (SUPABASE_TOKEN) {
      await page.addInitScript((token: string) => {
        localStorage.setItem('roam-supabase-session', token);
      }, SUPABASE_TOKEN);
    }
  });

  // ── Site 3: backdrop must be position:fixed ──────────────────────────────

  test('place-detail-backdrop is position:fixed (Site 3 audit)', async ({ page }) => {
    if (!fixtureReady()) {
      console.log(
        '[place-detail] SKIP: set ROAM_TEST_LAT and ROAM_TEST_LNG env vars to run this test. ' +
          'Also add window.__openPlace hook to AppLayout (see spec header).',
      );
      test.skip();
      return;
    }

    await page.goto('/trip');

    const hasHook = await page.evaluate((): boolean => {
      return typeof (window as Record<string, unknown>)['__openPlace'] === 'function';
    });

    if (!hasHook) {
      console.log(
        '[place-detail] SKIP: window.__openPlace hook not found. ' +
          'See spec header for required src/app/(app)/layout.tsx modification.',
      );
      test.skip();
      return;
    }

    // Open the sheet.
    await page.evaluate(
      ({ lat, lng, name }: { lat: string; lng: string; name: string }) => {
        const openPlace = (window as Record<string, unknown>)['__openPlace'] as (
          p: unknown,
        ) => void;
        openPlace({
          id: 'test-place-id',
          name,
          lat: parseFloat(lat),
          lng: parseFloat(lng),
          category: 'attraction',
          source: 'osm',
        });
      },
      { lat: LAT!, lng: LNG!, name: PLACE },
    );

    // Wait for backdrop to appear.
    await page.waitForSelector('.place-detail-backdrop', { timeout: 5000 });

    const position = await page.evaluate((): string => {
      const el = document.querySelector('.place-detail-backdrop');
      return el ? window.getComputedStyle(el).position : 'not-found';
    });

    expect(position, 'place-detail-backdrop must be position:fixed').toBe('fixed');
  });

  // ── Site 4: drag zone pre-sizing prevents Suspense CLS ───────────────────

  test('place-detail drag zone does not shift during PlaceMapPreview lazy load (Site 4)', async ({
    page,
  }) => {
    if (!fixtureReady()) {
      console.log(
        '[place-detail] SKIP: set ROAM_TEST_LAT and ROAM_TEST_LNG env vars to run this test.',
      );
      test.skip();
      return;
    }

    await page.goto('/trip');

    const hasHook = await page.evaluate((): boolean => {
      return typeof (window as Record<string, unknown>)['__openPlace'] === 'function';
    });

    if (!hasHook) {
      console.log(
        '[place-detail] SKIP: window.__openPlace hook not found. ' +
          'See spec header for required src/app/(app)/layout.tsx modification.',
      );
      test.skip();
      return;
    }

    // Attach observer before opening so we capture the open-animation CLS.
    await startCLSObserver(page);

    // Open the sheet — this triggers the translateY(100%) → translateY(0) transition
    // and starts the Suspense resolution for PlaceMapPreview.
    await page.evaluate(
      ({ lat, lng, name }: { lat: string; lng: string; name: string }) => {
        const openPlace = (window as Record<string, unknown>)['__openPlace'] as (
          p: unknown,
        ) => void;
        openPlace({
          id: 'test-place-id',
          name,
          lat: parseFloat(lat),
          lng: parseFloat(lng),
          category: 'attraction',
          source: 'osm',
        });
      },
      { lat: LAT!, lng: LNG!, name: PLACE },
    );

    // Wait for the drag zone to be visible.
    await page.waitForSelector('.place-detail-drag-zone', { timeout: 5000 });

    // Verify the reserved height is 150px before the lazy map chunk loads.
    const dragZoneHeight = await page.evaluate((): number => {
      const el = document.querySelector<HTMLElement>('.place-detail-drag-zone');
      return el ? el.getBoundingClientRect().height : -1;
    });
    expect(
      dragZoneHeight,
      'drag zone must be pre-sized to 150px to prevent Suspense CLS',
    ).toBe(150);

    // Measure over 2000ms — covers the full lazy-chunk load time of PlaceMapPreview.
    // Any 0px → 150px shift that the pre-sizing fix was meant to prevent will
    // accumulate here.
    await page.waitForTimeout(2000);

    const cls = await stopCLSObserver(page);

    expect(
      cls,
      `CLS while PlaceMapPreview lazy-loads was ${cls.toFixed(4)} (budget 0.05)`,
    ).toBeLessThan(0.05);
  });

  // ── Site 3 + 4 combined: full open animation ──────────────────────────────

  test('sheet open animation + backdrop appearance causes CLS < 0.05 (Sites 3+4)', async ({
    page,
  }) => {
    if (!fixtureReady()) {
      console.log(
        '[place-detail] SKIP: set ROAM_TEST_LAT and ROAM_TEST_LNG env vars to run this test.',
      );
      test.skip();
      return;
    }

    await page.goto('/trip');

    const hasHook = await page.evaluate((): boolean => {
      return typeof (window as Record<string, unknown>)['__openPlace'] === 'function';
    });

    if (!hasHook) {
      console.log(
        '[place-detail] SKIP: window.__openPlace hook not found. ' +
          'See spec header for required src/app/(app)/layout.tsx modification.',
      );
      test.skip();
      return;
    }

    await startCLSObserver(page);

    await page.evaluate(
      ({ lat, lng, name }: { lat: string; lng: string; name: string }) => {
        const openPlace = (window as Record<string, unknown>)['__openPlace'] as (
          p: unknown,
        ) => void;
        openPlace({
          id: 'test-place-combined',
          name,
          lat: parseFloat(lat),
          lng: parseFloat(lng),
          category: 'attraction',
          source: 'osm',
        });
      },
      { lat: LAT!, lng: LNG!, name: PLACE },
    );

    // 1500ms covers: backdrop appear (Site 3) + sheet slide-in animation (280ms).
    await page.waitForTimeout(1500);

    const clsAfterOpen = await stopCLSObserver(page);
    expect(
      clsAfterOpen,
      `CLS during sheet open (1500ms) was ${clsAfterOpen.toFixed(4)} (budget 0.05)`,
    ).toBeLessThan(0.05);
  });
});
