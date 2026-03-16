// src/lib/utils/openingHours.ts
//
// Offline-capable OSM opening_hours parser.
// Supports the most common formats encountered in Australian OSM data:
//   "24/7"
//   "Mo-Fr 08:00-17:00"
//   "Mo-Fr 08:00-17:00; Sa 09:00-12:00"
//   "Mo-Su 07:00-22:00"
//   "Mo,We,Fr 09:00-17:00"
//   "08:00-17:00"  (every day)
//   "Mo-Fr 08:00-17:00; PH off"
//   "off" / "closed"

export type OHStatus = {
  isOpen: boolean;
  label: string; // "Open · closes 17:00" | "Closed · opens Mon 08:00"
  nextLabel: string | null; // "closes 17:00" | "opens Mon 08:00"
};

// ── Internal types ──────────────────────────────────────────

const DAY_NAMES = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"] as const;
const DAY_LONG = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"] as const;
type DayIdx = 0 | 1 | 2 | 3 | 4 | 5 | 6;

type TimeRange = { from: number; to: number }; // minutes since midnight; to may be > 1440 (crosses midnight)

type DayRule = {
  days: DayIdx[]; // which days this rule applies to
  ranges: TimeRange[]; // [] means "off" for those days
  isOff: boolean;
};

// ── Parser ──────────────────────────────────────────────────

function parseDayList(raw: string): DayIdx[] {
  const days: DayIdx[] = [];
  const parts = raw.split(",");
  for (const part of parts) {
    const rangeSep = part.indexOf("-");
    if (rangeSep !== -1) {
      const fromStr = part.slice(0, rangeSep).trim();
      const toStr = part.slice(rangeSep + 1).trim();
      const from = DAY_NAMES.indexOf(fromStr as (typeof DAY_NAMES)[number]);
      const to = DAY_NAMES.indexOf(toStr as (typeof DAY_NAMES)[number]);
      if (from === -1 || to === -1) continue;
      // Wrap-around range (e.g. Fr-Su)
      let cur = from;
      while (true) {
        days.push(cur as DayIdx);
        if (cur === to) break;
        cur = (cur + 1) % 7;
        if (cur === from) break; // safety
      }
    } else {
      const idx = DAY_NAMES.indexOf(part.trim() as (typeof DAY_NAMES)[number]);
      if (idx !== -1) days.push(idx as DayIdx);
    }
  }
  return days;
}

function parseTime(raw: string): number | null {
  const m = raw.trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  return parseInt(m[1], 10) * 60 + parseInt(m[2], 10);
}

function parseRules(ohStr: string): DayRule[] | "24/7" | "off" {
  const s = ohStr.trim();
  if (s === "24/7") return "24/7";
  if (s.toLowerCase() === "off" || s.toLowerCase() === "closed") return "off";

  const rules: DayRule[] = [];
  const segments = s.split(";").map((x) => x.trim()).filter(Boolean);

  for (const seg of segments) {
    // Skip public holiday rules (PH off, PH 10:00-16:00, etc.)
    if (/^PH\s/i.test(seg)) continue;

    // Match "Day(s) HH:MM-HH:MM[,HH:MM-HH:MM]" or "Day(s) off"
    const dayTimeMatch = seg.match(/^([A-Za-z,\-]+)\s+(.+)$/);
    if (dayTimeMatch) {
      const dayPart = dayTimeMatch[1];
      const timePart = dayTimeMatch[2].trim();

      const days = parseDayList(dayPart);
      if (days.length === 0) continue;

      if (timePart.toLowerCase() === "off" || timePart.toLowerCase() === "closed") {
        rules.push({ days, ranges: [], isOff: true });
        continue;
      }

      const ranges: TimeRange[] = [];
      for (const rangeStr of timePart.split(",")) {
        const [fromStr, toStr] = rangeStr.trim().split("-");
        if (!fromStr || !toStr) continue;
        const from = parseTime(fromStr);
        const to = parseTime(toStr);
        if (from === null || to === null) continue;
        // Handle midnight crossover (e.g. 22:00-02:00)
        ranges.push({ from, to: to <= from ? to + 1440 : to });
      }
      rules.push({ days, ranges, isOff: false });
    } else {
      // No day prefix — applies to all days (e.g. "08:00-17:00")
      const ranges: TimeRange[] = [];
      for (const rangeStr of seg.split(",")) {
        const [fromStr, toStr] = rangeStr.trim().split("-");
        if (!fromStr || !toStr) continue;
        const from = parseTime(fromStr);
        const to = parseTime(toStr);
        if (from === null || to === null) continue;
        ranges.push({ from, to: to <= from ? to + 1440 : to });
      }
      if (ranges.length) {
        rules.push({ days: [0, 1, 2, 3, 4, 5, 6], ranges, isOff: false });
      }
    }
  }

  return rules;
}

// ── Status resolution ───────────────────────────────────────

function minutesIntoDay(date: Date): number {
  return date.getHours() * 60 + date.getMinutes();
}

function fmtTime(minutes: number): string {
  const h = Math.floor(minutes % 1440 / 60);
  const m = minutes % 60;
  return `${h}:${m.toString().padStart(2, "0")}`;
}

export function parseOpeningHours(ohStr: string | null | undefined, now: Date = new Date()): OHStatus | null {
  if (!ohStr) return null;

  const parsed = parseRules(ohStr);

  if (parsed === "24/7") {
    return { isOpen: true, label: "Open 24/7", nextLabel: null };
  }
  if (parsed === "off") {
    return { isOpen: false, label: "Closed", nextLabel: null };
  }
  if (parsed.length === 0) return null;

  return resolveStatus(parsed, now);
}

// ── Clean resolver ──────────────────────────────────────────

function resolveStatus(rules: DayRule[], now: Date): OHStatus | null {
  const todayIdx = now.getDay() as DayIdx;
  const nowMin = minutesIntoDay(now);

  function getRangesForDay(dayIdx: DayIdx): TimeRange[] | null {
    let result: TimeRange[] | null = null;
    let isOff = false;
    for (const rule of rules) {
      if (rule.days.includes(dayIdx)) {
        if (rule.isOff) { isOff = true; result = []; }
        else { isOff = false; result = rule.ranges; }
      }
    }
    if (isOff) return [];
    return result;
  }

  // Check if open now
  const todayRanges = getRangesForDay(todayIdx);
  if (todayRanges) {
    for (const range of todayRanges) {
      if (nowMin >= range.from && nowMin < range.to) {
        // Currently open
        const closesAtMin = range.to % 1440;
        return {
          isOpen: true,
          label: `Open · closes ${fmtTime(closesAtMin)}`,
          nextLabel: `closes ${fmtTime(closesAtMin)}`,
        };
      }
    }
  }

  // Find next opening time (up to 7 days ahead)
  for (let dOffset = 0; dOffset <= 7; dOffset++) {
    const dayIdx = ((todayIdx + dOffset) % 7) as DayIdx;
    const ranges = getRangesForDay(dayIdx);
    if (!ranges || ranges.length === 0) continue;

    for (const range of ranges) {
      const startMin = dOffset === 0 ? range.from : range.from;
      if (dOffset === 0 && startMin <= nowMin) continue; // already passed today

      const label = dOffset === 0 ? fmtTime(startMin)
        : dOffset === 1 ? `tomorrow ${fmtTime(startMin)}`
        : `${DAY_LONG[dayIdx]} ${fmtTime(startMin)}`;

      return {
        isOpen: false,
        label: `Closed · opens ${label}`,
        nextLabel: `opens ${label}`,
      };
    }
  }

  return { isOpen: false, label: "Closed", nextLabel: null };
}

// ── Human-readable summary ──────────────────────────────────

export function ohToHuman(ohStr: string | null | undefined): string | null {
  if (!ohStr) return null;
  const s = ohStr.trim();
  if (s === "24/7") return "Open 24 hours";
  if (s.toLowerCase() === "off" || s.toLowerCase() === "closed") return "Closed";
  // Return the raw string cleaned up a bit if we can't parse it nicely
  return s.replace(/;/g, " · ").replace(/\s+/g, " ");
}
