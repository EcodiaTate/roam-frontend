// src/lib/nav/alertPriority.ts
//
// Unified alert attention system.
//
// Cross-overlay alert prioritization, batching, and staleness suppression.
// Normalizes all alert types to a 0-10 urgency score so the UI can show
// the most important things first and batch related alerts together.

// ──────────────────────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────────────────────

export type AlertSource =
  | "traffic"
  | "hazard"
  | "fuel"
  | "fatigue"
  | "weather"
  | "flood"
  | "bushfire"
  | "wildlife"
  | "observation";

export type UnifiedAlert = {
  id: string;
  source: AlertSource;
  /** Normalized 0-10 urgency (10 = most critical) */
  urgency: number;
  /** Short title */
  title: string;
  /** Longer description */
  description: string;
  /** Position along route (km), null if not route-specific */
  km_along: number | null;
  /** ISO timestamp when the underlying data was created */
  data_created_at: string | null;
  /** Is the underlying data stale (> 1.5x normal TTL)? */
  is_stale: boolean;
  /** For deduplication: spatial key (rounded lat/lng) */
  spatial_key: string | null;
};

export type AlertBatch = {
  /** Region description: "Next 50km" or "At 234km" */
  region: string;
  /** km range */
  from_km: number;
  to_km: number;
  /** Alerts in this region, sorted by urgency */
  alerts: UnifiedAlert[];
  /** Highest urgency in the batch */
  max_urgency: number;
  /** Summary for voice: "Complex stretch ahead: storm + wildlife + fuel gap" */
  voice_summary: string | null;
};

// ──────────────────────────────────────────────────────────────
// Urgency scoring
// ──────────────────────────────────────────────────────────────

// Severity → base urgency mappings per source
const SEVERITY_MAP: Record<string, number> = {
  // Traffic
  "traffic:major:closure": 9,
  "traffic:major:flooding": 9,
  "traffic:major:incident": 8,
  "traffic:moderate:incident": 6,
  "traffic:moderate:roadworks": 5,
  "traffic:minor:roadworks": 3,
  "traffic:info:roadworks": 2,

  // Hazards
  "hazard:high": 8,
  "hazard:medium": 5,
  "hazard:low": 3,

  // Fuel
  "fuel:critical": 10,
  "fuel:warn": 7,
  "fuel:info": 4,

  // Fatigue
  "fatigue:urgent": 9,
  "fatigue:recommended": 6,
  "fatigue:suggested": 4,

  // Weather
  "weather:extreme": 8,
  "weather:heavy": 6,
  "weather:moderate": 4,

  // Flood
  "flood:major:rising": 9,
  "flood:moderate:rising": 6,
  "flood:minor:rising": 3,

  // Bushfire
  "bushfire:emergency": 10,
  "bushfire:watch_and_act": 8,
  "bushfire:advice": 5,

  // Wildlife
  "wildlife:high:twilight": 7,
  "wildlife:high": 5,
  "wildlife:medium": 3,
};

/**
 * Look up base urgency for a source + severity combo.
 * Falls back to 3 if not found.
 */
export function baseUrgency(source: AlertSource, severity: string, modifier?: string): number {
  const keys = [
    `${source}:${severity}:${modifier}`,
    `${source}:${severity}`,
    `${source}`,
  ];
  for (const k of keys) {
    if (k in SEVERITY_MAP) return SEVERITY_MAP[k];
  }
  return 3;
}

// ──────────────────────────────────────────────────────────────
// Staleness suppression
// ──────────────────────────────────────────────────────────────

const STALENESS_PENALTY: Record<AlertSource, number> = {
  traffic: 0.4,    // 8h old traffic = urgency * 0.4
  hazard: 0.6,
  fuel: 0.9,       // fuel prices don't change fast
  fatigue: 1.0,    // always current
  weather: 0.5,
  flood: 0.7,
  bushfire: 0.3,   // stale bushfire data is dangerous to trust
  wildlife: 0.9,   // wildlife zones don't change
  observation: 0.5,
};

/**
 * Apply staleness penalty to urgency score.
 * Returns adjusted urgency (may be 0 for very stale low-priority alerts).
 */
export function adjustForStaleness(
  alert: UnifiedAlert,
  ttlMultiplier: number = 1.5,
): number {
  if (!alert.data_created_at || !alert.is_stale) return alert.urgency;
  const penalty = STALENESS_PENALTY[alert.source] ?? 0.7;
  return Math.max(0, alert.urgency * penalty);
}

// ──────────────────────────────────────────────────────────────
// Deduplication
// ──────────────────────────────────────────────────────────────

/**
 * Deduplicate alerts at the same location.
 * If a traffic event and a hazard are at the same spot, keep the higher urgency one.
 */
export function deduplicateAlerts(alerts: UnifiedAlert[]): UnifiedAlert[] {
  const byKey = new Map<string, UnifiedAlert>();

  for (const a of alerts) {
    const key = a.spatial_key ?? a.id;
    const existing = byKey.get(key);
    if (!existing || a.urgency > existing.urgency) {
      byKey.set(key, a);
    }
  }

  return Array.from(byKey.values());
}

// ──────────────────────────────────────────────────────────────
// Batching
// ──────────────────────────────────────────────────────────────

/**
 * Group alerts into regional batches for voice announcements.
 * Alerts within 30km of each other are batched together.
 *
 * @param alerts       Deduplicated, staleness-adjusted alerts
 * @param currentKm    User's current position along route
 * @param batchRadius  km radius to group alerts (default 30)
 */
export function batchAlerts(
  alerts: UnifiedAlert[],
  currentKm: number,
  batchRadius: number = 30,
): AlertBatch[] {
  // Only route-positioned alerts can be batched
  const positioned = alerts
    .filter((a) => a.km_along !== null && a.km_along! > currentKm)
    .sort((a, b) => a.km_along! - b.km_along!);

  const batches: AlertBatch[] = [];
  let currentBatch: UnifiedAlert[] = [];
  let batchStart = 0;

  for (const alert of positioned) {
    const km = alert.km_along!;

    if (currentBatch.length === 0) {
      currentBatch = [alert];
      batchStart = km;
    } else if (km - batchStart <= batchRadius) {
      currentBatch.push(alert);
    } else {
      // Finalize current batch
      batches.push(finalizeBatch(currentBatch, batchStart, currentKm));
      currentBatch = [alert];
      batchStart = km;
    }
  }

  if (currentBatch.length > 0) {
    batches.push(finalizeBatch(currentBatch, batchStart, currentKm));
  }

  // Sort by max urgency descending
  batches.sort((a, b) => b.max_urgency - a.max_urgency);

  return batches;
}

function finalizeBatch(
  alerts: UnifiedAlert[],
  startKm: number,
  currentKm: number,
): AlertBatch {
  const sortedAlerts = [...alerts].sort((a, b) => b.urgency - a.urgency);
  const maxUrgency = sortedAlerts[0]?.urgency ?? 0;
  const endKm = Math.max(...alerts.map((a) => a.km_along ?? startKm));
  const kmAhead = Math.round(startKm - currentKm);

  // Build voice summary: combine top 3 alert titles
  const topTitles = sortedAlerts.slice(0, 3).map((a) => a.title);
  const voiceSummary = topTitles.length > 1
    ? `In ${kmAhead}km: ${topTitles.join(", ")}`
    : topTitles.length === 1
      ? `In ${kmAhead}km: ${topTitles[0]}`
      : null;

  return {
    region: kmAhead <= 5 ? "Ahead" : `In ${kmAhead}km`,
    from_km: startKm,
    to_km: endKm,
    alerts: sortedAlerts,
    max_urgency: maxUrgency,
    voice_summary: voiceSummary,
  };
}

// ──────────────────────────────────────────────────────────────
// Top-level: compute the attention-sorted alert list
// ──────────────────────────────────────────────────────────────

/**
 * Full pipeline: normalize → deduplicate → suppress stale → sort.
 * Returns the top N most important alerts to show right now.
 */
export function prioritizeAlerts(
  alerts: UnifiedAlert[],
  maxAlerts: number = 10,
): UnifiedAlert[] {
  // Deduplicate spatially
  const deduped = deduplicateAlerts(alerts);

  // Adjust for staleness
  const adjusted = deduped.map((a) => ({
    ...a,
    urgency: adjustForStaleness(a),
  }));

  // Filter out suppressed (urgency dropped to 0)
  const active = adjusted.filter((a) => a.urgency > 0.5);

  // Sort by urgency
  active.sort((a, b) => b.urgency - a.urgency);

  return active.slice(0, maxAlerts);
}
