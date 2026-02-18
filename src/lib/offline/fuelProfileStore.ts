// src/lib/offline/fuelProfileStore.ts
// ──────────────────────────────────────────────────────────────
// Vehicle Fuel Profile — IDB meta store helpers
//
// Stores/retrieves the user's vehicle fuel profile from the
// IDB "meta" store. One profile applies to all plans.
// ──────────────────────────────────────────────────────────────
"use client";

import { idbGet, idbPut, idbStores } from "./idb";
import { DEFAULT_FUEL_PROFILE, type VehicleFuelProfile } from "@/lib/types/fuel";

const META_KEY = "vehicle_fuel_profile";

/**
 * Get the user's saved vehicle fuel profile, or the default if none is set.
 */
export async function getVehicleFuelProfile(): Promise<VehicleFuelProfile> {
  try {
    const stored = await idbGet<VehicleFuelProfile>(idbStores.meta, META_KEY);
    if (stored && typeof stored.tank_range_km === "number") {
      // Merge with defaults to pick up any new fields added in future versions
      return { ...DEFAULT_FUEL_PROFILE, ...stored };
    }
  } catch {
    // IDB failure — return default
  }
  return { ...DEFAULT_FUEL_PROFILE };
}

/**
 * Save the user's vehicle fuel profile to IDB.
 */
export async function setVehicleFuelProfile(profile: VehicleFuelProfile): Promise<void> {
  // Validate bounds
  const validated: VehicleFuelProfile = {
    tank_range_km: clamp(profile.tank_range_km, 50, 3000),
    reserve_warn_km: clamp(profile.reserve_warn_km, 20, 500),
    reserve_critical_km: clamp(profile.reserve_critical_km, 10, 300),
    fuel_type: profile.fuel_type ?? "unleaded",
  };

  // Ensure critical < warn < range
  if (validated.reserve_critical_km >= validated.reserve_warn_km) {
    validated.reserve_critical_km = Math.max(10, validated.reserve_warn_km - 10);
  }
  if (validated.reserve_warn_km >= validated.tank_range_km) {
    validated.reserve_warn_km = Math.max(20, validated.tank_range_km - 50);
  }

  await idbPut(idbStores.meta, validated, META_KEY);
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}