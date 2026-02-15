// src/lib/offline/networkMonitor.ts
"use client";

import { healthApi } from "@/lib/api/health";
import { isNative, hasPlugin } from "@/lib/native/platform";

type Listener = (online: boolean) => void;

/**
 * NetworkMonitor
 *
 * Uses Capacitor Network plugin on native (instant, reliable detection)
 * and falls back to navigator.onLine on web.
 *
 * Separately pings backend /health (via our typed healthApi) to distinguish:
 *   - Device offline (no network at all)
 *   - Backend unreachable (has network but Roam API is down)
 */
class NetworkMonitorImpl {
  private _browserOnline = typeof navigator !== "undefined" ? navigator.onLine : true;
  private _nativeOnline = true;
  private _backendReachable = false;

  private _listeners = new Set<Listener>();
  private _pollTimer: ReturnType<typeof setInterval> | null = null;
  private _nativeUnsub: (() => void) | null = null;
  private _started = false;

  /** True = device has network AND backend is reachable */
  get online() {
    return this._deviceOnline && this._backendReachable;
  }

  /** True = device has any network connectivity */
  get deviceOnline() {
    return this._deviceOnline;
  }

  /** Whether the Roam backend last responded to /health */
  get backendReachable() {
    return this._backendReachable;
  }

  private get _deviceOnline() {
    return isNative ? this._nativeOnline : this._browserOnline;
  }

  /**
   * Start monitoring. Call once at app boot. Idempotent.
   */
  async start() {
    if (this._started) return;
    this._started = true;

    if (typeof window === "undefined") return;

    // ── Native: use Capacitor Network plugin ───────────────────────
    if (isNative && hasPlugin("Network")) {
      try {
        const { Network } = await import("@capacitor/network");

        // Initial status
        const status = await Network.getStatus();
        this._nativeOnline = !!status.connected;

        // Listen for changes
        const handle = await Network.addListener("networkStatusChange", (s) => {
          const prev = this.online;

          this._nativeOnline = !!s.connected;
          if (!s.connected) this._backendReachable = false;

          if (this.online !== prev) this._notify();

          // If we just came online, immediately check backend
          if (s.connected) void this._pollBackend();
        });

        this._nativeUnsub = () => handle.remove();
      } catch (e) {
        console.warn(
          "[NetworkMonitor] Capacitor Network plugin failed, falling back to browser API",
          e,
        );
        this._setupBrowserListeners();
      }
    } else {
      // ── Web: browser online/offline events ─────────────────────
      this._setupBrowserListeners();
    }

    // ── Backend health polling (both native and web) ─────────────
    await this._pollBackend();
    this._pollTimer = setInterval(() => {
      void this._pollBackend();
    }, this._deviceOnline ? 15_000 : 30_000);
  }

  /** Stop monitoring. */
  stop() {
    if (!this._started) return;
    this._started = false;

    if (typeof window !== "undefined") {
      window.removeEventListener("online", this._onBrowserOnline);
      window.removeEventListener("offline", this._onBrowserOffline);
    }

    this._nativeUnsub?.();
    this._nativeUnsub = null;

    if (this._pollTimer) {
      clearInterval(this._pollTimer);
      this._pollTimer = null;
    }
  }

  /** Subscribe to online/offline transitions. Returns unsubscribe function. */
  subscribe(fn: Listener): () => void {
    this._listeners.add(fn);
    return () => this._listeners.delete(fn);
  }

  /* ── Internals ──────────────────────────────────────────────────────── */

  private _setupBrowserListeners() {
    if (typeof window === "undefined") return;
    window.addEventListener("online", this._onBrowserOnline);
    window.addEventListener("offline", this._onBrowserOffline);
    this._browserOnline = navigator.onLine;
  }

  private _onBrowserOnline = () => {
    const prev = this.online;
    this._browserOnline = true;
    if (this.online !== prev) this._notify();
    void this._pollBackend();
  };

  private _onBrowserOffline = () => {
    const prev = this.online;
    this._browserOnline = false;
    this._backendReachable = false;
    if (this.online !== prev) this._notify();
  };

  private async _pollBackend() {
    if (!this._deviceOnline) {
      this._setBackendReachable(false);
      return;
    }

    try {
      const r = await healthApi.get();

      // api.get<T>() usually returns { data: T }. If your api returns T directly, this still works via fallbacks.
      const ok =
        typeof (r as any)?.data?.ok === "boolean"
          ? Boolean((r as any).data.ok)
          : typeof (r as any)?.ok === "boolean"
            ? Boolean((r as any).ok)
            : true; // "no throw" = reachable

      this._setBackendReachable(ok);
    } catch {
      this._setBackendReachable(false);
    }
  }

  private _setBackendReachable(v: boolean) {
    const prev = this.online;
    this._backendReachable = v;
    if (this.online !== prev) this._notify();
  }

  private _notify() {
    const status = this.online;
    for (const fn of this._listeners) {
      try {
        fn(status);
      } catch (e) {
        console.error("[NetworkMonitor] listener error", e);
      }
    }
  }
}

/** Singleton */
export const networkMonitor = new NetworkMonitorImpl();
