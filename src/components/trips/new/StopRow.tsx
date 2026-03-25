import { useState, useCallback, useEffect, useRef } from "react";
import type { TripStop } from "@/lib/types/trip";
import type { PlaceItem } from "@/lib/types/places";
import { placesApi } from "@/lib/api/places";
import { Search, Crosshair, Loader2, ChevronUp, ChevronDown, X, Clock, Calendar, ChevronLeft, ChevronRight } from "lucide-react";

import { haptic } from "@/lib/native/haptics";
import { getCurrentPosition } from "@/lib/native/geolocation";
import { hideKeyboard } from "@/lib/native/keyboard";
import { useDebounceSearch } from "@/lib/hooks/useDebounceSearch";

const MIN_QUERY_LEN = 2;

/* ── Date/time formatting helpers ─────────────────────────────────────── */

/** Format a short schedule summary for the toggle button. */
function formatScheduleSummary(arrive?: string | null, depart?: string | null): string {
  const fmt = (iso: string) => {
    try {
      const d = new Date(iso);
      const day = String(d.getDate()).padStart(2, "0");
      const mon = String(d.getMonth() + 1).padStart(2, "0");
      const h = String(d.getHours()).padStart(2, "0");
      const m = String(d.getMinutes()).padStart(2, "0");
      return `${day}/${mon} ${h}:${m}`;
    } catch { return iso; }
  };
  if (arrive && depart) return `${fmt(arrive)} → ${fmt(depart)}`;
  if (arrive) return `Arrive ${fmt(arrive)}`;
  if (depart) return `Depart ${fmt(depart)}`;
  return "Add times";
}

/** Parse ISO local string "2026-03-20T09:00" → { date: "20-03-2026", time: "09:00" } */
function parseIso(iso?: string | null): { date: string; time: string } {
  if (!iso) return { date: "", time: "" };
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return { date: "", time: "" };
    const day = String(d.getDate()).padStart(2, "0");
    const mon = String(d.getMonth() + 1).padStart(2, "0");
    const year = d.getFullYear();
    const h = String(d.getHours()).padStart(2, "0");
    const m = String(d.getMinutes()).padStart(2, "0");
    return { date: `${day}-${mon}-${year}`, time: `${h}:${m}` };
  } catch { return { date: "", time: "" }; }
}

/** Combine dd-mm-yyyy date + HH:MM time → ISO local string. */
function toIso(date: string, time: string): string | null {
  if (!date || !time) return null;
  const [day, mon, year] = date.split("-");
  if (!day || !mon || !year) return null;
  return `${year}-${mon.padStart(2, "0")}-${day.padStart(2, "0")}T${time}`;
}

/** Get today as dd-mm-yyyy */
function todayStr() {
  const d = new Date();
  return `${String(d.getDate()).padStart(2, "0")}-${String(d.getMonth() + 1).padStart(2, "0")}-${d.getFullYear()}`;
}

/* ── Month names ──────────────────────────────────────────────────────── */
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const DAYS_OF_WEEK = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];

/* ── Inline Calendar Picker ───────────────────────────────────────────── */

function CalendarPicker({ value, onChange, onClose }: {
  value: string; // dd-mm-yyyy
  onChange: (val: string) => void;
  onClose: () => void;
}) {
  // Parse initial value or use today
  const initial = (() => {
    if (value) {
      const [d, m, y] = value.split("-").map(Number);
      if (d && m && y) return { month: m - 1, year: y, day: d };
    }
    const now = new Date();
    return { month: now.getMonth(), year: now.getFullYear(), day: now.getDate() };
  })();

  const [viewMonth, setViewMonth] = useState(initial.month);
  const [viewYear, setViewYear] = useState(initial.year);
  const [selectedDay, setSelectedDay] = useState(initial.day);
  const [selectedMonth, setSelectedMonth] = useState(initial.month);
  const [selectedYear, setSelectedYear] = useState(initial.year);

  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  // Monday-based: 0=Mon..6=Sun
  const firstDayOfWeek = (new Date(viewYear, viewMonth, 1).getDay() + 6) % 7;

  const prevMonth = () => {
    haptic.selection();
    if (viewMonth === 0) { setViewMonth(11); setViewYear(viewYear - 1); }
    else setViewMonth(viewMonth - 1);
  };
  const nextMonth = () => {
    haptic.selection();
    if (viewMonth === 11) { setViewMonth(0); setViewYear(viewYear + 1); }
    else setViewMonth(viewMonth + 1);
  };

  const selectDay = (day: number) => {
    haptic.selection();
    setSelectedDay(day);
    setSelectedMonth(viewMonth);
    setSelectedYear(viewYear);
    const dateStr = `${String(day).padStart(2, "0")}-${String(viewMonth + 1).padStart(2, "0")}-${viewYear}`;
    onChange(dateStr);
    onClose();
  };

  const isSelected = (day: number) =>
    day === selectedDay && viewMonth === selectedMonth && viewYear === selectedYear;

  const isToday = (day: number) => {
    const now = new Date();
    return day === now.getDate() && viewMonth === now.getMonth() && viewYear === now.getFullYear();
  };

  // Build grid cells
  const cells: (number | null)[] = [];
  for (let i = 0; i < firstDayOfWeek; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);

  return (
    <div style={{
      background: "var(--roam-surface)",
      borderRadius: 16,
      border: "1px solid var(--roam-border)",
      boxShadow: "var(--shadow-heavy)",
      overflow: "hidden",
      width: 280,
      animation: "roam-fadeIn 0.15s ease-out",
    }}>
      {/* Month/year header */}
      <div style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "10px 8px 6px",
      }}>
        <button
          type="button"
          onClick={prevMonth}
          style={{
            all: "unset", cursor: "pointer", width: 44, height: 44, borderRadius: 10,
            display: "grid", placeItems: "center",
            background: "var(--roam-surface-hover)", color: "var(--roam-text)",
            touchAction: "manipulation", WebkitTapHighlightColor: "transparent",
          }}
          aria-label="Previous month"
        >
          <ChevronLeft size={14} strokeWidth={2.5} />
        </button>
        <div style={{
          fontSize: 13, fontWeight: 800, color: "var(--roam-text)", letterSpacing: "-0.2px",
        }}>
          {MONTHS[viewMonth]} {viewYear}
        </div>
        <button
          type="button"
          onClick={nextMonth}
          style={{
            all: "unset", cursor: "pointer", width: 44, height: 44, borderRadius: 10,
            display: "grid", placeItems: "center",
            background: "var(--roam-surface-hover)", color: "var(--roam-text)",
            touchAction: "manipulation", WebkitTapHighlightColor: "transparent",
          }}
          aria-label="Next month"
        >
          <ChevronRight size={14} strokeWidth={2.5} />
        </button>
      </div>

      {/* Day-of-week headers */}
      <div style={{
        display: "grid", gridTemplateColumns: "repeat(7, 1fr)",
        padding: "0 6px 2px", gap: 0,
      }}>
        {DAYS_OF_WEEK.map((d) => (
          <div key={d} style={{
            textAlign: "center", fontSize: 9, fontWeight: 700,
            color: "var(--roam-text-muted)", padding: "2px 0",
            letterSpacing: "0.3px",
          }}>
            {d}
          </div>
        ))}
      </div>

      {/* Day grid */}
      <div style={{
        display: "grid", gridTemplateColumns: "repeat(7, 1fr)",
        padding: "0 6px 8px", gap: 1,
      }}>
        {cells.map((day, i) => {
          if (day === null) return <div key={`empty-${i}`} />;
          const sel = isSelected(day);
          const today = isToday(day);
          return (
            <button
              key={day}
              type="button"
              onClick={() => selectDay(day)}
              style={{
                all: "unset",
                cursor: "pointer",
                display: "grid",
                placeItems: "center",
                height: 44,
                borderRadius: 10,
                fontSize: 13,
                fontWeight: sel ? 900 : 600,
                color: sel ? "var(--on-color)" : today ? "var(--brand-eucalypt)" : "var(--roam-text)",
                background: sel
                  ? "var(--brand-eucalypt)"
                  : today
                  ? "var(--accent-tint)"
                  : "transparent",
                boxShadow: sel ? "var(--shadow-soft)" : "none",
                transition: "background 100ms, color 100ms",
                WebkitTapHighlightColor: "transparent",
                touchAction: "manipulation",
              }}
            >
              {day}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* ── Time Scroller Picker ─────────────────────────────────────────────── */

function TimeScrollPicker({ value, onChange }: {
  value: string; // "HH:MM"
  onChange: (val: string) => void;
}) {
  const [h, m] = (value || "09:00").split(":").map(Number);
  const hour = isNaN(h) ? 9 : h;
  const minute = isNaN(m) ? 0 : m;

  // Snap to 5-minute intervals for touch-friendliness
  const minuteSlots = Array.from({ length: 12 }, (_, i) => i * 5);
  const hourSlots = Array.from({ length: 24 }, (_, i) => i);

  const emit = (newH: number, newM: number) => {
    onChange(`${String(newH).padStart(2, "0")}:${String(newM).padStart(2, "0")}`);
  };

  const hourScrollRef = useRef<HTMLDivElement>(null);
  const minuteScrollRef = useRef<HTMLDivElement>(null);
  const didScrollInit = useRef(false);

  // Auto-scroll to current value on mount
  useEffect(() => {
    if (didScrollInit.current) return;
    didScrollInit.current = true;
    requestAnimationFrame(() => {
      if (hourScrollRef.current) {
        const item = hourScrollRef.current.children[hour] as HTMLElement | undefined;
        if (item) item.scrollIntoView({ block: "center", behavior: "instant" });
      }
      if (minuteScrollRef.current) {
        const idx = minuteSlots.indexOf(minute) >= 0 ? minuteSlots.indexOf(minute) : 0;
        const item = minuteScrollRef.current.children[idx] as HTMLElement | undefined;
        if (item) item.scrollIntoView({ block: "center", behavior: "instant" });
      }
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const ITEM_H = 36;

  return (
    <div style={{
      display: "flex",
      gap: 0,
      background: "var(--roam-surface)",
      borderRadius: 12,
      border: "1px solid var(--roam-border)",
      overflow: "hidden",
      height: ITEM_H * 5,
      width: 160,
      position: "relative",
    }}>
      {/* Selection indicator - centered strip */}
      <div style={{
        position: "absolute",
        left: 3, right: 3,
        top: "50%",
        transform: "translateY(-50%)",
        height: ITEM_H,
        background: "var(--accent-tint)",
        borderRadius: 8,
        pointerEvents: "none",
        zIndex: 0,
      }} />

      {/* Hours column */}
      <div
        ref={hourScrollRef}
        style={{
          flex: 1, overflowY: "auto", WebkitOverflowScrolling: "touch",
          scrollSnapType: "y mandatory",
          position: "relative", zIndex: 1,
        }}
        className="roam-scroll"
      >
        {/* Top/bottom spacers for center alignment */}
        <div style={{ height: ITEM_H * 2 }} />
        {hourSlots.map((hh) => (
          <button
            key={hh}
            type="button"
            onClick={() => { haptic.selection(); emit(hh, minute); }}
            style={{
              all: "unset",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              width: "100%",
              height: ITEM_H,
              scrollSnapAlign: "center",
              fontSize: hh === hour ? 17 : 14,
              fontWeight: hh === hour ? 900 : 500,
              color: hh === hour ? "var(--roam-text)" : "var(--roam-text-muted)",
              cursor: "pointer",
              transition: "font-size 100ms, font-weight 100ms, color 100ms",
              fontVariantNumeric: "tabular-nums",
              WebkitTapHighlightColor: "transparent",
            }}
          >
            {String(hh).padStart(2, "0")}
          </button>
        ))}
        <div style={{ height: ITEM_H * 2 }} />
      </div>

      {/* Separator */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: 18, fontWeight: 900, color: "var(--roam-text)",
        width: 16, flexShrink: 0, zIndex: 1,
      }}>
        :
      </div>

      {/* Minutes column */}
      <div
        ref={minuteScrollRef}
        style={{
          flex: 1, overflowY: "auto", WebkitOverflowScrolling: "touch",
          scrollSnapType: "y mandatory",
          position: "relative", zIndex: 1,
        }}
        className="roam-scroll"
      >
        <div style={{ height: ITEM_H * 2 }} />
        {minuteSlots.map((mm) => (
          <button
            key={mm}
            type="button"
            onClick={() => { haptic.selection(); emit(hour, mm); }}
            style={{
              all: "unset",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              width: "100%",
              height: ITEM_H,
              scrollSnapAlign: "center",
              fontSize: mm === minute ? 17 : 14,
              fontWeight: mm === minute ? 900 : 500,
              color: mm === minute ? "var(--roam-text)" : "var(--roam-text-muted)",
              cursor: "pointer",
              transition: "font-size 100ms, font-weight 100ms, color 100ms",
              fontVariantNumeric: "tabular-nums",
              WebkitTapHighlightColor: "transparent",
            }}
          >
            {String(mm).padStart(2, "0")}
          </button>
        ))}
        <div style={{ height: ITEM_H * 2 }} />
      </div>
    </div>
  );
}

/* ── Combined Date + Time Picker Section ──────────────────────────────── */

/**
 * SchedulePopover - the entire schedule UI lives in a single fixed-position
 * popover anchored to the clock button. Nothing pushes content in the flow.
 */
function SchedulePopover({ stop, onEdit, anchorRef, onClose }: {
  stop: TripStop;
  onEdit: (patch: Partial<Pick<TripStop, "arrive_at" | "depart_at">>) => void;
  anchorRef: React.RefObject<HTMLButtonElement | null>;
  onClose: () => void;
}) {
  const popRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ top: 0, left: 0, above: false });
  const [subPicker, setSubPicker] = useState<
    | null
    | { kind: "cal"; field: "arrive" | "depart" }
    | { kind: "time"; field: "arrive" | "depart" }
  >(null);
  const [subPos, setSubPos] = useState({ top: 0, left: 0 });
  const subRef = useRef<HTMLDivElement>(null);

  // Derived state
  const parseField = (field: "arrive" | "depart") => {
    const iso = field === "arrive" ? stop.arrive_at : stop.depart_at;
    return parseIso(iso);
  };

  const setField = (field: "arrive" | "depart", date: string, time: string) => {
    const iso = toIso(date, time);
    if (field === "arrive") onEdit({ arrive_at: iso });
    else onEdit({ depart_at: iso });
  };

  // Position on mount
  useEffect(() => {
    if (!anchorRef.current) return;
    const r = anchorRef.current.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const popW = 260;
    const popH = 160; // approx
    const above = r.bottom + popH + 8 > vh;
    setPos({
      top: above ? Math.max(8, r.top - popH - 4) : r.bottom + 4,
      left: Math.max(8, Math.min(r.left, vw - popW - 8)),
      above,
    });
  }, [anchorRef]);

  // Close entire popover on outside click (but not when clicking sub-pickers)
  useEffect(() => {
    const handler = (e: PointerEvent) => {
      const t = e.target as Node;
      if (anchorRef.current?.contains(t)) return;
      if (popRef.current?.contains(t)) return;
      if (subRef.current?.contains(t)) return;
      onClose();
    };
    document.addEventListener("pointerdown", handler, true);
    return () => document.removeEventListener("pointerdown", handler, true);
  }, [anchorRef, onClose]);

  const openSub = (kind: "cal" | "time", field: "arrive" | "depart", btnEl: HTMLElement) => {
    haptic.selection();
    const r = btnEl.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    if (kind === "cal") {
      const calH = 310; const calW = 280;
      setSubPos({
        top: (r.bottom + calH > vh) ? Math.max(8, r.top - calH - 4) : r.bottom + 4,
        left: Math.max(8, Math.min(r.left, vw - calW - 8)),
      });
    } else {
      const pH = 180; const pW = 160;
      setSubPos({
        top: (r.bottom + pH > vh) ? Math.max(8, r.top - pH - 4) : r.bottom + 4,
        left: Math.max(8, Math.min(r.right - pW, vw - pW - 8)),
      });
    }
    setSubPicker({ kind, field });
  };

  // Close sub-picker on outside click
  useEffect(() => {
    if (!subPicker) return;
    const handler = (e: PointerEvent) => {
      if (subRef.current?.contains(e.target as Node)) return;
      setSubPicker(null);
    };
    document.addEventListener("pointerdown", handler, true);
    return () => document.removeEventListener("pointerdown", handler, true);
  }, [subPicker]);

  const showArrive = stop.type !== "start";
  const showDepart = stop.type !== "end";

  function FieldRow({ field, label }: { field: "arrive" | "depart"; label: string }) {
    const p = parseField(field);
    const d = p.date || todayStr();
    const t = p.time || "09:00";
    const dateFmt = (() => {
      const [dd, mm, yyyy] = d.split("-");
      return (dd && mm && yyyy) ? `${dd}/${mm}/${yyyy}` : "Set date";
    })();
    return (
      <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
        <span style={{
          fontSize: 10, fontWeight: 700, color: "var(--roam-text-muted)",
          textTransform: "uppercase", letterSpacing: "0.04em",
          width: 48, flexShrink: 0,
        }}>
          {label}
        </span>
        <button
          type="button"
          onClick={(e) => openSub("cal", field, e.currentTarget)}
          style={{
            all: "unset", cursor: "pointer",
            display: "flex", alignItems: "center", gap: 5,
            height: 44, padding: "0 12px", borderRadius: 10,
            background: "var(--roam-surface-hover)",
            color: "var(--roam-text)", fontSize: 12, fontWeight: 700,
            fontVariantNumeric: "tabular-nums",
            WebkitTapHighlightColor: "transparent", touchAction: "manipulation",
          }}
        >
          <Calendar size={11} style={{ opacity: 0.5 }} />
          {dateFmt}
        </button>
        <button
          type="button"
          onClick={(e) => openSub("time", field, e.currentTarget)}
          style={{
            all: "unset", cursor: "pointer",
            display: "flex", alignItems: "center", gap: 4,
            height: 44, padding: "0 12px", borderRadius: 10,
            background: "var(--roam-surface-hover)",
            color: "var(--roam-text)", fontSize: 13, fontWeight: 800,
            fontVariantNumeric: "tabular-nums", letterSpacing: "-0.3px",
            WebkitTapHighlightColor: "transparent", touchAction: "manipulation",
          }}
        >
          <Clock size={11} style={{ opacity: 0.5 }} />
          {t}
        </button>
      </div>
    );
  }

  return (
    <>
      <div
        ref={popRef}
        style={{
          position: "fixed",
          top: pos.top, left: pos.left,
          zIndex: 90,
          background: "var(--roam-surface)",
          borderRadius: 16,
          border: "1px solid var(--roam-border)",
          boxShadow: "var(--shadow-heavy)",
          padding: "12px 14px",
          display: "flex", flexDirection: "column", gap: 8,
          minWidth: 240,
          animation: "roam-fadeIn 0.12s ease-out",
        }}
      >
        {showArrive && <FieldRow field="arrive" label="Arrive" />}
        {showDepart && <FieldRow field="depart" label="Depart" />}

        {(stop.arrive_at || stop.depart_at) && (
          <button
            type="button"
            onClick={() => {
              haptic.selection();
              onEdit({ arrive_at: null, depart_at: null });
            }}
            style={{
              all: "unset", cursor: "pointer",
              fontSize: 11, fontWeight: 700, color: "var(--roam-danger)",
              padding: "4px 0",
              WebkitTapHighlightColor: "transparent",
            }}
          >
            Clear times
          </button>
        )}
      </div>

      {/* Sub-picker: calendar or time, also fixed */}
      {subPicker && (
        <div ref={subRef} style={{
          position: "fixed",
          top: subPos.top, left: subPos.left,
          zIndex: 100,
          animation: "roam-fadeIn 0.1s ease-out",
        }}>
          {subPicker.kind === "cal" ? (
            <CalendarPicker
              value={parseField(subPicker.field).date || todayStr()}
              onChange={(newDate) => {
                const p = parseField(subPicker.field);
                setField(subPicker.field, newDate, p.time || "09:00");
                setSubPicker(null);
              }}
              onClose={() => setSubPicker(null)}
            />
          ) : (
            <TimeScrollPicker
              value={parseField(subPicker.field).time || "09:00"}
              onChange={(newTime) => {
                const p = parseField(subPicker.field);
                setField(subPicker.field, p.date || todayStr(), newTime);
              }}
            />
          )}
        </div>
      )}
    </>
  );
}

/* ── Stop Row helpers ─────────────────────────────────────────────────── */

function badgeForType(type?: string) {
  switch (type) {
    case "start": return "Start";
    case "end":   return "End";
    case "via":   return "Via";
    default:      return "Stop";
  }
}

function getDisplayValue(name?: string | null, type?: string) {
  if (!name) return "";
  if (type === "start" && name === "Start") return "";
  if (type === "end" && name === "End") return "";
  return name;
}

/* ── StopRow Component ────────────────────────────────────────────────── */

export function StopRow(props: {
  stop: TripStop;
  idx: number;
  count: number;
  onEdit: (patch: Partial<Pick<TripStop, "name" | "lat" | "lng" | "arrive_at" | "depart_at">>) => void;
  onSearch: () => void;
  onRemove: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onUseMyLocation?: () => Promise<void> | void;
  isLocating?: boolean;
}) {
  const s = props.stop;
  const [isFocused, setIsFocused] = useState(false);
  const [q, setQ] = useState(() => getDisplayValue(s.name, s.type));
  const wrapperRef = useRef<HTMLDivElement>(null);
  const scheduleBtnRef = useRef<HTMLButtonElement>(null);
  const [scheduleOpen, setScheduleOpen] = useState(false);

  const searchFn = useCallback(
    async (query: string) => {
      const center = { lat: s.lat || -27.4705, lng: s.lng || 153.026 };
      const res = await placesApi.search({ center, radius_m: 50000, query, limit: 5, categories: [] });
      return res.items ?? [];
    },
    [s.lat, s.lng],
  );

  const { results, loading, search: debouncedSearch } = useDebounceSearch<PlaceItem>({ searchFn });

  const canMoveUp = props.idx > 0 && s.type !== "start" && s.type !== "end";
  const canMoveDown = props.idx < props.count - 1 && s.type !== "start" && s.type !== "end";
  const canRemove = s.type !== "start" && s.type !== "end";
  const isLocked = s.type === "start" || s.type === "end";

  // Sync external changes (but still filter out "Start"/"End")
  useEffect(() => {
    if (!isFocused) {
      setQ(getDisplayValue(s.name, s.type));
    }
  }, [s.name, s.type, isFocused]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setIsFocused(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const onInput = (value: string) => {
    setQ(value);
    props.onEdit({ name: value });
    debouncedSearch(value);
  };

  const handlePick = (it: PlaceItem) => {
    haptic.success();
    hideKeyboard();
    props.onEdit({ name: it.name, lat: it.lat, lng: it.lng });
    setQ(it.name);
    setIsFocused(false);
  };

  const handleUseMyLocation = () => {
    haptic.tap();
    setIsFocused(false);
    setQ("My Location");

    if (props.onUseMyLocation) {
      Promise.resolve(props.onUseMyLocation()).catch(() => {});
    } else {
      getCurrentPosition()
        .then((pos) => {
          props.onEdit({ lat: pos.lat, lng: pos.lng, name: "My Location" });
        })
        .catch(() => {});
    }
  };

  const placeholderText =
    props.isLocating ? "Locating…" :
    s.type === "start" ? "Search starting point…" :
    s.type === "end" ? "Search destination…" :
    "Search for a place…";

  const hasTimes = !!(s.arrive_at || s.depart_at);

  return (
    <div
      ref={wrapperRef}
      style={{
        display: "flex",
        gap: 10,
        padding: "14px 0",
        borderBottom: "1px solid var(--roam-border)",
        alignItems: "flex-start",
        position: "relative",
      }}
    >
      {/* Type badge */}
      <div style={{ paddingTop: 10, flexShrink: 0, width: 50 }}>
        <div
          className="trip-badge"
          style={{
            width: "100%", textAlign: "center", justifyContent: "center", paddingInline: 6,
            background: "var(--roam-surface)", color: "var(--roam-text)",
            border: "1px solid var(--roam-border)",
          }}
        >
          {badgeForType(s.type)}
        </div>
      </div>

      {/* Main content */}
      <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 6 }}>
        {/* Search input + Use My Location */}
        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <div style={{ position: "relative", flex: 1, minWidth: 0 }}>
            <div style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "var(--roam-text-muted)", pointerEvents: "none" }}>
              {loading
                ? <Loader2 size={16} style={{ animation: "roam-spin 1s linear infinite" }} />
                : <Search size={16} />
              }
            </div>
            <input
              value={q}
              onFocus={() => setIsFocused(true)}
              onChange={(e) => onInput(e.target.value)}
              placeholder={placeholderText}
              className="trip-input"
              style={{ paddingLeft: 38, width: "100%", height: 44, fontSize: 15, borderRadius: 12 }}
            />

            {/* Dropdown results */}
            {isFocused && q.length >= MIN_QUERY_LEN && (
              <div style={{
                position: "absolute",
                top: "calc(100% + 6px)",
                left: 0, right: 0,
                background: "var(--roam-surface)",
                border: "1px solid var(--roam-border)",
                borderRadius: 12,
                boxShadow: "0 12px 30px -5px rgba(0,0,0,0.2)",
                zIndex: 50,
                overflow: "hidden",
                maxHeight: 220,
                overflowY: "auto",
              }}>
                {results.length === 0 && !loading && (
                  <div style={{ padding: 16, fontSize: 14, color: "var(--roam-text-muted)", textAlign: "center" }}>
                    No places found.
                  </div>
                )}
                {results.map((it) => (
                  <button
                    key={it.id}
                    type="button"
                    onClick={() => handlePick(it)}
                    style={{
                      width: "100%",
                      padding: "11px 16px",
                      minHeight: 44,
                      boxSizing: "border-box",
                      background: "transparent",
                      border: "none",
                      borderBottom: "1px solid var(--roam-border)",
                      textAlign: "left",
                      cursor: "pointer",
                      display: "flex",
                      flexDirection: "column",
                      justifyContent: "center",
                      gap: 2,
                      WebkitTapHighlightColor: "transparent",
                    }}
                  >
                    <span style={{ fontSize: 14, fontWeight: 700, color: "var(--roam-text)" }}>{it.name}</span>
                    <span style={{ fontSize: 12, color: "var(--roam-text-muted)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                      {((it.extra as Record<string, unknown> | undefined)?.address as string) || `${it.category} · ${it.lat.toFixed(3)}, ${it.lng.toFixed(3)}`}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Use My Location button */}
          {(props.onUseMyLocation || s.type === "start") && (
            <button
              type="button"
              onClick={handleUseMyLocation}
              disabled={props.isLocating}
              className="trip-interactive trip-btn-sm"
              title="Use my location"
              aria-label="Use my location"
              style={{ flexShrink: 0, gap: 4, height: 44, paddingInline: 10, borderRadius: 12, whiteSpace: "nowrap", opacity: props.isLocating ? 0.7 : 1 }}
            >
              {props.isLocating
                ? <Loader2 size={16} style={{ animation: "roam-spin 0.8s linear infinite" }} />
                : <Crosshair size={16} />
              }
              <span className="hide-mobile" style={{ fontSize: 12 }}>
                {props.isLocating ? "Locating…" : "Locate"}
              </span>
            </button>
          )}
        </div>

        {/* ── Schedule - single button, everything floats ── */}
        {s.name?.trim() && (
          <>
            <button
              ref={scheduleBtnRef}
              type="button"
              onClick={() => { haptic.selection(); setScheduleOpen(!scheduleOpen); }}
              style={{
                all: "unset", cursor: "pointer",
                display: "inline-flex", alignItems: "center", gap: 5,
                fontSize: 12, fontWeight: 700,
                color: hasTimes ? "var(--brand-eucalypt)" : "var(--roam-text-muted)",
                padding: "4px 8px", borderRadius: 8,
                background: hasTimes ? "var(--accent-tint)" : "transparent",
                WebkitTapHighlightColor: "transparent", touchAction: "manipulation",
              }}
            >
              <Clock size={11} />
              {hasTimes ? formatScheduleSummary(s.arrive_at, s.depart_at) : "Add times"}
            </button>
            {scheduleOpen && (
              <SchedulePopover
                stop={s}
                onEdit={props.onEdit}
                anchorRef={scheduleBtnRef}
                onClose={() => setScheduleOpen(false)}
              />
            )}
          </>
        )}
      </div>

      {/* Reorder / remove controls */}
      {(canMoveUp || canMoveDown || canRemove) && (
        <div style={{ display: "flex", gap: 4, paddingTop: 8, flexShrink: 0, alignItems: "center" }}>
          {canMoveUp && (
            <button
              type="button"
              onClick={() => { haptic.selection(); props.onMoveUp(); }}
              className="trip-interactive trip-btn-icon"
              style={{ width: 44, height: 44, background: "var(--roam-surface-raised)" }}
              aria-label="Move up"
            >
              <ChevronUp size={16} />
            </button>
          )}
          {canMoveDown && (
            <button
              type="button"
              onClick={() => { haptic.selection(); props.onMoveDown(); }}
              className="trip-interactive trip-btn-icon"
              style={{ width: 44, height: 44, background: "var(--roam-surface-raised)" }}
              aria-label="Move down"
            >
              <ChevronDown size={16} />
            </button>
          )}
          {canRemove && (
            <button
              type="button"
              onClick={() => { haptic.medium(); props.onRemove(); }}
              className="trip-interactive trip-btn-icon trip-btn-danger"
              style={{ width: 44, height: 44 }}
              aria-label="Remove stop"
            >
              <X size={15} />
            </button>
          )}
        </div>
      )}

    </div>
  );
}
