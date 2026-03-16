// src/lib/peer/filterRelevantData.ts
// ──────────────────────────────────────────────────────────────
// Route-relevance filter for peer data exchange.
//
// Given the SENDER's cached overlay data and the RECEIVER's
// route geometry, filters to only items within X km of the
// receiver's route. This ensures we only transmit data the
// receiver will actually use.
// ──────────────────────────────────────────────────────────────

import { decodePolyline6 } from "@/lib/nav/polyline6";
import { cumulativeKm, buildPolylineIndex, snapToPolylineIndexed } from "@/lib/nav/snapToRoute";
import { getPack } from "@/lib/offline/packsStore";
import { getCurrentPlanId } from "@/lib/offline/plansStore";
import { packFacilities, type EncodableItem } from "./roamCodec";

import type { TrafficOverlay, HazardOverlay } from "@/lib/types/navigation";
import type {
  WeatherOverlay,
  FloodOverlay,
  CoverageOverlay,
  WildlifeOverlay,
  FuelOverlay,
  BushfireOverlay,
  SpeedCamerasOverlay,
  RestAreaOverlay,
  RoadkillOverlay,
} from "@/lib/types/overlays";
import type { PolylineIndex } from "@/lib/nav/snapToRoute";

/** Max distance from receiver's route to include an item (meters) */
const RELEVANCE_THRESHOLD_M = 15_000; // 15km

/** Check if a point is relevant to a polyline index */
function isRelevant(
  lat: number, lng: number,
  index: PolylineIndex,
): boolean {
  const snap = snapToPolylineIndexed({ lat, lng }, index);
  return snap.distance_m <= RELEVANCE_THRESHOLD_M;
}

/**
 * Collect ALL relevant overlay data from the sender's IDB cache,
 * filtered to only items within 15km of the receiver's route.
 *
 * @param receiverGeometry polyline6 of the receiver's active route
 * @returns array of EncodableItems ready for the binary codec
 */
export async function collectRelevantData(
  receiverGeometry: string,
): Promise<EncodableItem[]> {
  // Build spatial index for the receiver's route
  const decoded = decodePolyline6(receiverGeometry);
  const cumKm = cumulativeKm(decoded);
  const index = buildPolylineIndex(decoded, cumKm);

  // Get sender's current plan ID
  const planId = await getCurrentPlanId();
  if (!planId) return [];

  // Load all overlay packs concurrently
  const [
    traffic, hazards, weather, flood, coverage,
    wildlife, fuel, bushfire, cameras, restAreas, roadkill,
  ] = await Promise.all([
    getPack<TrafficOverlay>(planId, "traffic"),
    getPack<HazardOverlay>(planId, "hazards"),
    getPack<WeatherOverlay>(planId, "weather"),
    getPack<FloodOverlay>(planId, "flood"),
    getPack<CoverageOverlay>(planId, "coverage"),
    getPack<WildlifeOverlay>(planId, "wildlife"),
    getPack<FuelOverlay>(planId, "fuel"),
    getPack<BushfireOverlay>(planId, "bushfire"),
    getPack<SpeedCamerasOverlay>(planId, "speed_cameras"),
    getPack<RestAreaOverlay>(planId, "rest_areas"),
    getPack<RoadkillOverlay>(planId, "roadkill"),
  ]);

  const items: EncodableItem[] = [];
  const now = new Date().toISOString();

  // ── Traffic events ─────────────────────────────────────────
  if (traffic?.items) {
    for (const ev of traffic.items) {
      // Traffic events may have geometry but not always a single lat/lng.
      // Use bbox center as approximation.
      let lat: number | undefined;
      let lng: number | undefined;

      if (ev.geometry?.type === "Point" && Array.isArray(ev.geometry.coordinates)) {
        lng = ev.geometry.coordinates[0] as number;
        lat = ev.geometry.coordinates[1] as number;
      } else if (ev.bbox && ev.bbox.length >= 4) {
        lng = (ev.bbox[0] + ev.bbox[2]) / 2;
        lat = (ev.bbox[1] + ev.bbox[3]) / 2;
      }

      if (lat != null && lng != null && isRelevant(lat, lng, index)) {
        items.push({
          _type: "traffic",
          type: ev.type ?? "unknown",
          severity: ev.severity ?? "unknown",
          lat, lng,
          headline: ev.headline ?? "",
          region: (ev as Record<string, unknown>).region as string ?? null,
          timestamp: ev.last_updated ?? traffic.created_at ?? now,
        });
      }
    }
  }

  // ── Hazard events ──────────────────────────────────────────
  if (hazards?.items) {
    for (const ev of hazards.items) {
      let lat: number | undefined;
      let lng: number | undefined;

      if (ev.geometry?.type === "Point" && Array.isArray(ev.geometry.coordinates)) {
        lng = ev.geometry.coordinates[0] as number;
        lat = ev.geometry.coordinates[1] as number;
      } else if (ev.bbox && ev.bbox.length >= 4) {
        lng = (ev.bbox[0] + ev.bbox[2]) / 2;
        lat = (ev.bbox[1] + ev.bbox[3]) / 2;
      }

      if (lat != null && lng != null && isRelevant(lat, lng, index)) {
        items.push({
          _type: "hazard",
          kind: ev.kind ?? "unknown",
          severity: ev.severity ?? "unknown",
          urgency: ev.urgency ?? "unknown",
          certainty: ev.certainty ?? "unknown",
          priority: ev.effective_priority ?? 0,
          lat, lng,
          title: ev.title ?? "",
          region: (ev as Record<string, unknown>).region as string ?? null,
          timestamp: ev.issued_at ?? hazards.created_at ?? now,
        });
      }
    }
  }

  // ── Weather points ─────────────────────────────────────────
  if (weather?.points) {
    // Sample every 3rd point to keep payload reasonable
    for (let i = 0; i < weather.points.length; i += 3) {
      const wp = weather.points[i];
      if (isRelevant(wp.lat, wp.lng, index)) {
        items.push({
          _type: "weather",
          lat: wp.lat,
          lng: wp.lng,
          temp_c: wp.temperature_c,
          wind_kmh: wp.wind_speed_kmh,
          precip_pct: wp.precipitation_probability_pct,
          weather_code: wp.weather_code,
          uv: wp.uv_index,
          is_twilight_danger: wp.is_twilight_danger,
        });
      }
    }
  }

  // ── Flood gauges ───────────────────────────────────────────
  if (flood?.gauges) {
    for (const g of flood.gauges) {
      if (isRelevant(g.lat, g.lng, index)) {
        items.push({
          _type: "flood_gauge",
          lat: g.lat, lng: g.lng,
          height_m: g.latest_height_m ?? 0,
          trend: g.trend ?? "unknown",
          severity: g.severity ?? "unknown",
          timestamp: g.reading_time_iso ?? now,
        });
      }
    }
  }

  // ── Mobile coverage points ─────────────────────────────────
  if (coverage?.points) {
    // Sample every 5th point
    for (let i = 0; i < coverage.points.length; i += 5) {
      const cp = coverage.points[i];
      if (isRelevant(cp.lat, cp.lng, index)) {
        items.push({
          _type: "coverage",
          lat: cp.lat, lng: cp.lng,
          telstra: cp.telstra,
          optus: cp.optus,
          vodafone: cp.vodafone,
        });
      }
    }
  }

  // ── Wildlife zones ─────────────────────────────────────────
  if (wildlife?.zones) {
    for (const z of wildlife.zones) {
      if (isRelevant(z.lat, z.lng, index)) {
        items.push({
          _type: "wildlife",
          lat: z.lat, lng: z.lng,
          risk: z.risk_level,
          species_count: z.occurrence_count,
          is_twilight: z.is_twilight_risk,
        });
      }
    }
  }

  // ── Fuel stations ──────────────────────────────────────────
  if (fuel?.stations) {
    for (const s of fuel.stations) {
      if (isRelevant(s.lat, s.lng, index)) {
        // Send the cheapest/most useful fuel price
        const diesel = s.fuel_types?.find((f) => f.fuel_type.toLowerCase().includes("diesel"));
        const unleaded = s.fuel_types?.find((f) =>
          f.fuel_type.toLowerCase().includes("unleaded") || f.fuel_type === "E10");
        const best = diesel ?? unleaded ?? s.fuel_types?.[0];
        if (best) {
          items.push({
            _type: "fuel_price",
            lat: s.lat, lng: s.lng,
            name: s.name ?? "",
            fuel_type: best.fuel_type,
            price_cents: best.price_cents,
            timestamp: best.last_updated ?? fuel.created_at ?? now,
          });
        }
      }
    }
  }

  // ── Bushfire incidents ─────────────────────────────────────
  if (bushfire?.incidents) {
    for (const b of bushfire.incidents) {
      if (isRelevant(b.lat, b.lng, index)) {
        items.push({
          _type: "bushfire",
          lat: b.lat, lng: b.lng,
          alert_level: b.alert_level ?? "unknown",
          size_ha: b.size_ha ?? 0,
          timestamp: b.pub_date ?? now,
        });
      }
    }
  }

  // ── Speed cameras / black spots ────────────────────────────
  if (cameras?.cameras) {
    for (const c of cameras.cameras) {
      if (isRelevant(c.lat, c.lng, index)) {
        const camTypeMap: Record<string, number> = {
          "fixed_speed": 0, "red_light_speed": 1, "school_zone": 2,
        };
        items.push({
          _type: "road_camera",
          lat: c.lat, lng: c.lng,
          camera_type: camTypeMap[c.camera_type] ?? 0,
          is_school_zone: c.is_school_zone,
        });
      }
    }
  }

  // ── Rest areas ─────────────────────────────────────────────
  if (restAreas?.rest_areas) {
    for (const ra of restAreas.rest_areas) {
      if (isRelevant(ra.lat, ra.lng, index)) {
        items.push({
          _type: "rest_area",
          lat: ra.lat, lng: ra.lng,
          quality: ra.quality_score,
          facilities_bits: packFacilities(ra.facilities ?? {}),
          has_water: ra.facilities?.drinking_water ?? false,
        });
      }
    }
  }

  return items;
}

/**
 * Get the current user's route geometry from IDB.
 * Returns null if no active plan or no geometry.
 */
export async function getMyRouteGeometry(): Promise<string | null> {
  const { getOfflinePlan } = await import("@/lib/offline/plansStore");
  const planId = await getCurrentPlanId();
  if (!planId) return null;
  const plan = await getOfflinePlan(planId);
  return plan?.preview?.geometry ?? null;
}
