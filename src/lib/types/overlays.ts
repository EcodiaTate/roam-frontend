// src/lib/types/overlays.ts
// Frontend type mirrors of backend contracts.py overlay models.
// Shapes match the backend exactly — do not add fields not in contracts.py.

// ──────────────────────────────────────────────────────────────
// Weather overlay
// ──────────────────────────────────────────────────────────────

export type WeatherPoint = {
  lat: number;
  lng: number;
  km_along: number;
  eta_iso: string;
  temperature_c: number;
  apparent_temperature_c: number;
  precipitation_probability_pct: number;
  precipitation_mm: number;
  weather_code: number;
  weather_description: string;
  wind_speed_kmh: number;
  wind_gust_kmh?: number | null;
  wind_direction_deg: number;
  uv_index: number;
  cloud_cover_pct: number;
  visibility_m?: number | null;
  sunrise_iso?: string | null;
  sunset_iso?: string | null;
  civil_twilight_begin_iso?: string | null;
  civil_twilight_end_iso?: string | null;
  is_daylight: boolean;
  is_twilight_danger: boolean;
};

export type WeatherOverlay = {
  weather_key: string;
  polyline6: string;
  departure_iso: string;
  algo_version: string;
  created_at: string;
  points: WeatherPoint[];
  warnings: string[];
};

// ──────────────────────────────────────────────────────────────
// Flood gauge overlay
// ──────────────────────────────────────────────────────────────

export type FloodGauge = {
  station_no: string;
  station_name: string;
  lat: number;
  lng: number;
  data_owner: string;
  latest_height_m?: number | null;
  reading_time_iso?: string | null;
  trend: "rising" | "falling" | "steady" | "unknown";
  severity: "normal" | "minor" | "moderate" | "major" | "unknown";
  distance_from_route_km?: number | null;
};

export type FloodCatchment = {
  aac: string;
  dist_name: string;
  level: "watch" | "warning";
  geometry: {
    type: "Polygon" | "MultiPolygon";
    coordinates: number[][][];
  };
};

export type FloodCamera = {
  id: string;
  source: string;
  name?: string | null;
  lat: number;
  lng: number;
  image_url?: string | null;
  road?: string | null;
  distance_from_route_km?: number | null;
};

export type FloodOverlay = {
  flood_key: string;
  bbox: import("./geo").BBox4;
  algo_version: string;
  created_at: string;
  gauges: FloodGauge[];
  catchments: FloodCatchment[];
  flood_cameras: FloodCamera[];
  route_passes_through_warning: boolean;
  attributions: string[];
  warnings: string[];
};

// ──────────────────────────────────────────────────────────────
// Rest areas + fatigue management overlay
// ──────────────────────────────────────────────────────────────

export type RestFacilities = {
  toilets?: boolean | null;
  drinking_water?: boolean | null;
  shower?: boolean | null;
  bbq?: boolean | null;
  picnic_table?: boolean | null;
  power_supply?: boolean | null;
  internet?: boolean | null;
  lit?: boolean | null;
  shelter?: boolean | null;
  capacity?: number | null;
};

export type RestArea = {
  id: string;
  name?: string | null;
  lat: number;
  lng: number;
  type: "rest_area" | "camp_site" | "caravan_site" | "service_station" | "toilets";
  km_along?: number | null;
  distance_from_route_km?: number | null;
  quality_score: number;
  facilities: RestFacilities;
  opening_hours?: string | null;
  fee?: boolean | null;
  source: string;
};

export type FatigueWarning = {
  type: "long_gap" | "suggested_rest";
  message: string;
  km_from: number;
  km_to?: number | null;
  gap_km?: number | null;
  suggested_stop?: RestArea | null;
};

export type RestAreaOverlay = {
  rest_key: string;
  polyline6: string;
  algo_version: string;
  created_at: string;
  rest_areas: RestArea[];
  fatigue_warnings: FatigueWarning[];
  warnings: string[];
};

// ──────────────────────────────────────────────────────────────
// Mobile coverage overlay
// ──────────────────────────────────────────────────────────────

export type CoverageLevel = "reliable_4g" | "voice_only" | "weak" | "no_coverage";

export type CoveragePoint = {
  lat: number;
  lng: number;
  km_along: number;
  telstra: CoverageLevel;
  optus: CoverageLevel;
  vodafone: CoverageLevel;
  best_carrier?: string | null;
  best_signal: CoverageLevel;
};

export type CoverageGap = {
  km_from: number;
  km_to: number;
  gap_km: number;
  carrier: string;
  message: string;
};

export type CoverageOverlay = {
  coverage_key: string;
  polyline6: string;
  algo_version: string;
  created_at: string;
  points: CoveragePoint[];
  gaps: CoverageGap[];
  best_carrier_overall?: string | null;
  carrier_scores: Record<string, number>;
  warnings: string[];
};

// ──────────────────────────────────────────────────────────────
// Wildlife hazard overlay
// ──────────────────────────────────────────────────────────────

export type WildlifeZone = {
  lat: number;
  lng: number;
  km_from: number;
  km_to: number;
  risk_level: "low" | "medium" | "high" | "none";
  dominant_species: string[];
  occurrence_count: number;
  is_twilight_risk: boolean;
  message?: string | null;
  // iNaturalist observation fields
  species_guess?: string | null;
  photos?: string[];
  attribution?: string | null;
  observation_id?: number | null;
};

export type WildlifeOverlay = {
  wildlife_key: string;
  polyline6: string;
  algo_version: string;
  created_at: string;
  zones: WildlifeZone[];
  warnings: string[];
};

// ──────────────────────────────────────────────────────────────
// Fuel overlay (new bundle format — distinct from FuelAnalysis)
// ──────────────────────────────────────────────────────────────

export type FuelPrice = {
  fuel_type: string;
  price_cents: number;
  last_updated?: string | null;
};

export type FuelStationOverlay = {
  /** Backend uses `id`, bundle may remap to `place_id` */
  id?: string | null;
  place_id?: string | null;
  source?: string | null;
  name: string;
  lat: number;
  lng: number;
  brand?: string | null;
  address?: string | null;
  category?: "fuel" | "ev_charging" | null;
  km_along_route?: number | null;
  distance_from_route_km?: number | null;
  distance_km?: number | null;
  /** Per-station fuel prices from / NSW FuelCheck / WA FuelWatch */
  fuel_types?: FuelPrice[] | null;
  is_open?: boolean | null;
  open_hours?: string | null;
  has_diesel?: boolean | null;
  has_unleaded?: boolean | null;
  has_lpg?: boolean | null;
  city_price?: number | null; // cents per litre (legacy/fallback)
};

export type EVConnector = {
  type: string;
  power_kw?: number | null;
  quantity: number;
};

export type EVCharger = {
  id: string;
  source: string;
  name: string;
  operator?: string | null;
  lat: number;
  lng: number;
  address?: string | null;
  connectors: EVConnector[];
  is_operational?: boolean | null;
  usage_cost?: string | null;
  distance_km?: number | null;
};

export type FuelOverlay = {
  fuel_key: string;
  bbox?: import("./geo").BBox4 | null;
  algo_version: string;
  created_at: string;
  stations: FuelStationOverlay[];
  ev_chargers: EVCharger[];
  city_averages: Record<string, Record<string, number>>;
  warnings: string[];
};

// ──────────────────────────────────────────────────────────────
// Route intelligence score
// ──────────────────────────────────────────────────────────────

export type RouteScoreCategory = {
  score: number;
  label: string;
  factors: string[];
};

export type RouteIntelligenceScore = {
  overall: number;
  overall_label: string;
  summary: string;
  safety: RouteScoreCategory;
  conditions: RouteScoreCategory;
  services: RouteScoreCategory;
  weather: RouteScoreCategory;
  data_warnings: string[];
};

// ──────────────────────────────────────────────────────────────
// Emergency Services overlay (GA Emergency Management, CC-BY 4.0)
// ──────────────────────────────────────────────────────────────

export type EmergencyFacility = {
  id: string;
  name: string;
  facility_type: string; // "hospital" | "ambulance" | "police" | "fire" | "ses"
  lat: number;
  lng: number;
  address?: string | null;
  suburb?: string | null;
  postcode?: string | null;
  state?: string | null;
  distance_from_route_km?: number | null;
};

export type EmergencyServicesOverlay = {
  emergency_key: string;
  polyline6: string;
  algo_version: string;
  created_at: string;
  facilities: EmergencyFacility[];
  warnings: string[];
};

// ──────────────────────────────────────────────────────────────
// Heritage & Protected Areas overlay (DCCEEW GIS, CC-BY 3.0 AU)
// ──────────────────────────────────────────────────────────────

export type HeritageSite = {
  id: string;
  name: string;
  site_type: string; // "world_heritage" | "national_heritage" | "commonwealth_heritage" | "protected_area"
  classification?: string | null;
  state?: string | null;
  authority?: string | null;
  lat?: number | null;
  lng?: number | null;
};

export type HeritageOverlay = {
  heritage_key: string;
  polyline6: string;
  algo_version: string;
  created_at: string;
  sites: HeritageSite[];
  warnings: string[];
};

// ──────────────────────────────────────────────────────────────
// Air Quality overlay (OpenWeatherMap Air Pollution API)
// ──────────────────────────────────────────────────────────────

export type AirQualityPoint = {
  lat: number;
  lng: number;
  km_along: number;
  aqi: number; // 1-5 OWM scale
  aqi_label: string;
  pm25?: number | null;
  pm10?: number | null;
  co?: number | null;
  no2?: number | null;
  o3?: number | null;
  so2?: number | null;
};

export type AirQualityOverlay = {
  aqi_key: string;
  polyline6: string;
  algo_version: string;
  created_at: string;
  points: AirQualityPoint[];
  overall_aqi: number;
  overall_label: string;
  health_advice: string;
  warnings: string[];
};

// ──────────────────────────────────────────────────────────────
// Bushfire overlay (NSW RFS + NASA FIRMS)
// ──────────────────────────────────────────────────────────────

export type BushfireIncident = {
  id: string;
  source: string;
  title: string;
  alert_level?: string | null;
  status?: string | null;
  fire_type?: string | null;
  size_ha?: number | null;
  lat: number;
  lng: number;
  geometry?: Record<string, unknown> | null;
  distance_from_route_km?: number | null;
  pub_date?: string | null;
  council_area?: string | null;
  responsible_agency?: string | null;
};

export type FirmsHotspot = {
  lat: number;
  lng: number;
  brightness?: number | null;
  confidence?: string | null;
  acq_date?: string | null;
  acq_time?: string | null;
  frp?: number | null;
  distance_from_route_km?: number | null;
};

export type BushfireOverlay = {
  bushfire_key: string;
  polyline6: string;
  algo_version: string;
  created_at: string;
  incidents: BushfireIncident[];
  hotspots: FirmsHotspot[];
  fires_near_route: number;
  max_alert_level?: string | null;
  warnings: string[];
};

// ──────────────────────────────────────────────────────────────
// Speed Cameras overlay (NSW TfNSW + Brisbane Council, CC-BY)
// ──────────────────────────────────────────────────────────────

export type SpeedCamera = {
  id: string;
  source: string;
  camera_type: string; // "fixed_speed" | "red_light_speed" | "school_zone"
  location_desc: string;
  road?: string | null;
  suburb?: string | null;
  lat: number;
  lng: number;
  is_school_zone: boolean;
  distance_from_route_km?: number | null;
};

export type RoadOccupancy = {
  id: string;
  source: string;
  road: string;
  suburb?: string | null;
  closure_type?: string | null;
  traffic_impact?: string | null;
  start_date?: string | null;
  end_date?: string | null;
  hours?: string | null;
};

export type RoadBlackSpot = {
  id: string;
  source: string;
  road?: string | null;
  location_desc?: string | null;
  lat: number;
  lng: number;
  crash_count?: number | null;
  distance_from_route_km?: number | null;
};

export type SpeedCamerasOverlay = {
  cameras_key: string;
  polyline6: string;
  algo_version: string;
  created_at: string;
  cameras: SpeedCamera[];
  road_occupancies: RoadOccupancy[];
  black_spots: RoadBlackSpot[];
  warnings: string[];
};

// ──────────────────────────────────────────────────────────────
// Public Toilets + Dump Points overlay (Dept of Health, CC BY 3.0 AU)
// ──────────────────────────────────────────────────────────────

export type PublicToilet = {
  id: string;
  name?: string | null;
  lat: number;
  lng: number;
  address?: string | null;
  suburb?: string | null;
  state?: string | null;
  toilet_type?: string | null;
  is_accessible: boolean;
  has_baby_change: boolean;
  has_drinking_water: boolean;
  has_shower: boolean;
  is_dump_point: boolean;
  key_required: boolean;
  is_fee: boolean;
  opening_hours?: string | null;
  has_parking: boolean;
  distance_from_route_km?: number | null;
};

export type ToiletsOverlay = {
  toilets_key: string;
  polyline6: string;
  algo_version: string;
  created_at: string;
  toilets: PublicToilet[];
  dump_points: PublicToilet[];
  attribution: string;
  warnings: string[];
};

// ──────────────────────────────────────────────────────────────
// School Zones overlay (TfNSW, CC BY 3.0 AU)
// ──────────────────────────────────────────────────────────────

export type SchoolZone = {
  id: string;
  school_name?: string | null;
  lat: number;
  lng: number;
  suburb?: string | null;
  state?: string | null;
  speed_limit_active_kmh: number;
  is_currently_active: boolean;
  active_session?: string | null; // "morning" | "afternoon"
  distance_from_route_km?: number | null;
};

export type SchoolZonesOverlay = {
  school_zones_key: string;
  polyline6: string;
  algo_version: string;
  created_at: string;
  checked_at_local?: string | null;
  zones: SchoolZone[];
  active_count: number;
  attribution: string;
  warnings: string[];
};

// ──────────────────────────────────────────────────────────────
// Roadkill hotspots overlay (NSW BioNet, CC BY 3.0 AU)
// ──────────────────────────────────────────────────────────────

export type RoadkillHotspot = {
  id: string;
  lat: number;
  lng: number;
  observation_count: number;
  risk_level: string; // "low" | "medium" | "high"
  species: string[];
  distance_from_route_km?: number | null;
};

export type RoadkillOverlay = {
  roadkill_key: string;
  polyline6: string;
  algo_version: string;
  created_at: string;
  hotspots: RoadkillHotspot[];
  attribution: string;
  warnings: string[];
};

