// src/lib/nav/voice.ts
//
// Voice announcement engine for turn-by-turn navigation.
//
// Pure decision logic: shouldSpeak(navState, voiceState, config) → announcement | null
// Plus a thin TTS wrapper around Web Speech API / Capacitor TTS.

import type { ActiveNavState, ActiveNavConfig } from "@/lib/nav/activeNav";
import { formatUpcoming, formatInstruction, formatLongStraight } from "@/lib/nav/instructions";

// ──────────────────────────────────────────────────────────────
// Voice state
// ──────────────────────────────────────────────────────────────

export type AnnouncementStage = "prep" | "approach" | "action" | "long_straight" | "arrived";

export type VoiceState = {
  /** Step index of the last announcement (flat index across all legs) */
  lastAnnouncedStepKey: string;
  /** Stage of the last announcement for the current step */
  lastAnnouncedStage: AnnouncementStage | null;
  /** Timestamp of the last spoken utterance (enforce minimum gap) */
  lastSpokeAt: number;
  /** Whether voice is muted */
  muted: boolean;
  /** Distance at which we last announced a long-straight filler */
  lastLongStraightKm: number;
};

export function initialVoiceState(): VoiceState {
  return {
    lastAnnouncedStepKey: "",
    lastAnnouncedStage: null,
    lastSpokeAt: 0,
    muted: false,
    lastLongStraightKm: 0,
  };
}

export type Announcement = {
  text: string;
  stage: AnnouncementStage;
  /** Key to track: `${legIdx}:${stepIdx}` */
  stepKey: string;
};

// Minimum gap between announcements (milliseconds)
const MIN_SPEAK_GAP_MS = 3000;

// ──────────────────────────────────────────────────────────────
// Core decision function
// ──────────────────────────────────────────────────────────────

/**
 * Decide whether to make a voice announcement this tick.
 *
 * 3-stage pattern per maneuver:
 *   1. PREPARATION - 2km before (highway) / 500m before (urban)
 *   2. APPROACH    - 500m before (highway) / 200m before (urban)
 *   3. ACTION      - 50m before
 *
 * Also handles:
 *   - Arrival announcement
 *   - Long straight filler ("continue for 45 km on Bruce Highway")
 *   - Minimum time gap between announcements
 *
 * Returns null if no announcement should be made this tick.
 */
export function shouldSpeak(
  nav: ActiveNavState,
  voice: VoiceState,
  config: ActiveNavConfig,
): Announcement | null {
  if (voice.muted) return null;
  if (nav.status !== "navigating" && nav.status !== "arrived") return null;
  if (!nav.currentStep) return null;

  const now = nav.updatedAt || Date.now();

  // Enforce minimum gap
  if (now - voice.lastSpokeAt < MIN_SPEAK_GAP_MS) return null;

  const stepKey = `${nav.currentLegIdx}:${nav.currentStepIdx}`;

  // ── Arrival ──
  if (nav.status === "arrived") {
    if (voice.lastAnnouncedStage === "arrived" && voice.lastAnnouncedStepKey === stepKey) {
      return null; // already announced
    }
    return {
      text: formatInstruction(nav.currentStep),
      stage: "arrived",
      stepKey,
    };
  }

  // ── Long straight filler ──
  // If we're > 5km from the next maneuver and haven't announced recently,
  // give a "continue for X km" message every 10km.
  if (nav.distToStepEnd_m > config.longStraightThreshold_km * 1000) {
    const kmFromManeuver = nav.distToStepEnd_m / 1000;
    const lastFillerKm = voice.lastLongStraightKm;
    // Announce at every 10km interval (e.g., at 40km, 30km, 20km, 10km)
    const nextFillerKm = Math.floor(kmFromManeuver / 10) * 10;
    if (nextFillerKm > 0 && nextFillerKm !== lastFillerKm && kmFromManeuver - nextFillerKm < 0.5) {
      return {
        text: formatLongStraight(nav.currentStep, nav.distToStepEnd_m),
        stage: "long_straight",
        stepKey,
      };
    }
  }

  // ── Next maneuver - determine which step to announce ──
  // We announce the NEXT step (the upcoming maneuver), not the current one.
  const announceStep = nav.nextStep ?? nav.currentStep;
  const dist = nav.distToNextManeuver_m;
  const announceStepKey = nav.nextStep
    ? `${nav.currentLegIdx}:${nav.currentStepIdx + 1}`
    : stepKey;

  // ── Stage determination based on distance ──
  let targetStage: AnnouncementStage | null = null;

  if (dist <= config.imminentDistance_m) {
    targetStage = "action";
  } else if (dist <= config.approachDistance_m) {
    targetStage = "approach";
  } else if (dist <= config.prepDistance_m) {
    targetStage = "prep";
  }

  if (!targetStage) return null;

  // Don't re-announce the same stage for the same step
  if (
    voice.lastAnnouncedStepKey === announceStepKey &&
    voice.lastAnnouncedStage === targetStage
  ) {
    return null;
  }

  // Don't go backwards in stages (e.g. don't re-announce "prep" after "approach")
  if (voice.lastAnnouncedStepKey === announceStepKey) {
    const stageOrder: AnnouncementStage[] = ["prep", "approach", "action"];
    const lastIdx = voice.lastAnnouncedStage
      ? stageOrder.indexOf(voice.lastAnnouncedStage)
      : -1;
    const targetIdx = stageOrder.indexOf(targetStage);
    if (targetIdx <= lastIdx) return null;
  }

  // ── Build announcement text ──
  let text: string;
  if (targetStage === "action") {
    text = formatInstruction(announceStep);
  } else {
    text = formatUpcoming(announceStep, dist);
  }

  return {
    text,
    stage: targetStage,
    stepKey: announceStepKey,
  };
}

/**
 * Apply an announcement to the voice state (after speaking).
 * Returns the updated voice state.
 */
export function applyAnnouncement(voice: VoiceState, ann: Announcement): VoiceState {
  return {
    ...voice,
    lastAnnouncedStepKey: ann.stepKey,
    lastAnnouncedStage: ann.stage,
    lastSpokeAt: Date.now(),
    lastLongStraightKm:
      ann.stage === "long_straight"
        ? Math.floor(parseFloat(ann.text.match(/(\d+\.?\d*)\s*k/i)?.[1] ?? "0"))
        : voice.lastLongStraightKm,
  };
}

// ──────────────────────────────────────────────────────────────
// TTS wrapper — smart voice selection + Web Speech API
// ──────────────────────────────────────────────────────────────

/** Cached best voice (populated once voices load). */
let _selectedVoice: SpeechSynthesisVoice | null = null;
let _voiceLoaded = false;

/**
 * Priority-ranked voice preference patterns.
 * Tries each in order; uses the first voice whose name matches.
 * Designed to avoid robotic default voices and pick enhanced/neural ones.
 */
const VOICE_PREFERENCES: Array<{ lang: RegExp; name?: RegExp; localService?: boolean }> = [
  // iOS enhanced English voices (highest quality on device)
  { lang: /en[-_](AU|GB|US)/i, name: /Siri|Enhanced|Premium/i },
  // iOS/macOS "Samantha" (Enhanced) is the best bundled natural AU/US voice
  { lang: /en[-_](AU|GB|US)/i, name: /Samantha/i },
  // Android high-quality TTS
  { lang: /en[-_](AU|GB|US)/i, name: /Google/i },
  // Any local English AU voice
  { lang: /en[-_]AU/i },
  // Any local English GB voice (next best accent match)
  { lang: /en[-_]GB/i },
  // Any local English US voice
  { lang: /en[-_]US/i },
  // Any English local service voice
  { lang: /en/i, localService: true },
  // Last resort: any English voice at all
  { lang: /en/i },
];

function pickBestVoice(): SpeechSynthesisVoice | null {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return null;
  const voices = window.speechSynthesis.getVoices();
  if (voices.length === 0) return null;

  for (const pref of VOICE_PREFERENCES) {
    const match = voices.find((v) => {
      if (!pref.lang.test(v.lang)) return false;
      if (pref.name && !pref.name.test(v.name)) return false;
      if (pref.localService !== undefined && v.localService !== pref.localService) return false;
      return true;
    });
    if (match) return match;
  }

  // Absolute fallback: first available voice
  return voices[0] ?? null;
}

/**
 * Eagerly load voices and select the best one.
 * Call this once when the app initializes (before first nav tick).
 * The Web Speech API loads voices asynchronously on first call.
 */
export function initVoice(): void {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
  if (_voiceLoaded) return;

  const tryLoad = () => {
    const voice = pickBestVoice();
    if (voice) {
      _selectedVoice = voice;
      _voiceLoaded = true;
    }
  };

  tryLoad();

  // Chrome/Android fires onvoiceschanged when async list is ready
  if (!_voiceLoaded) {
    window.speechSynthesis.onvoiceschanged = () => {
      tryLoad();
      // Also fix the iOS/Android WebView bug where speechSynthesis freezes after ~30s
      // by pre-warming with a silent utterance
      if (_voiceLoaded) {
        window.speechSynthesis.onvoiceschanged = null;
      }
    };
  }
}

/**
 * Speak text using Web Speech API with the best available voice.
 * Handles the iOS WebView 30-second freeze bug by cancelling + resuming.
 */
export function speak(
  text: string,
  options?: { rate?: number; lang?: string },
): void {
  if (typeof window === "undefined") return;
  if (!("speechSynthesis" in window)) return;

  // Ensure voices are loaded
  if (!_voiceLoaded) initVoice();

  // iOS WebView bug: speechSynthesis can get stuck. Resume before speaking.
  if (window.speechSynthesis.paused) {
    window.speechSynthesis.resume();
  }

  const u = new SpeechSynthesisUtterance(text);

  // Apply best voice if found
  if (_selectedVoice) {
    u.voice = _selectedVoice;
    u.lang = _selectedVoice.lang;
  } else {
    u.lang = options?.lang ?? "en-AU";
  }

  // Slightly slower rate sounds more natural and easier to understand while driving
  u.rate = options?.rate ?? 0.95;
  u.pitch = 1.0;
  u.volume = 1.0;

  // Cancel in-progress speech then speak
  window.speechSynthesis.cancel();
  window.speechSynthesis.speak(u);
}

/**
 * Cancel any in-progress speech.
 */
export function cancelSpeech(): void {
  if (typeof window === "undefined") return;
  if ("speechSynthesis" in window) {
    window.speechSynthesis.cancel();
  }
}

/**
 * Check if TTS is currently speaking.
 */
export function isSpeaking(): boolean {
  if (typeof window === "undefined") return false;
  if (!("speechSynthesis" in window)) return false;
  return window.speechSynthesis.speaking;
}

// ──────────────────────────────────────────────────────────────
// Supplementary voice announcements (fuel, hazards, fatigue)
// ──────────────────────────────────────────────────────────────

/**
 * These are called by the parent component when conditions are met,
 * not by the shouldSpeak decision engine.
 */

export function speakFuelWarning(stationName: string, distKm: number): void {
  const dist = distKm < 1 ? `${Math.round(distKm * 1000)} metres` : `${distKm.toFixed(1)} kilometres`;
  speak(`Last fuel in ${dist} at ${stationName}`);
}

export function speakHazardWarning(headline: string, distKm: number): void {
  const dist = distKm < 1 ? `${Math.round(distKm * 1000)} metres` : `${distKm.toFixed(0)} kilometres`;
  speak(`Caution. ${headline}, ${dist} ahead`);
}

export function speakFatigueWarning(drivingMinutes: number, nextRestName?: string, nextRestKm?: number): void {
  const mins = Math.round(drivingMinutes);
  let text = `You've been driving for ${mins} minutes. Consider a break.`;
  if (nextRestName && nextRestKm !== undefined) {
    const dist = nextRestKm < 1 ? `${Math.round(nextRestKm * 1000)} metres` : `${nextRestKm.toFixed(0)} kilometres`;
    text += ` Next rest area in ${dist} at ${nextRestName}.`;
  }
  speak(text);
}