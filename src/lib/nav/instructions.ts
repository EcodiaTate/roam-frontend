// src/lib/nav/instructions.ts
//
// Pure functions: NavStep → human-readable text, TTS strings, icon names.
// No React, no side effects, no imports beyond types.

import type { NavStep, NavManeuver, ManeuverType, ManeuverModifier } from "@/lib/types/navigation";

// ──────────────────────────────────────────────────────────────
// Distance & duration formatting (Australian conventions)
// ──────────────────────────────────────────────────────────────

/**
 * Format distance for display.
 *   < 100m   → "80 m"
 *   100-950m → "800 m" (rounded to 50)
 *   ≥ 950m   → "1.2 km"
 */
export function formatDistance(meters: number): string {
  if (meters < 0) meters = 0;
  if (meters < 100) {
    return `${Math.round(meters)} m`;
  }
  if (meters < 950) {
    return `${Math.round(meters / 50) * 50} m`;
  }
  const km = meters / 1000;
  if (km < 10) {
    return `${km.toFixed(1)} km`;
  }
  return `${Math.round(km)} km`;
}

/**
 * Format duration for display.
 *   < 60s   → "< 1 min"
 *   < 3600s → "12 min"
 *   ≥ 3600s → "1 hr 15 min"
 */
export function formatDuration(seconds: number): string {
  if (seconds < 0) seconds = 0;
  if (seconds < 60) return "< 1 min";
  const mins = Math.round(seconds / 60);
  if (mins < 60) return `${mins} min`;
  const hrs = Math.floor(mins / 60);
  const rem = mins % 60;
  if (rem === 0) return `${hrs} hr`;
  return `${hrs} hr ${rem} min`;
}

/**
 * Format ETA as a clock time string, e.g. "2:45 PM".
 */
export function formatETA(etaTimestamp: number): string {
  const d = new Date(etaTimestamp);
  const h = d.getHours();
  const m = d.getMinutes();
  const ampm = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 || 12;
  const mm = m < 10 ? `0${m}` : `${m}`;
  return `${h12}:${mm} ${ampm}`;
}

// ──────────────────────────────────────────────────────────────
// Maneuver → icon name mapping
// ──────────────────────────────────────────────────────────────

/**
 * Maps a NavManeuver to an icon name for the HUD arrow.
 *
 * Icon names follow a convention that can be mapped to SVGs, Lucide icons,
 * or custom arrow assets. The caller decides how to render them.
 */
export function maneuverIcon(m: NavManeuver): string {
  const { type, modifier } = m;

  // Roundabouts get their own icon regardless of modifier
  if (type === "roundabout" || type === "rotary") return "roundabout";
  if (type === "exit roundabout") return "roundabout-exit";

  // Arrive / depart
  if (type === "arrive") return "arrive";
  if (type === "depart") return "depart";

  // Merge / fork / ramp
  if (type === "merge") return modifier === "left" ? "merge-left" : "merge-right";
  if (type === "fork") return modifier === "left" ? "fork-left" : "fork-right";
  if (type === "on ramp") return modifier === "left" ? "ramp-left" : "ramp-right";
  if (type === "off ramp") return modifier === "left" ? "offramp-left" : "offramp-right";

  // Direction-based (turn, new name, continue, end of road)
  switch (modifier) {
    case "left":         return "arrow-left";
    case "right":        return "arrow-right";
    case "slight left":  return "arrow-slight-left";
    case "slight right": return "arrow-slight-right";
    case "sharp left":   return "arrow-sharp-left";
    case "sharp right":  return "arrow-sharp-right";
    case "uturn":        return "uturn-left";
    case "straight":     return "arrow-up";
    default:             return "arrow-up";
  }
}

// ──────────────────────────────────────────────────────────────
// Road name formatting
// ──────────────────────────────────────────────────────────────

/**
 * Build a display name from step name + ref.
 *   "Bruce Highway" + "M1" → "Bruce Highway (M1)"
 *   "" + "A1" → "A1"
 *   "Bruce Highway" + null → "Bruce Highway"
 *   "" + null → ""
 */
function roadDisplay(step: NavStep): string {
  const name = step.name || "";
  const ref = step.ref || "";
  if (name && ref) return `${name} (${ref})`;
  return name || ref;
}

// ──────────────────────────────────────────────────────────────
// Instruction text builders
// ──────────────────────────────────────────────────────────────

/** Verb phrase for the maneuver type + modifier. */
function actionPhrase(m: NavManeuver): string {
  const { type, modifier } = m;

  if (type === "depart") return "Head out";
  if (type === "arrive") {
    if (modifier === "left") return "Your destination is on the left";
    if (modifier === "right") return "Your destination is on the right";
    return "You have arrived";
  }

  if (type === "roundabout" || type === "rotary") {
    const exit = m.exit;
    if (exit) return `At the roundabout, take the ${ordinal(exit)} exit`;
    return "Enter the roundabout";
  }
  if (type === "exit roundabout") return "Exit the roundabout";

  if (type === "merge") return `Merge ${modifier ?? "ahead"}`;
  if (type === "fork") {
    return modifier === "left" ? "Keep left" : "Keep right";
  }
  if (type === "on ramp") return modifier === "left" ? "Take the ramp on the left" : "Take the ramp";
  if (type === "off ramp") return modifier === "left" ? "Take the exit on the left" : "Take the exit";

  if (type === "new name" || type === "continue") {
    if (modifier === "straight" || !modifier) return "Continue straight";
    return `Continue ${modifier}`;
  }

  if (type === "end of road") {
    if (modifier === "left") return "At the end of the road, turn left";
    if (modifier === "right") return "At the end of the road, turn right";
    return "Continue at the end of the road";
  }

  // Default: "turn" type
  switch (modifier) {
    case "left":         return "Turn left";
    case "right":        return "Turn right";
    case "slight left":  return "Bear left";
    case "slight right": return "Bear right";
    case "sharp left":   return "Sharp left";
    case "sharp right":  return "Sharp right";
    case "uturn":        return "Make a U-turn";
    case "straight":     return "Continue straight";
    default:             return "Continue";
  }
}

function ordinal(n: number): string {
  if (n === 1) return "1st";
  if (n === 2) return "2nd";
  if (n === 3) return "3rd";
  return `${n}th`;
}

// ──────────────────────────────────────────────────────────────
// Public formatting API
// ──────────────────────────────────────────────────────────────

/**
 * Full instruction for display.
 *   "Turn left onto Bruce Highway"
 *   "At the roundabout, take the 2nd exit onto Pacific Motorway (M1)"
 *   "You have arrived"
 */
export function formatInstruction(step: NavStep): string {
  const action = actionPhrase(step.maneuver);
  const road = roadDisplay(step);

  // Arrive type — no "onto" suffix
  if (step.maneuver.type === "arrive") return action;

  // Roundabout with road name
  if (
    (step.maneuver.type === "roundabout" || step.maneuver.type === "rotary") &&
    road
  ) {
    return `${action} onto ${road}`;
  }

  // Standard: action + road
  if (road) return `${action} onto ${road}`;
  return action;
}

/**
 * Upcoming announcement with distance prefix.
 *   "In 800 metres, turn left onto Bruce Highway"
 *   "In 2 kilometres, keep left at the fork"
 */
export function formatUpcoming(step: NavStep, distanceM: number): string {
  const dist = formatDistance(distanceM);
  const action = actionPhrase(step.maneuver);
  const road = roadDisplay(step);

  if (step.maneuver.type === "arrive") {
    return `In ${dist}, ${action.toLowerCase()}`;
  }
  if (road) {
    return `In ${dist}, ${action.toLowerCase()} onto ${road}`;
  }
  return `In ${dist}, ${action.toLowerCase()}`;
}

/**
 * Short text for HUD display when space is limited.
 *   "Turn left" | "Bear right" | "Roundabout, 2nd exit"
 */
export function formatShort(step: NavStep): string {
  return actionPhrase(step.maneuver);
}

/**
 * Long-straight filler announcement when no maneuver for 5+ km.
 *   "Continue for 45 kilometres on Bruce Highway"
 *   "Continue for 12 kilometres"
 */
export function formatLongStraight(step: NavStep, distanceM: number): string {
  const dist = formatDistance(distanceM);
  const road = roadDisplay(step);
  if (road) return `Continue for ${dist} on ${road}`;
  return `Continue for ${dist}`;
}