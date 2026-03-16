// src/lib/nav/geo.ts
//
// Small shared geo helpers that don't belong in heavier modules.

/** Convert heading degrees to cardinal direction string (N, NE, E, ...) */
export function cardinalDir(deg: number): string {
  const dirs = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
  return dirs[Math.round(((deg % 360) + 360) % 360 / 45) % 8];
}
