// src/lib/nav/fatigue.ts
//
// Fatigue tracking for active navigation.
//
// Australian best practice:
//   - Take a 15-minute break every 2 hours
//   - Don't drive more than 8-10 hours total per day
//   - Night driving in rural areas dramatically increases fatigue risk
//
// Pure function: (prevState, position, dt) → newState
// Called every GPS tick alongside activeNav.updateActiveNav.

// ──────────────────────────────────────────────────────────────
// State
// ──────────────────────────────────────────────────────────────

export type FatigueWarningLevel = "none" | "suggested" | "recommended" | "urgent";

export type FatigueState = {
  /** When user tapped "Start Navigation" (null if not started) */
  tripStartedAt: number | null;
  /** Accumulated driving time in seconds (speed > 5 km/h) */
  totalDriveTime_s: number;
  /** Accumulated rest time in seconds (speed < 5 km/h for > 2 min) */
  totalRestTime_s: number;
  /** Timestamp of last qualified rest period (15+ min stop) */
  lastRestAt: number | null;
  /** Seconds of driving since last 15+ min rest */
  timeSinceLastRest_s: number;
  /** Currently stopped (speed < 5 km/h for > 2 min) */
  isResting: boolean;
  /** How long current rest has been (seconds) */
  currentRestDuration_s: number;
  /** Current warning level */
  warningLevel: FatigueWarningLevel;
};

export function initialFatigueState(): FatigueState {
  return {
    tripStartedAt: null,
    totalDriveTime_s: 0,
    totalRestTime_s: 0,
    lastRestAt: null,
    timeSinceLastRest_s: 0,
    isResting: false,
    currentRestDuration_s: 0,
    warningLevel: "none",
  };
}

// ──────────────────────────────────────────────────────────────
// Config
// ──────────────────────────────────────────────────────────────

/** Speed threshold below which we consider the driver "stopped" (m/s) */
const REST_SPEED_THRESHOLD_MPS = 5 / 3.6; // 5 km/h → m/s ≈ 1.39

/** Seconds of low speed before we classify as "resting" */
const REST_DETECTION_DELAY_S = 120; // 2 minutes

/** Seconds of rest to qualify as a "proper break" (resets fatigue timer) */
const QUALIFIED_REST_DURATION_S = 900; // 15 minutes

/** Warning thresholds (seconds since last qualified rest) */
const SUGGESTED_THRESHOLD_S = 90 * 60;    // 1.5 hours
const RECOMMENDED_THRESHOLD_S = 120 * 60;  // 2 hours
const URGENT_THRESHOLD_S = 150 * 60;       // 2.5 hours

/** Total driving time threshold for urgent warning */
const TOTAL_DRIVE_URGENT_S = 10 * 60 * 60; // 10 hours

// ──────────────────────────────────────────────────────────────
// Core update function
// ──────────────────────────────────────────────────────────────

/**
 * Update fatigue state from a GPS position tick.
 *
 * @param prev    Previous fatigue state
 * @param speedMps  Current speed in metres/second (null if unavailable)
 * @param dt_s    Seconds since the last update tick
 * @returns       Updated fatigue state
 */
export function updateFatigue(
  prev: FatigueState,
  speedMps: number | null,
  dt_s: number,
): FatigueState {
  if (dt_s <= 0) return prev;

  const speed = speedMps ?? 0;
  const isMoving = speed > REST_SPEED_THRESHOLD_MPS;

  let {
    totalDriveTime_s,
    totalRestTime_s,
    lastRestAt,
    timeSinceLastRest_s,
    isResting,
    currentRestDuration_s,
  } = prev;

  if (isMoving) {
    // ── Driving ──
    totalDriveTime_s += dt_s;
    timeSinceLastRest_s += dt_s;

    // If we were resting but started moving again, check if the rest
    // was long enough to qualify as a "proper break"
    if (isResting) {
      if (currentRestDuration_s >= QUALIFIED_REST_DURATION_S) {
        // Qualified rest — reset the fatigue timer
        lastRestAt = Date.now();
        timeSinceLastRest_s = 0;
      }
      isResting = false;
      currentRestDuration_s = 0;
    }
  } else {
    // ── Stopped / very slow ──
    currentRestDuration_s += dt_s;

    if (currentRestDuration_s >= REST_DETECTION_DELAY_S) {
      // We've been stopped long enough to count as resting
      if (!isResting) {
        isResting = true;
      }
      totalRestTime_s += dt_s;
    }
  }

  // ── Warning level ──
  let warningLevel: FatigueWarningLevel = "none";

  if (totalDriveTime_s >= TOTAL_DRIVE_URGENT_S) {
    warningLevel = "urgent";
  } else if (timeSinceLastRest_s >= URGENT_THRESHOLD_S) {
    warningLevel = "urgent";
  } else if (timeSinceLastRest_s >= RECOMMENDED_THRESHOLD_S) {
    warningLevel = "recommended";
  } else if (timeSinceLastRest_s >= SUGGESTED_THRESHOLD_S) {
    warningLevel = "suggested";
  }

  return {
    tripStartedAt: prev.tripStartedAt,
    totalDriveTime_s,
    totalRestTime_s,
    lastRestAt,
    timeSinceLastRest_s,
    isResting,
    currentRestDuration_s,
    warningLevel,
  };
}

// ──────────────────────────────────────────────────────────────
// Display helpers
// ──────────────────────────────────────────────────────────────

/**
 * Format the time since last rest for display.
 *   "1h 30m driving" | "2h 10m driving" | "45m driving"
 */
export function formatDriveSinceRest(state: FatigueState): string {
  const secs = state.timeSinceLastRest_s;
  if (secs < 60) return "< 1m driving";
  const mins = Math.round(secs / 60);
  if (mins < 60) return `${mins}m driving`;
  const hrs = Math.floor(mins / 60);
  const rem = mins % 60;
  if (rem === 0) return `${hrs}h driving`;
  return `${hrs}h ${rem}m driving`;
}

/**
 * Format total drive time.
 *   "Total: 4h 15m"
 */
export function formatTotalDriveTime(state: FatigueState): string {
  const mins = Math.round(state.totalDriveTime_s / 60);
  if (mins < 60) return `Total: ${mins}m`;
  const hrs = Math.floor(mins / 60);
  const rem = mins % 60;
  if (rem === 0) return `Total: ${hrs}h`;
  return `Total: ${hrs}h ${rem}m`;
}

/**
 * Colour token for the current warning level.
 */
export function fatigueColor(level: FatigueWarningLevel): string {
  switch (level) {
    case "none":        return "var(--roam-text-muted)";
    case "suggested":   return "var(--roam-text)";
    case "recommended": return "var(--roam-warning)";
    case "urgent":      return "var(--roam-danger)";
  }
}

/**
 * Whether the fatigue state has crossed a new warning threshold
 * compared to a previous state — used to trigger one-time voice/haptic.
 */
export function fatigueEscalated(prev: FatigueState, next: FatigueState): boolean {
  const order: FatigueWarningLevel[] = ["none", "suggested", "recommended", "urgent"];
  return order.indexOf(next.warningLevel) > order.indexOf(prev.warningLevel);
}