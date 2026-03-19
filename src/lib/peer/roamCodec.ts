// src/lib/peer/roamCodec.ts
// ──────────────────────────────────────────────────────────────
// Roam Binary Codec - ultra-compact encoding for ultrasonic
// peer-to-peer data transfer between roamers.
//
// Design principle: both phones have the same "codebook" -
// the overlay type system, severity enums, predefined messages.
// We only transmit tiny numeric references, not full strings.
//
// Frame format:
//   [MAGIC:2][VERSION:1][ITEM_COUNT:2][...items][CRC8:1]
//
// Each item:
//   [TYPE:1][...type-specific payload]
//
// Coordinates: fixed-point int32 at 1e6 precision (same as polyline6)
// Timestamps: uint32 unix epoch seconds (good until 2106)
// Enums: uint8 codebook index
// ──────────────────────────────────────────────────────────────

// ── Magic + version ──────────────────────────────────────────

const MAGIC = 0x524d; // "RM" for RoaM
const VERSION = 1;

// ── Item type IDs ────────────────────────────────────────────

export const ItemType = {
  OBSERVATION: 0x01,
  TRAFFIC: 0x02,
  HAZARD: 0x03,
  FUEL_PRICE: 0x04,
  WEATHER: 0x05,
  FLOOD_GAUGE: 0x06,
  WILDLIFE: 0x07,
  BUSHFIRE: 0x08,
  ROAD_CAMERA: 0x09,
  COVERAGE: 0x0a,
  REST_AREA: 0x0b,
} as const;

// ── Codebook tables ──────────────────────────────────────────
// Each enum maps string→uint8. Both sender and receiver have
// identical tables, so we transmit the index, not the string.

export const CB_OBS_TYPE = [
  "road_condition", "road_closure", "hazard", "fuel_price",
  "speed_trap", "weather", "campsite", "general",
] as const;

export const CB_OBS_SEVERITY = [
  "info", "caution", "warning", "danger",
] as const;

export const CB_TRAFFIC_TYPE = [
  "hazard", "closure", "congestion", "roadworks",
  "flooding", "incident", "unknown",
] as const;

export const CB_TRAFFIC_SEVERITY = [
  "info", "minor", "moderate", "major", "unknown",
] as const;

export const CB_HAZARD_KIND = [
  "flood", "cyclone", "storm", "fire", "wind", "heat",
  "marine", "weather_warning", "road_crash", "road_closure", "unknown",
] as const;

export const CB_HAZARD_SEVERITY = [
  "low", "medium", "high", "unknown",
] as const;

export const CB_URGENCY = [
  "immediate", "expected", "future", "past", "unknown",
] as const;

export const CB_CERTAINTY = [
  "observed", "likely", "possible", "unlikely", "unknown",
] as const;

export const CB_COVERAGE = [
  "reliable_4g", "voice_only", "weak", "no_coverage",
] as const;

export const CB_WILDLIFE_RISK = [
  "low", "medium", "high", "none",
] as const;

export const CB_FLOOD_TREND = [
  "rising", "falling", "steady", "unknown",
] as const;

export const CB_FLOOD_SEVERITY = [
  "normal", "minor", "moderate", "major", "unknown",
] as const;

export const CB_BUSHFIRE_ALERT = [
  "advice", "watch_and_act", "emergency", "not_applicable", "unknown",
] as const;

export const CB_REGION = [
  "qld", "nsw", "vic", "sa", "wa", "nt", "tas", "act", "unknown",
] as const;

// Predefined short messages (top ~64 common outback reports)
// Index 0 = no message (null). Up to 63 predefined + 0.
export const CB_MESSAGES = [
  "", // 0 = no message
  "Road closed ahead",
  "Bridge out",
  "Flooded road",
  "Road washed out",
  "Corrugated road",
  "Deep potholes",
  "Gravel road starts",
  "Sealed road resumes",
  "Fallen tree on road",
  "Animal on road",
  "Debris on road",
  "Landslide",
  "Road narrows",
  "Single lane only",
  "Rough 4WD track",
  "Soft sand",
  "Bull dust holes",
  "Creek crossing - passable",
  "Creek crossing - impassable",
  "Gate locked",
  "Roadworks - delays expected",
  "Roadworks - minor delays",
  "Speed camera ahead",
  "Police speed check",
  "Heavy fog",
  "Dust storm",
  "Black ice",
  "Heavy rain",
  "Strong crosswinds",
  "Smoke haze - poor visibility",
  "Hail",
  "Flash flooding possible",
  "Camp spot - good condition",
  "Camp spot - water available",
  "Camp spot - no water",
  "Camp spot - full/busy",
  "Fuel available",
  "Fuel - diesel only",
  "Fuel - expensive",
  "Fuel - station closed",
  "No fuel available for 200km+",
  "Rest area - clean",
  "Rest area - avoid",
  "Mobile reception here",
  "No mobile reception for 100km+",
  "Wildlife on road - kangaroos",
  "Wildlife on road - cattle",
  "Wildlife on road - emus",
  "Wildlife on road - wombats",
  "Road condition improved",
  "Track condition worse than mapped",
  "GPS route wrong here",
  "Scenic detour worth it",
  "Free camping available",
  "Water refill available",
  "Dump point available",
  "Showers available",
  "Great bakery stop",
  "Good pub meal",
  "Mechanic available",
  "Tyre repair available",
  "Fire nearby - take care",
  "All clear - road fine",
] as const;

// Road condition values (for OBSERVATION type=road_condition)
export const CB_ROAD_CONDITION = [
  "", "corrugated", "pothole", "washed_out", "flooded",
  "smooth", "gravel", "sand", "mud", "ice",
  "debris", "narrow", "rough_4wd", "bull_dust",
] as const;

// ── Coordinate encoding ──────────────────────────────────────

function encodeCoord(deg: number): number {
  return Math.round(deg * 1e6);
}
function decodeCoord(fixed: number): number {
  return fixed / 1e6;
}

// ── Timestamp encoding ───────────────────────────────────────

function encodeTimestamp(iso: string): number {
  return Math.floor(new Date(iso).getTime() / 1000);
}
function decodeTimestamp(epoch: number): string {
  return new Date(epoch * 1000).toISOString();
}

// ── Codebook lookup ──────────────────────────────────────────

function cbIndex(table: readonly string[], value: string): number {
  const idx = table.indexOf(value);
  return idx >= 0 ? idx : table.length - 1; // fallback to last (usually "unknown")
}
function cbValue<T extends readonly string[]>(table: T, idx: number): T[number] {
  return idx < table.length ? table[idx] : table[table.length - 1];
}

// ── Binary writer/reader ─────────────────────────────────────

class BinaryWriter {
  private buf: number[] = [];

  u8(v: number) { this.buf.push(v & 0xff); }
  u16(v: number) { this.buf.push((v >> 8) & 0xff, v & 0xff); }
  i32(v: number) {
    this.buf.push((v >> 24) & 0xff, (v >> 16) & 0xff, (v >> 8) & 0xff, v & 0xff);
  }
  u32(v: number) { this.i32(v); }

  /** Write a predefined message index (0 = none, 1-63 = predefined, 64+ = custom truncated) */
  message(text: string | null | undefined) {
    if (!text) { this.u8(0); return; }
    const idx = (CB_MESSAGES as readonly string[]).indexOf(text);
    if (idx >= 0) {
      this.u8(idx);
    } else {
      // Custom message: marker 0xFF + length-prefixed UTF8 (max 120 chars)
      this.u8(0xff);
      const truncated = text.slice(0, 120);
      const encoded = new TextEncoder().encode(truncated);
      this.u8(Math.min(encoded.length, 250));
      for (let i = 0; i < Math.min(encoded.length, 250); i++) {
        this.u8(encoded[i]);
      }
    }
  }

  /** Write a fuel price in 0.1 cent increments (uint16, max 6553.5 c/L) */
  fuelPrice(cents: number | null | undefined) {
    if (cents == null) { this.u16(0xffff); return; }
    this.u16(Math.round(cents * 10));
  }

  toUint8Array(): Uint8Array {
    return new Uint8Array(this.buf);
  }
}

class BinaryReader {
  private view: DataView;
  private pos = 0;

  constructor(data: Uint8Array) {
    this.view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  }

  get remaining() { return this.view.byteLength - this.pos; }

  u8(): number { return this.view.getUint8(this.pos++); }
  u16(): number {
    const v = this.view.getUint16(this.pos);
    this.pos += 2;
    return v;
  }
  i32(): number {
    const v = this.view.getInt32(this.pos);
    this.pos += 4;
    return v;
  }
  u32(): number {
    const v = this.view.getUint32(this.pos);
    this.pos += 4;
    return v;
  }

  message(): string | null {
    const idx = this.u8();
    if (idx === 0) return null;
    if (idx === 0xff) {
      const len = this.u8();
      const bytes = new Uint8Array(len);
      for (let i = 0; i < len; i++) bytes[i] = this.u8();
      return new TextDecoder().decode(bytes);
    }
    return CB_MESSAGES[idx] ?? null;
  }

  fuelPrice(): number | null {
    const v = this.u16();
    return v === 0xffff ? null : v / 10;
  }
}

// ── CRC-8 (simple checksum) ─────────────────────────────────

function crc8(data: Uint8Array): number {
  let crc = 0;
  for (let i = 0; i < data.length; i++) {
    crc ^= data[i];
    for (let j = 0; j < 8; j++) {
      crc = crc & 0x80 ? (crc << 1) ^ 0x31 : crc << 1;
    }
    crc &= 0xff;
  }
  return crc;
}

// ── Item types for encoding/decoding ─────────────────────────

export type EncodableItem =
  | { _type: "observation"; type: string; severity: string; lat: number; lng: number;
      message?: string | null; value?: string | null; report_count: number; timestamp: string }
  | { _type: "traffic"; type: string; severity: string; lat: number; lng: number;
      headline: string; region?: string | null; timestamp: string }
  | { _type: "hazard"; kind: string; severity: string; urgency: string; certainty: string;
      priority: number; lat: number; lng: number; title: string; region?: string | null; timestamp: string }
  | { _type: "fuel_price"; lat: number; lng: number; name: string;
      fuel_type: string; price_cents: number; timestamp: string }
  | { _type: "weather"; lat: number; lng: number; temp_c: number; wind_kmh: number;
      precip_pct: number; weather_code: number; uv: number; is_twilight_danger: boolean }
  | { _type: "flood_gauge"; lat: number; lng: number; height_m: number;
      trend: string; severity: string; timestamp: string }
  | { _type: "wildlife"; lat: number; lng: number; risk: string;
      species_count: number; is_twilight: boolean }
  | { _type: "bushfire"; lat: number; lng: number; alert_level: string;
      size_ha: number; timestamp: string }
  | { _type: "road_camera"; lat: number; lng: number; camera_type: number;
      is_school_zone: boolean }
  | { _type: "coverage"; lat: number; lng: number; telstra: string;
      optus: string; vodafone: string }
  | { _type: "rest_area"; lat: number; lng: number; quality: number;
      facilities_bits: number; has_water: boolean };

// ── Encode a single item ─────────────────────────────────────

function encodeItem(w: BinaryWriter, item: EncodableItem) {
  switch (item._type) {
    case "observation": {
      // [TYPE:1][obs_type:1][severity:1][lat:4][lng:4][msg:1+][value:1+][count:1][ts:4] = ~17-18 bytes
      w.u8(ItemType.OBSERVATION);
      w.u8(cbIndex(CB_OBS_TYPE, item.type));
      w.u8(cbIndex(CB_OBS_SEVERITY, item.severity));
      w.i32(encodeCoord(item.lat));
      w.i32(encodeCoord(item.lng));
      w.message(item.message);
      // Value: for road_condition use codebook, for fuel_price use price encoding
      if (item.type === "road_condition") {
        w.u8(cbIndex(CB_ROAD_CONDITION, item.value ?? ""));
      } else if (item.type === "fuel_price" && item.value) {
        w.fuelPrice(parseFloat(item.value));
      } else {
        w.message(item.value);
      }
      w.u8(Math.min(item.report_count, 255));
      w.u32(encodeTimestamp(item.timestamp));
      break;
    }
    case "traffic": {
      // [TYPE:1][traffic_type:1][severity:1][lat:4][lng:4][msg:1+][region:1][ts:4] = ~17+ bytes
      w.u8(ItemType.TRAFFIC);
      w.u8(cbIndex(CB_TRAFFIC_TYPE, item.type));
      w.u8(cbIndex(CB_TRAFFIC_SEVERITY, item.severity));
      w.i32(encodeCoord(item.lat));
      w.i32(encodeCoord(item.lng));
      w.message(item.headline);
      w.u8(cbIndex(CB_REGION, item.region ?? "unknown"));
      w.u32(encodeTimestamp(item.timestamp));
      break;
    }
    case "hazard": {
      // [TYPE:1][kind:1][severity:1][urgency:1][certainty:1][priority:1][lat:4][lng:4]
      // [msg:1+][region:1][ts:4] = ~20+ bytes
      w.u8(ItemType.HAZARD);
      w.u8(cbIndex(CB_HAZARD_KIND, item.kind));
      w.u8(cbIndex(CB_HAZARD_SEVERITY, item.severity));
      w.u8(cbIndex(CB_URGENCY, item.urgency));
      w.u8(cbIndex(CB_CERTAINTY, item.certainty));
      w.u8(Math.round(item.priority * 255)); // 0.0-1.0 → 0-255
      w.i32(encodeCoord(item.lat));
      w.i32(encodeCoord(item.lng));
      w.message(item.title);
      w.u8(cbIndex(CB_REGION, item.region ?? "unknown"));
      w.u32(encodeTimestamp(item.timestamp));
      break;
    }
    case "fuel_price": {
      // [TYPE:1][lat:4][lng:4][price:2][fuel_type_len:1][fuel_type:n][name_msg:1+][ts:4] = ~18+ bytes
      w.u8(ItemType.FUEL_PRICE);
      w.i32(encodeCoord(item.lat));
      w.i32(encodeCoord(item.lng));
      w.fuelPrice(item.price_cents);
      // Fuel type as short string (max 20 chars)
      const ft = new TextEncoder().encode(item.fuel_type.slice(0, 20));
      w.u8(ft.length);
      for (const b of ft) w.u8(b);
      w.message(item.name);
      w.u32(encodeTimestamp(item.timestamp));
      break;
    }
    case "weather": {
      // [TYPE:1][lat:4][lng:4][temp:1(signed)][wind:1][precip:1][code:1][uv:1][twilight:1] = 15 bytes
      w.u8(ItemType.WEATHER);
      w.i32(encodeCoord(item.lat));
      w.i32(encodeCoord(item.lng));
      w.u8(Math.max(0, Math.min(255, Math.round(item.temp_c + 50)))); // -50 to +205°C
      w.u8(Math.min(255, Math.round(item.wind_kmh)));
      w.u8(Math.min(100, Math.round(item.precip_pct)));
      w.u8(item.weather_code);
      w.u8(Math.min(255, Math.round(item.uv * 10))); // 0-25.5
      w.u8(item.is_twilight_danger ? 1 : 0);
      break;
    }
    case "flood_gauge": {
      // [TYPE:1][lat:4][lng:4][height:2(cm)][trend:1][severity:1][ts:4] = 17 bytes
      w.u8(ItemType.FLOOD_GAUGE);
      w.i32(encodeCoord(item.lat));
      w.i32(encodeCoord(item.lng));
      w.u16(Math.round(Math.max(0, item.height_m) * 100)); // height in cm, max 655.35m
      w.u8(cbIndex(CB_FLOOD_TREND, item.trend));
      w.u8(cbIndex(CB_FLOOD_SEVERITY, item.severity));
      w.u32(encodeTimestamp(item.timestamp));
      break;
    }
    case "wildlife": {
      // [TYPE:1][lat:4][lng:4][risk:1][count:2][twilight:1] = 13 bytes
      w.u8(ItemType.WILDLIFE);
      w.i32(encodeCoord(item.lat));
      w.i32(encodeCoord(item.lng));
      w.u8(cbIndex(CB_WILDLIFE_RISK, item.risk));
      w.u16(Math.min(65535, item.species_count));
      w.u8(item.is_twilight ? 1 : 0);
      break;
    }
    case "bushfire": {
      // [TYPE:1][lat:4][lng:4][alert:1][size:2(ha/10)][ts:4] = 16 bytes
      w.u8(ItemType.BUSHFIRE);
      w.i32(encodeCoord(item.lat));
      w.i32(encodeCoord(item.lng));
      w.u8(cbIndex(CB_BUSHFIRE_ALERT, item.alert_level.toLowerCase().replace(/ /g, "_")));
      w.u16(Math.min(65535, Math.round(item.size_ha / 10))); // 10ha increments, max 655,350ha
      w.u32(encodeTimestamp(item.timestamp));
      break;
    }
    case "road_camera": {
      // [TYPE:1][lat:4][lng:4][cam_type:1][school:1] = 11 bytes
      w.u8(ItemType.ROAD_CAMERA);
      w.i32(encodeCoord(item.lat));
      w.i32(encodeCoord(item.lng));
      w.u8(item.camera_type);
      w.u8(item.is_school_zone ? 1 : 0);
      break;
    }
    case "coverage": {
      // [TYPE:1][lat:4][lng:4][telstra:1][optus:1][vodafone:1] = 12 bytes
      w.u8(ItemType.COVERAGE);
      w.i32(encodeCoord(item.lat));
      w.i32(encodeCoord(item.lng));
      w.u8(cbIndex(CB_COVERAGE, item.telstra));
      w.u8(cbIndex(CB_COVERAGE, item.optus));
      w.u8(cbIndex(CB_COVERAGE, item.vodafone));
      break;
    }
    case "rest_area": {
      // [TYPE:1][lat:4][lng:4][quality:1][facilities:2 bits][water:1] = 13 bytes
      w.u8(ItemType.REST_AREA);
      w.i32(encodeCoord(item.lat));
      w.i32(encodeCoord(item.lng));
      w.u8(Math.min(100, item.quality));
      w.u16(item.facilities_bits); // 9 boolean flags packed into uint16
      w.u8(item.has_water ? 1 : 0);
      break;
    }
  }
}

// ── Decode a single item ─────────────────────────────────────

function decodeItem(r: BinaryReader): EncodableItem | null {
  if (r.remaining < 1) return null;
  const type = r.u8();

  switch (type) {
    case ItemType.OBSERVATION: {
      const obsType = cbValue(CB_OBS_TYPE, r.u8());
      const severity = cbValue(CB_OBS_SEVERITY, r.u8());
      const lat = decodeCoord(r.i32());
      const lng = decodeCoord(r.i32());
      const message = r.message();
      let value: string | null;
      if (obsType === "road_condition") {
        value = cbValue(CB_ROAD_CONDITION, r.u8()) || null;
      } else if (obsType === "fuel_price") {
        const p = r.fuelPrice();
        value = p != null ? String(p) : null;
      } else {
        value = r.message();
      }
      const count = r.u8();
      const ts = decodeTimestamp(r.u32());
      return { _type: "observation", type: obsType, severity, lat, lng, message, value, report_count: count, timestamp: ts };
    }
    case ItemType.TRAFFIC: {
      const tType = cbValue(CB_TRAFFIC_TYPE, r.u8());
      const severity = cbValue(CB_TRAFFIC_SEVERITY, r.u8());
      const lat = decodeCoord(r.i32());
      const lng = decodeCoord(r.i32());
      const headline = r.message() ?? "";
      const region = cbValue(CB_REGION, r.u8());
      const ts = decodeTimestamp(r.u32());
      return { _type: "traffic", type: tType, severity, lat, lng, headline, region, timestamp: ts };
    }
    case ItemType.HAZARD: {
      const kind = cbValue(CB_HAZARD_KIND, r.u8());
      const severity = cbValue(CB_HAZARD_SEVERITY, r.u8());
      const urgency = cbValue(CB_URGENCY, r.u8());
      const certainty = cbValue(CB_CERTAINTY, r.u8());
      const priority = r.u8() / 255;
      const lat = decodeCoord(r.i32());
      const lng = decodeCoord(r.i32());
      const title = r.message() ?? "";
      const region = cbValue(CB_REGION, r.u8());
      const ts = decodeTimestamp(r.u32());
      return { _type: "hazard", kind, severity, urgency, certainty, priority, lat, lng, title, region, timestamp: ts };
    }
    case ItemType.FUEL_PRICE: {
      const lat = decodeCoord(r.i32());
      const lng = decodeCoord(r.i32());
      const price = r.fuelPrice() ?? 0;
      const ftLen = r.u8();
      const ftBytes = new Uint8Array(ftLen);
      for (let i = 0; i < ftLen; i++) ftBytes[i] = r.u8();
      const fuel_type = new TextDecoder().decode(ftBytes);
      const name = r.message() ?? "";
      const ts = decodeTimestamp(r.u32());
      return { _type: "fuel_price", lat, lng, price_cents: price, fuel_type, name, timestamp: ts };
    }
    case ItemType.WEATHER: {
      const lat = decodeCoord(r.i32());
      const lng = decodeCoord(r.i32());
      const temp = r.u8() - 50;
      const wind = r.u8();
      const precip = r.u8();
      const code = r.u8();
      const uv = r.u8() / 10;
      const twilight = r.u8() !== 0;
      return { _type: "weather", lat, lng, temp_c: temp, wind_kmh: wind, precip_pct: precip, weather_code: code, uv, is_twilight_danger: twilight };
    }
    case ItemType.FLOOD_GAUGE: {
      const lat = decodeCoord(r.i32());
      const lng = decodeCoord(r.i32());
      const height = r.u16() / 100;
      const trend = cbValue(CB_FLOOD_TREND, r.u8());
      const severity = cbValue(CB_FLOOD_SEVERITY, r.u8());
      const ts = decodeTimestamp(r.u32());
      return { _type: "flood_gauge", lat, lng, height_m: height, trend, severity, timestamp: ts };
    }
    case ItemType.WILDLIFE: {
      const lat = decodeCoord(r.i32());
      const lng = decodeCoord(r.i32());
      const risk = cbValue(CB_WILDLIFE_RISK, r.u8());
      const count = r.u16();
      const twilight = r.u8() !== 0;
      return { _type: "wildlife", lat, lng, risk, species_count: count, is_twilight: twilight };
    }
    case ItemType.BUSHFIRE: {
      const lat = decodeCoord(r.i32());
      const lng = decodeCoord(r.i32());
      const alert = cbValue(CB_BUSHFIRE_ALERT, r.u8());
      const size = r.u16() * 10;
      const ts = decodeTimestamp(r.u32());
      return { _type: "bushfire", lat, lng, alert_level: alert, size_ha: size, timestamp: ts };
    }
    case ItemType.ROAD_CAMERA: {
      const lat = decodeCoord(r.i32());
      const lng = decodeCoord(r.i32());
      const camType = r.u8();
      const school = r.u8() !== 0;
      return { _type: "road_camera", lat, lng, camera_type: camType, is_school_zone: school };
    }
    case ItemType.COVERAGE: {
      const lat = decodeCoord(r.i32());
      const lng = decodeCoord(r.i32());
      const telstra = cbValue(CB_COVERAGE, r.u8());
      const optus = cbValue(CB_COVERAGE, r.u8());
      const vodafone = cbValue(CB_COVERAGE, r.u8());
      return { _type: "coverage", lat, lng, telstra, optus, vodafone };
    }
    case ItemType.REST_AREA: {
      const lat = decodeCoord(r.i32());
      const lng = decodeCoord(r.i32());
      const quality = r.u8();
      const facilities = r.u16();
      const water = r.u8() !== 0;
      return { _type: "rest_area", lat, lng, quality, facilities_bits: facilities, has_water: water };
    }
    default:
      return null; // Unknown type - stop decoding
  }
}

// ── Public API: encode frame ─────────────────────────────────

export function encodeFrame(items: EncodableItem[]): Uint8Array {
  const w = new BinaryWriter();
  w.u16(MAGIC);
  w.u8(VERSION);
  w.u16(items.length);

  for (const item of items) {
    encodeItem(w, item);
  }

  const payload = w.toUint8Array();
  // Append CRC-8
  const crc = crc8(payload);
  const frame = new Uint8Array(payload.length + 1);
  frame.set(payload);
  frame[payload.length] = crc;
  return frame;
}

// ── Public API: decode frame ─────────────────────────────────

export function decodeFrame(data: Uint8Array): EncodableItem[] {
  if (data.length < 6) throw new Error("Frame too short");

  // Verify CRC
  const payload = data.slice(0, data.length - 1);
  const expectedCrc = data[data.length - 1];
  if (crc8(payload) !== expectedCrc) throw new Error("CRC mismatch");

  const r = new BinaryReader(payload);

  const magic = r.u16();
  if (magic !== MAGIC) throw new Error(`Bad magic: 0x${magic.toString(16)}`);

  const version = r.u8();
  if (version !== VERSION) throw new Error(`Unknown version: ${version}`);

  const count = r.u16();
  const items: EncodableItem[] = [];

  for (let i = 0; i < count; i++) {
    const item = decodeItem(r);
    if (!item) break;
    items.push(item);
  }

  return items;
}

// ── Facility bits helper (for rest areas) ────────────────────

export function packFacilities(f: {
  toilets?: boolean | null; drinking_water?: boolean | null;
  shower?: boolean | null; bbq?: boolean | null;
  picnic_table?: boolean | null; power_supply?: boolean | null;
  internet?: boolean | null; lit?: boolean | null;
  shelter?: boolean | null;
}): number {
  let bits = 0;
  if (f.toilets) bits |= 1 << 0;
  if (f.drinking_water) bits |= 1 << 1;
  if (f.shower) bits |= 1 << 2;
  if (f.bbq) bits |= 1 << 3;
  if (f.picnic_table) bits |= 1 << 4;
  if (f.power_supply) bits |= 1 << 5;
  if (f.internet) bits |= 1 << 6;
  if (f.lit) bits |= 1 << 7;
  if (f.shelter) bits |= 1 << 8;
  return bits;
}

export function unpackFacilities(bits: number) {
  return {
    toilets: !!(bits & (1 << 0)),
    drinking_water: !!(bits & (1 << 1)),
    shower: !!(bits & (1 << 2)),
    bbq: !!(bits & (1 << 3)),
    picnic_table: !!(bits & (1 << 4)),
    power_supply: !!(bits & (1 << 5)),
    internet: !!(bits & (1 << 6)),
    lit: !!(bits & (1 << 7)),
    shelter: !!(bits & (1 << 8)),
  };
}
