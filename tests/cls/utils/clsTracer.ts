/**
 * CLS measurement helpers for the Roam regression suite.
 *
 * Two usage patterns:
 *
 * 1. Simple window: call measureCLS() after navigation. The PerformanceObserver
 *    attaches with `buffered: true`, captures any historical shifts that occurred
 *    during initial paint, then observes for `durationMs` before returning.
 *
 *    const cls = await measureCLS(page, 2000);
 *    expect(cls).toBeLessThan(0.05);
 *
 * 2. Interactive: use startCLSObserver() + stopCLSObserver() when you need to
 *    trigger interactions (open sheet, change state) between start and stop.
 *
 *    await startCLSObserver(page);
 *    await triggerSomeInteraction(page);
 *    await page.waitForTimeout(1500);
 *    const cls = await stopCLSObserver(page);
 *    expect(cls).toBeLessThan(0.05);
 *
 * Both helpers filter `hadRecentInput === true` shifts per the Web Vitals spec —
 * layout changes immediately following user input do not count toward CLS.
 */

import type { Page } from '@playwright/test';

// ── Simple one-shot measurement ────────────────────────────────────────────

/**
 * Measure CLS on the current page over a fixed window.
 *
 * Attaches a PerformanceObserver with `buffered: true` so layout shifts from
 * before this call (e.g. first paint, font-swap) are included. Waits
 * `durationMs` ms then disconnects and returns the accumulated score.
 *
 * Call after navigation + any first-paint wait, before initiating interactions
 * that should be measured. For interactive scenarios prefer startCLSObserver /
 * stopCLSObserver instead.
 */
export async function measureCLS(page: Page, durationMs: number): Promise<number> {
  return page.evaluate((duration: number): Promise<number> => {
    return new Promise((resolve) => {
      let cls = 0;

      const observer = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          // LayoutShift is not yet in lib.dom.d.ts in all TS versions.
          const shift = entry as unknown as { hadRecentInput: boolean; value: number };
          if (!shift.hadRecentInput) {
            cls += shift.value;
          }
        }
      });

      // buffered: true - include shifts that happened before this observer attached.
      observer.observe({ type: 'layout-shift', buffered: true });

      setTimeout(() => {
        observer.disconnect();
        resolve(cls);
      }, duration);
    });
  }, durationMs);
}

// ── Interactive (start / stop) ─────────────────────────────────────────────

/**
 * Install a persistent CLS observer on the page. Call once per navigation.
 * Accumulates shifts in window.__cls until stopCLSObserver() is called.
 *
 * Uses `buffered: true` so historical shifts are included immediately.
 */
export async function startCLSObserver(page: Page): Promise<void> {
  await page.evaluate(() => {
    // Reset any previous measurement.
    (window as Record<string, unknown>)['__cls'] = 0;

    const observer = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        const shift = entry as unknown as { hadRecentInput: boolean; value: number };
        if (!shift.hadRecentInput) {
          (window as Record<string, unknown>)['__cls'] =
            ((window as Record<string, unknown>)['__cls'] as number) + shift.value;
        }
      }
    });
    observer.observe({ type: 'layout-shift', buffered: true });
    (window as Record<string, unknown>)['__clsObserver'] = observer;
  });
}

/**
 * Stop the CLS observer installed by startCLSObserver() and return the
 * accumulated score. Safe to call even if startCLSObserver() was never called
 * (returns 0).
 */
export async function stopCLSObserver(page: Page): Promise<number> {
  return page.evaluate((): number => {
    const win = window as Record<string, unknown>;
    const observer = win['__clsObserver'] as PerformanceObserver | undefined;
    observer?.disconnect();
    return (win['__cls'] as number) ?? 0;
  });
}
