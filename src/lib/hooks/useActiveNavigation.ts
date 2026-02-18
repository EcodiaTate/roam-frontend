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
} from "@/lib/nav/voice";
import {
  type FatigueState,
  initialFatigueState,
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
  /** Start active navigation — requests background GPS permission */
  start: () => Promise<void>;
  /** Stop active navigation — clears GPS watch */
  stop: () => void;
  /** Toggle voice mute */
  toggleMute: () => void;
  /** Reset after a corridor reroute with a new navpack */
  applyReroute: (newNavpack: NavPack) => void;
  /** Last GPS position from the navigation stream */
  lastPosition: RoamPosition | null;
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
  navRef.current = nav;
  const voiceRef = useRef<VoiceState>(initialVoiceState());
  const lastTickRef = useRef<number>(0);
  const navpackRef = useRef(navpack);
  navpackRef.current = navpack;
  const configRef = useRef(config);
  configRef.current = config;
  const isMutedRef = useRef(isMuted);
  isMutedRef.current = isMuted;

  // Precomputed data (expensive, memoize on navpack change)
  const flatSteps = useMemo(() => {
    if (!navpack) return [];
    return buildFlatSteps(navpack);
  }, [navpack]);

  const routeData = useMemo(() => {
    if (!navpack?.primary?.geometry) return { pts: [] as [number, number][], totalM: 0 };
    const decoded = decodePolyline6(navpack.primary.geometry);
    // decodePolyline6 returns [lng, lat][] for GeoJSON compat — we need [lat, lng][] for activeNav
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
  flatStepsRef.current = flatSteps;
  const routeDataRef = useRef(routeData);
  routeDataRef.current = routeData;

  // ── GPS tick handler ──
  const handlePosition = useCallback((pos: RoamPosition) => {
    setLastPosition(pos);

    const currentNav = navRef.current;
    const currentNavpack = navpackRef.current;
    if (!currentNavpack || currentNav.status === "idle") return;

    const now = pos.timestamp || Date.now();
    const dt_s = lastTickRef.current > 0 ? (now - lastTickRef.current) / 1000 : 1;
    lastTickRef.current = now;

    // 1. Update navigation state
    const newNav = updateActiveNav(
      currentNav,
      pos,
      currentNavpack,
      flatStepsRef.current,
      routeDataRef.current.pts,
      routeDataRef.current.totalM,
      configRef.current,
    );

    // 2. Update fatigue
    const prevFatigue = currentNav.fatigue;
    const newFatigue = updateFatigue(prevFatigue, pos.speed, dt_s);
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
      const voiceState = { ...voiceRef.current, muted: false };
      const ann = shouldSpeak(newNav, voiceState, configRef.current);
      if (ann) {
        speak(ann.text);
        voiceRef.current = applyAnnouncement(voiceState, ann);
      }
    }

    setNav(newNav);
  }, []); // No deps — everything accessed via refs

  // ── Start ──
  const start = useCallback(async () => {
    if (!navpackRef.current) return;
    if (isBackgroundTracking()) return;

    // Initialize navigation state
    const initial = startNavigation(navpackRef.current);
    setNav(initial);
    navRef.current = initial;
    voiceRef.current = initialVoiceState();
    lastTickRef.current = 0;

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
  };
}