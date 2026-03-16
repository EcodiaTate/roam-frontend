// src/lib/places/categoryMeta.ts
// Single source of truth for category → icon and category → color mappings.
// Consumed by PlaceSearchPanel, TripSuggestionsPanel, GuideView, PlaceDetailSheet.

import type { LucideIcon } from "lucide-react";
import {
  Fuel,
  Zap,
  ParkingMeter,
  Bath,
  Droplets,
  Trash2,
  Wrench,
  Hospital,
  Pill,
  ShoppingCart,
  Building2,
  Banknote,
  Shirt,
  Star,
  Coffee,
  Utensils,
  Beer,
  Wine,
  Tent,
  Bed,
  Eye,
  Waves,
  Mountain,
  TreePine,
  Thermometer,
  Baby,
  Compass,
  Info,
  Landmark,
  Camera,
  Store,
  Dog,
  Film,
  Fish,
  BookOpen,
  Flag,
  ShowerHead,
  MapPin,
  Layers,
} from "lucide-react";

// ──────────────────────────────────────────────────────────────
// Icon mapping
// ──────────────────────────────────────────────────────────────

/** category key → lucide icon. Use `getCategoryIcon` for safe lookup. */
export const CATEGORY_ICON: Record<string, LucideIcon> = {
  all: Layers,
  fuel: Fuel,
  ev_charging: Zap,
  rest_area: ParkingMeter,
  toilet: Bath,
  water: Droplets,
  dump_point: Trash2,
  shower: ShowerHead,
  mechanic: Wrench,
  hospital: Hospital,
  pharmacy: Pill,
  bakery: Star,
  cafe: Coffee,
  restaurant: Utensils,
  fast_food: Utensils,
  pub: Beer,
  bar: Beer,
  camp: Tent,
  motel: Bed,
  hotel: Bed,
  hostel: Bed,
  viewpoint: Eye,
  waterfall: Waves,
  swimming_hole: Waves,
  beach: Waves,
  national_park: TreePine,
  hiking: Mountain,
  picnic: TreePine,
  hot_spring: Thermometer,
  cave: Mountain,
  fishing: Fish,
  surf: Waves,
  playground: Baby,
  pool: Waves,
  zoo: Compass,
  theme_park: Star,
  dog_park: Dog,
  golf: Flag,
  cinema: Film,
  visitor_info: Info,
  museum: Landmark,
  gallery: Landmark,
  heritage: Landmark,
  winery: Wine,
  brewery: Beer,
  attraction: Camera,
  market: Store,
  park: TreePine,
  library: BookOpen,
  showground: Flag,
  grocery: ShoppingCart,
  town: Building2,
  atm: Banknote,
  laundromat: Shirt,
};

/** Safe icon lookup with MapPin fallback. */
export function getCategoryIcon(category: string): LucideIcon {
  return CATEGORY_ICON[category] ?? MapPin;
}

// ──────────────────────────────────────────────────────────────
// Color system
// ──────────────────────────────────────────────────────────────

export type CategoryColorDef = { bg: string; fg: string; accent: string; soft: string };

export const CAT_COLORS: Record<string, CategoryColorDef> = {
  // Safety - amber/warm
  fuel:         { bg: "rgba(245,158,11,0.10)", fg: "#d97706", accent: "#f59e0b", soft: "rgba(245,158,11,0.06)" },
  ev_charging:  { bg: "rgba(16,185,129,0.10)", fg: "#059669", accent: "#10b981", soft: "rgba(16,185,129,0.06)" },
  rest_area:    { bg: "rgba(245,158,11,0.10)", fg: "#d97706", accent: "#f59e0b", soft: "rgba(245,158,11,0.06)" },
  toilet:       { bg: "rgba(100,116,139,0.10)", fg: "#64748b", accent: "#94a3b8", soft: "rgba(100,116,139,0.06)" },
  water:        { bg: "rgba(59,130,246,0.10)",  fg: "#2563eb", accent: "#3b82f6", soft: "rgba(59,130,246,0.06)" },
  dump_point:   { bg: "rgba(120,113,108,0.10)", fg: "#57534e", accent: "#78716c", soft: "rgba(120,113,108,0.06)" },
  shower:       { bg: "rgba(6,182,212,0.10)",   fg: "#0891b2", accent: "#06b6d4", soft: "rgba(6,182,212,0.06)" },
  mechanic:     { bg: "rgba(245,158,11,0.10)", fg: "#d97706", accent: "#f59e0b", soft: "rgba(245,158,11,0.06)" },
  hospital:     { bg: "rgba(239,68,68,0.10)",  fg: "#dc2626", accent: "#ef4444", soft: "rgba(239,68,68,0.06)" },
  pharmacy:     { bg: "rgba(239,68,68,0.10)",  fg: "#dc2626", accent: "#ef4444", soft: "rgba(239,68,68,0.06)" },
  // Food - warm orange
  bakery:       { bg: "rgba(249,115,22,0.10)", fg: "#ea580c", accent: "#f97316", soft: "rgba(249,115,22,0.06)" },
  cafe:         { bg: "rgba(180,83,9,0.12)",   fg: "#92400e", accent: "#b45309", soft: "rgba(180,83,9,0.06)" },
  restaurant:   { bg: "rgba(249,115,22,0.10)", fg: "#ea580c", accent: "#f97316", soft: "rgba(249,115,22,0.06)" },
  fast_food:    { bg: "rgba(249,115,22,0.10)", fg: "#ea580c", accent: "#f97316", soft: "rgba(249,115,22,0.06)" },
  pub:          { bg: "rgba(180,83,9,0.12)",   fg: "#92400e", accent: "#b45309", soft: "rgba(180,83,9,0.06)" },
  bar:          { bg: "rgba(180,83,9,0.12)",   fg: "#92400e", accent: "#b45309", soft: "rgba(180,83,9,0.06)" },
  // Sleep - purple
  camp:         { bg: "rgba(139,92,246,0.10)", fg: "#7c3aed", accent: "#8b5cf6", soft: "rgba(139,92,246,0.06)" },
  motel:        { bg: "rgba(139,92,246,0.10)", fg: "#7c3aed", accent: "#8b5cf6", soft: "rgba(139,92,246,0.06)" },
  hotel:        { bg: "rgba(139,92,246,0.10)", fg: "#7c3aed", accent: "#8b5cf6", soft: "rgba(139,92,246,0.06)" },
  hostel:       { bg: "rgba(139,92,246,0.10)", fg: "#7c3aed", accent: "#8b5cf6", soft: "rgba(139,92,246,0.06)" },
  // Nature - emerald
  viewpoint:    { bg: "rgba(16,185,129,0.10)", fg: "#059669", accent: "#10b981", soft: "rgba(16,185,129,0.06)" },
  waterfall:    { bg: "rgba(6,182,212,0.10)",  fg: "#0891b2", accent: "#06b6d4", soft: "rgba(6,182,212,0.06)" },
  swimming_hole:{ bg: "rgba(6,182,212,0.10)",  fg: "#0891b2", accent: "#06b6d4", soft: "rgba(6,182,212,0.06)" },
  beach:        { bg: "rgba(6,182,212,0.10)",  fg: "#0891b2", accent: "#06b6d4", soft: "rgba(6,182,212,0.06)" },
  national_park:{ bg: "rgba(16,185,129,0.10)", fg: "#059669", accent: "#10b981", soft: "rgba(16,185,129,0.06)" },
  hiking:       { bg: "rgba(16,185,129,0.10)", fg: "#059669", accent: "#10b981", soft: "rgba(16,185,129,0.06)" },
  picnic:       { bg: "rgba(16,185,129,0.10)", fg: "#059669", accent: "#10b981", soft: "rgba(16,185,129,0.06)" },
  hot_spring:   { bg: "rgba(249,115,22,0.10)", fg: "#ea580c", accent: "#f97316", soft: "rgba(249,115,22,0.06)" },
  cave:         { bg: "rgba(100,116,139,0.10)", fg: "#475569", accent: "#64748b", soft: "rgba(100,116,139,0.06)" },
  fishing:      { bg: "rgba(6,182,212,0.10)",  fg: "#0891b2", accent: "#06b6d4", soft: "rgba(6,182,212,0.06)" },
  surf:         { bg: "rgba(6,182,212,0.10)",  fg: "#0891b2", accent: "#06b6d4", soft: "rgba(6,182,212,0.06)" },
  // Family - pink
  playground:   { bg: "rgba(236,72,153,0.10)", fg: "#db2777", accent: "#ec4899", soft: "rgba(236,72,153,0.06)" },
  pool:         { bg: "rgba(6,182,212,0.10)",  fg: "#0891b2", accent: "#06b6d4", soft: "rgba(6,182,212,0.06)" },
  zoo:          { bg: "rgba(236,72,153,0.10)", fg: "#db2777", accent: "#ec4899", soft: "rgba(236,72,153,0.06)" },
  theme_park:   { bg: "rgba(236,72,153,0.10)", fg: "#db2777", accent: "#ec4899", soft: "rgba(236,72,153,0.06)" },
  dog_park:     { bg: "rgba(236,72,153,0.10)", fg: "#db2777", accent: "#ec4899", soft: "rgba(236,72,153,0.06)" },
  golf:         { bg: "rgba(16,185,129,0.10)", fg: "#059669", accent: "#10b981", soft: "rgba(16,185,129,0.06)" },
  cinema:       { bg: "rgba(99,102,241,0.10)", fg: "#4f46e5", accent: "#6366f1", soft: "rgba(99,102,241,0.06)" },
  // Culture - indigo
  visitor_info: { bg: "rgba(99,102,241,0.10)", fg: "#4f46e5", accent: "#6366f1", soft: "rgba(99,102,241,0.06)" },
  museum:       { bg: "rgba(99,102,241,0.10)", fg: "#4f46e5", accent: "#6366f1", soft: "rgba(99,102,241,0.06)" },
  gallery:      { bg: "rgba(99,102,241,0.10)", fg: "#4f46e5", accent: "#6366f1", soft: "rgba(99,102,241,0.06)" },
  heritage:     { bg: "rgba(99,102,241,0.10)", fg: "#4f46e5", accent: "#6366f1", soft: "rgba(99,102,241,0.06)" },
  winery:       { bg: "rgba(168,85,247,0.10)", fg: "#9333ea", accent: "#a855f7", soft: "rgba(168,85,247,0.06)" },
  brewery:      { bg: "rgba(180,83,9,0.12)",   fg: "#92400e", accent: "#b45309", soft: "rgba(180,83,9,0.06)" },
  attraction:   { bg: "rgba(99,102,241,0.10)", fg: "#4f46e5", accent: "#6366f1", soft: "rgba(99,102,241,0.06)" },
  market:       { bg: "rgba(249,115,22,0.10)", fg: "#ea580c", accent: "#f97316", soft: "rgba(249,115,22,0.06)" },
  park:         { bg: "rgba(16,185,129,0.10)", fg: "#059669", accent: "#10b981", soft: "rgba(16,185,129,0.06)" },
  library:      { bg: "rgba(99,102,241,0.10)", fg: "#4f46e5", accent: "#6366f1", soft: "rgba(99,102,241,0.06)" },
  showground:   { bg: "rgba(249,115,22,0.10)", fg: "#ea580c", accent: "#f97316", soft: "rgba(249,115,22,0.06)" },
  // Supplies - slate
  grocery:      { bg: "rgba(100,116,139,0.10)", fg: "#475569", accent: "#64748b", soft: "rgba(100,116,139,0.06)" },
  town:         { bg: "rgba(100,116,139,0.10)", fg: "#475569", accent: "#64748b", soft: "rgba(100,116,139,0.06)" },
  atm:          { bg: "rgba(100,116,139,0.10)", fg: "#475569", accent: "#64748b", soft: "rgba(100,116,139,0.06)" },
  laundromat:   { bg: "rgba(100,116,139,0.10)", fg: "#475569", accent: "#64748b", soft: "rgba(100,116,139,0.06)" },
};

const DEFAULT_COLOR: CategoryColorDef = { bg: "rgba(100,116,139,0.10)", fg: "#64748b", accent: "#94a3b8", soft: "rgba(100,116,139,0.06)" };

/** Safe color lookup with default fallback. */
export function getCategoryColor(category: string): CategoryColorDef {
  return CAT_COLORS[category] ?? DEFAULT_COLOR;
}
