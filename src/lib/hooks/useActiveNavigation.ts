// src/hooks/useActiveNavigation.ts
"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  type ActiveNavState,
  type ActiveNavConfig,
  DEFAULT_NAV_CONFIG,
  initialActiveNavState,
  startNavigation,
  stopNavigation,
  resetAfterReroute,
  updateActiveNav,
  buildFlatSteps,
} from "@/lib/nav/activeNav";
import {
  type VoiceState,
  initialVoiceState,
  shouldSpeak,
  applyAnnouncement,
  speak,
  cancelSpeech,
  speakFatigueWarning,
  initVoice,
} from "@/lib/nav/voice";
import {
  updateFatigue,
  fatigueEscalated,
} from "@/lib/nav/fatigue";
import {
  startBackgroundTracking,
  stopBackgroundTracking,
  isBackgroundTracking,
} from "@/lib/native/backgroundLocation";
import { haptic } from "@/lib/native/haptics";
import { decodePolyline6 } from "@/lib/nav/polyline6";
import { type GpsSmoother, createGpsSmoother, smoothPosition } from "@/lib/nav/gpsSmooth";
import { GpsInterpolator } from "@/lib/nav/gpsInterpolator";
import type { NavPack } from "@/lib/types/navigation";
import type { RoamPosition } from "@/lib/native/geolocation";

// ──────────────────────────────────────────────────────────────
// Hook return type
// ──────────────────────────────────────────────────────────────

export type ActiveNavigationHook = {
  /** Current navigation state (position on route, ETA, etc.) */
  nav: ActiveNavState;
  /** Whether active navigation is running */
  isActive: boolean;
  /** Whether voice is muted */
  isMuted: boolean;
  /** Start active navigation - requests background GPS permission */
  start: () => Promise<void>;
  /** Stop active navigation - clears GPS watch */
  stop: () => void;
  /** Toggle voice mute */
  toggleMute: () => void;
  /** Reset after a corridor reroute with a new navpack */
  applyReroute: (newNavpack: NavPack) => void;
  /** Last smoothed GPS position (~1 Hz, for nav state machine + fallback) */
  lastPosition: RoamPosition | null;
  /** The 60 fps GPS interpolator instance (for map camera + puck rendering) */
  interpolator: GpsInterpolator;
};

// ──────────────────────────────────────────────────────────────
// Hook
// ──────────────────────────────────────────────────────────────

export function useActiveNavigation(
  navpack: NavPack | null,
  config: ActiveNavConfig = DEFAULT_NAV_CONFIG,
): ActiveNavigationHook {
  const [nav, setNav] = useState<ActiveNavState>(initialActiveNavState);
  const [lastPosition, setLastPosition] = useState<RoamPosition | null>(null);
  const [isMuted, setIsMuted] = useState(false);

  // Refs for values that change every tick (avoid stale closures)
  const navRef = useRef(nav);
  const voiceRef = useRef<VoiceState>(initialVoiceState());
  const lastTickRef = useRef<number>(0);
  const gpsSmootherRef = useRef<GpsSmoother>(createGpsSmoother());
  const navpackRef = useRef(navpack);
  const configRef = useRef(config);
  const isMutedRef = useRef(isMuted);

  // Batch ref syncs into a single effect
  useEffect(() => {
    navRef.current = nav;
    navpackRef.current = navpack;
    configRef.current = config;
    isMutedRef.current = isMuted;
  });

  // ── GPS Interpolator (60 fps) ──
  // The interpolator is created once and persists for the hook lifetime.
  // Its onFrame callback is wired externally by the consuming component
  // (ClientPage) via the returned `interpolator` reference.
  // We use a stable no-op initially; ClientPage sets the real callback.
  const interpolatorRef = useRef<GpsInterpolator | null>(null);
  if (!interpolatorRef.current) {
    // Create with a no-op — the real onFrame is set by the consumer
    interpolatorRef.current = new GpsInterpolator(() => {});
  }
  const interpolator = interpolatorRef.current;

  // Precomputed data (expensive, memoize on navpack change)
  const flatSteps = useMemo(() => {
    if (!navpack) return [];
    return buildFlatSteps(navpack);
  }, [navpack]);

  const routeData = useMemo(() => {
    if (!navpack?.primary?.geometry) return { pts: [] as [number, number][], totalM: 0 };
    const decoded = decodePolyline6(navpack.primary.geometry);
    // decodePolyline6 returns [lng, lat][] for GeoJSON compat - we need [lat, lng][] for activeNav
    const pts: [number, number][] = decoded.map((p) => [p.lat, p.lng]);
    let totalM = 0;
    for (let i = 1; i < pts.length; i++) {
      const dlat = (pts[i][0] - pts[i - 1][0]) * Math.PI / 180;
      const dlng = (pts[i][1] - pts[i - 1][1]) * Math.PI / 180;
      const a = Math.sin(dlat / 2) ** 2 +
        Math.cos(pts[i - 1][0] * Math.PI / 180) * Math.cos(pts[i][0] * Math.PI / 180) *
        Math.sin(dlng / 2) ** 2;
      totalM += 6371000 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    }
    return { pts, totalM };
  }, [navpack]);

  const flatStepsRef = useRef(flatSteps);
  const routeDataRef = useRef(routeData);
  useEffect(() => {
    flatStepsRef.current = flatSteps;
    routeDataRef.current = routeData;
  }, [flatSteps, routeData]);

  // ── GPS tick handler (~1 Hz from background GPS) ──
  const handlePosition = useCallback((pos: RoamPosition) => {
    // Apply Kalman smoothing before any processing
    const { smoothed, smoother } = smoothPosition(gpsSmootherRef.current, pos);
    gpsSmootherRef.current = smoother;

    // Feed the smoothed fix to the interpolator for 60 fps rendering
    interpolatorRef.current?.pushFix(smoothed);

    // Expose smoothed position for nav state machine and fallback
    setLastPosition(smoothed);

    const currentNav = navRef.current;
    const currentNavpack = navpackRef.current;
    if (!currentNavpack || currentNav.status === "idle") return;

    const now = smoothed.timestamp || Date.now();
    const dt_s = lastTickRef.current > 0 ? (now - lastTickRef.current) / 1000 : 1;
    lastTickRef.current = now;

    // 1. Update navigation state using smoothed position
    const newNav = updateActiveNav(
      currentNav,
      smoothed,
      currentNavpack,
      flatStepsRef.current,
      routeDataRef.current.pts,
      routeDataRef.current.totalM,
      configRef.current,
    );

    // 2. Update fatigue
    const prevFatigue = currentNav.fatigue;
    const newFatigue = updateFatigue(prevFatigue, smoothed.speed, dt_s);
    newNav.fatigue = newFatigue;

    // 3. Check for fatigue escalation → voice + haptic
    if (fatigueEscalated(prevFatigue, newFatigue) && !isMutedRef.current) {
      const mins = Math.round(newFatigue.timeSinceLastRest_s / 60);
      speakFatigueWarning(mins);
      haptic.warning();
    }

    // 4. Check for off-route → haptic
    if (newNav.status === "off_route" && currentNav.status !== "off_route") {
      haptic.error();
    }

    // 5. Check for arrival → haptic
    if (newNav.status === "arrived" && currentNav.status !== "arrived") {
      haptic.success();
    }

    // 6. Voice announcements
    if (!isMutedRef.current) {
      voiceRef.current.muted = false;
      const ann = shouldSpeak(newNav, voiceRef.current, configRef.current);
      if (ann) {
        speak(ann.text);
        voiceRef.current = applyAnnouncement(voiceRef.current, ann);
      }
    }

    setNav(newNav);
  }, []); // No deps - everything accessed via refs

  // ── Start ──
  const start = useCallback(async () => {
    if (!navpackRef.current) return;
    if (isBackgroundTracking()) return;

    // Pre-load TTS voice so first announcement isn't delayed
    initVoice();

    // Initialize navigation state
    const initial = startNavigation(navpackRef.current);
    setNav(initial);
    navRef.current = initial;
    voiceRef.current = initialVoiceState();
    gpsSmootherRef.current = createGpsSmoother();
    lastTickRef.current = 0;

    // Start the 60 fps interpolation loop
    interpolatorRef.current?.start();

    // Start GPS
    await startBackgroundTracking(handlePosition, (err) => {
      console.warn("[ActiveNav] GPS error:", err);
    });

    // Opening announcement
    const firstStep = navpackRef.current.primary.legs[0]?.steps?.[0];
    if (firstStep) {
      speak(`Starting navigation. ${firstStep.name ? `Head towards ${firstStep.name}.` : "Head out."}`);
    }

    haptic.medium();
  }, [handlePosition]);

  // ── Stop ──
  const stop = useCallback(() => {
    stopBackgroundTracking();
    interpolatorRef.current?.stop();
    cancelSpeech();
    setNav((prev) => stopNavigation(prev));
    setLastPosition(null);
    lastTickRef.current = 0;
    haptic.light();
  }, []);

  // ── Toggle mute ──
  const toggleMute = useCallback(() => {
    setIsMuted((m) => {
      const newMuted = !m;
      if (newMuted) cancelSpeech();
      return newMuted;
    });
    haptic.selection();
  }, []);

  // ── Reroute ──
  const applyReroute = useCallback((newNavpack: NavPack) => {
    const current = navRef.current;
    const newState = resetAfterReroute(current, newNavpack);
    setNav(newState);
    navRef.current = newState;
    voiceRef.current = initialVoiceState();
    speak("Route recalculated.");
    haptic.success();
  }, []);

  // ── Cleanup on unmount ──
  useEffect(() => {
    return () => {
      if (isBackgroundTracking()) {
        stopBackgroundTracking();
      }
      interpolatorRef.current?.stop();
      cancelSpeech();
    };
  }, []);

  const isActive = nav.status === "navigating" || nav.status === "off_route" || nav.status === "rerouting";

  return {
    nav,
    isActive,
    isMuted,
    start,
    stop,
    toggleMute,
    applyReroute,
    lastPosition,
    interpolator,
  };
}
