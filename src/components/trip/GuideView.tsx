// src/components/trip/GuideView.tsx
"use client";

import { useMemo, useRef, useState, useEffect } from "react";
import Image from "next/image";
import type { PlaceItem, PlaceCategory } from "@/lib/types/places";
import type { MouseEvent, SyntheticEvent } from "react";

import type {
  GuidePack,
  DiscoveredPlace,
  TripProgress, GuideMsg
} from "@/lib/types/guide";
import { haptic } from "@/lib/native/haptics";

import type { LucideIcon } from "lucide-react";
import {
  Search,
  Sparkles,
  MapPin,
  Fuel,
  Tent,
  Bath,
  Droplets,
  Building2,
  ShoppingCart,
  Wrench,
  Hospital,
  Pill,
  Coffee,
  Utensils,
  TreePine,
  Eye,
  Waves,
  Bed,
  Phone,
  Link2,
  ParkingMeter,
  Target,
  Camera,
  Zap,
  Wine,
  Beer,
  Info,
  Mountain,
  Landmark,
  Baby,
  Trash2,
  Banknote,
  Shirt,
  Thermometer,
  Star,
  Store,
  Globe,
  Compass,
  Dog,
  Film,
  Fish,
  BookOpen,
  Flag,
  ExternalLink,
  Plus,
  Send,
  ChevronRight,
  Bookmark,
  Check,
} from "lucide-react";

// ══════════════════════════════════════════════════════════════
// CATEGORY COLOR SYSTEM
// Each category group gets a unique accent color for visual
// differentiation across the entire UI.
// ══════════════════════════════════════════════════════════════

type ColorDef = { bg: string; fg: string; accent: string; soft: string };

const CAT_COLORS: Record<string, ColorDef> = {
  // Safety - amber/warm
  fuel:         { bg: "rgba(245,158,11,0.10)", fg: "#d97706", accent: "#f59e0b", soft: "rgba(245,158,11,0.06)" },
  ev_charging:  { bg: "rgba(16,185,129,0.10)", fg: "#059669", accent: "#10b981", soft: "rgba(16,185,129,0.06)" },
  rest_area:    { bg: "rgba(245,158,11,0.10)", fg: "#d97706", accent: "#f59e0b", soft: "rgba(245,158,11,0.06)" },
  toilet:       { bg: "rgba(100,116,139,0.10)", fg: "#64748b", accent: "#94a3b8", soft: "rgba(100,116,139,0.06)" },
  water:        { bg: "rgba(59,130,246,0.10)",  fg: "#2563eb", accent: "#3b82f6", soft: "rgba(59,130,246,0.06)" },
  dump_point:   { bg: "rgba(100,116,139,0.10)", fg: "#64748b", accent: "#94a3b8", soft: "rgba(100,116,139,0.06)" },
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

const DEFAULT_COLOR: ColorDef = { bg: "rgba(100,116,139,0.10)", fg: "#64748b", accent: "#94a3b8", soft: "rgba(100,116,139,0.06)" };

function catColor(cat: string): ColorDef {
  return CAT_COLORS[cat] ?? DEFAULT_COLOR;
}

// ──────────────────────────────────────────────────────────────
// Constants - category chips + icon map
// ──────────────────────────────────────────────────────────────

type Chip = { key: PlaceCategory; label: string; Icon: LucideIcon };

const CHIPS: Chip[] = [
  { key: "fuel", label: "Fuel", Icon: Fuel },
  { key: "ev_charging", label: "EV", Icon: Zap },
  { key: "rest_area", label: "Rest", Icon: ParkingMeter },
  { key: "toilet", label: "Toilets", Icon: Bath },
  { key: "water", label: "Water", Icon: Droplets },
  { key: "bakery", label: "Bakery", Icon: Star },
  { key: "cafe", label: "Café", Icon: Coffee },
  { key: "restaurant", label: "Food", Icon: Utensils },
  { key: "fast_food", label: "Takeaway", Icon: Utensils },
  { key: "pub", label: "Pub", Icon: Beer },
  { key: "camp", label: "Camp", Icon: Tent },
  { key: "motel", label: "Motel", Icon: Bed },
  { key: "hotel", label: "Hotel", Icon: Bed },
  { key: "viewpoint", label: "Views", Icon: Eye },
  { key: "beach", label: "Beach", Icon: Waves },
  { key: "swimming_hole", label: "Swim", Icon: Waves },
  { key: "waterfall", label: "Waterfall", Icon: Droplets },
  { key: "national_park", label: "Parks", Icon: TreePine },
  { key: "hiking", label: "Hiking", Icon: Mountain },
  { key: "picnic", label: "Picnic", Icon: TreePine },
  { key: "hot_spring", label: "Hot Spring", Icon: Thermometer },
  { key: "cave", label: "Cave", Icon: Mountain },
  { key: "fishing", label: "Fishing", Icon: Fish },
  { key: "surf", label: "Surf", Icon: Waves },
  { key: "playground", label: "Kids", Icon: Baby },
  { key: "pool", label: "Pool", Icon: Waves },
  { key: "zoo", label: "Zoo", Icon: Compass },
  { key: "theme_park", label: "Theme Park", Icon: Star },
  { key: "dog_park", label: "Dog Park", Icon: Dog },
  { key: "golf", label: "Golf", Icon: Flag },
  { key: "cinema", label: "Cinema", Icon: Film },
  { key: "winery", label: "Wine", Icon: Wine },
  { key: "brewery", label: "Brew", Icon: Beer },
  { key: "visitor_info", label: "Info", Icon: Info },
  { key: "museum", label: "Museum", Icon: Landmark },
  { key: "gallery", label: "Gallery", Icon: Landmark },
  { key: "heritage", label: "Heritage", Icon: Landmark },
  { key: "attraction", label: "Sights", Icon: Camera },
  { key: "market", label: "Market", Icon: Store },
  { key: "library", label: "Library", Icon: BookOpen },
  { key: "showground", label: "Showground", Icon: Flag },
  { key: "grocery", label: "Grocery", Icon: ShoppingCart },
  { key: "town", label: "Towns", Icon: Building2 },
  { key: "atm", label: "ATM", Icon: Banknote },
  { key: "laundromat", label: "Laundry", Icon: Shirt },
  { key: "dump_point", label: "Dump", Icon: Trash2 },
  { key: "mechanic", label: "Mechanic", Icon: Wrench },
  { key: "hospital", label: "Hospital", Icon: Hospital },
  { key: "pharmacy", label: "Pharmacy", Icon: Pill },
];

const CATEGORY_ICON: Record<string, LucideIcon> = {};
for (const c of CHIPS) CATEGORY_ICON[c.key] = c.Icon;

type ViewTab = "chat" | "discoveries";

// ──────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────

function fmtCategory(c?: string) {
  return (c ?? "").replace(/_/g, " ");
}

function fmtDist(km?: number | null) {
  if (km == null) return null;
  if (km < 1) return `${Math.round(km * 1000)} m`;
  return `${km.toFixed(1)} km`;
}

function safeOpen(url: string) {
  try {
    window.open(url, "_blank", "noopener,noreferrer");
  } catch {}
}

function normalizeUrl(raw: string) {
  const s = raw.trim();
  if (!s) return null;
  if (/^https?:\/\//i.test(s)) return s;
  if (/^www\./i.test(s)) return `https://${s}`;
  if (/^[a-z0-9.-]+\.[a-z]{2,}(\/|$)/i.test(s)) return `https://${s}`;
  return null;
}

function normalizeUrlKey(normUrl: string) {
  try {
    const u = new URL(normUrl);
    const host = (u.host || "").toLowerCase().replace(/^www\./, "");
    const path = (u.pathname || "/").replace(/\/+$/, "") || "/";
    return `${host}${path}`;
  } catch {
    return normUrl.toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/+$/, "");
  }
}

function cleanPhone(raw: string) {
  const trimmed = raw.trim();
  const keepPlus = trimmed.startsWith("+");
  const digits = trimmed.replace(/[^\d]/g, "");
  if (digits.length < 8 || digits.length > 15) return null;
  return (keepPlus ? "+" : "") + digits;
}

function stopEvent(e: SyntheticEvent) {
  e.stopPropagation();
}

// ──────────────────────────────────────────────────────────────
// Markdown action extraction (fallback for old messages)
// ──────────────────────────────────────────────────────────────

type FallbackAction =
  | { type: "web"; url: string; label: string }
  | { type: "call"; tel: string; label: string };

function extractActionsFromMarkdown(text: string): FallbackAction[] {
  if (!text) return [];
  const actions: FallbackAction[] = [];
  const seenWeb = new Set<string>();
  const seenTel = new Set<string>();
  const lines = text.split(/\r?\n/);
  const markdownLinkRegex = /\[([^\]]+)\]\(([^)]+)\)/g;
  const urlRegex = /(https?:\/\/[^\s)>\]]+|www\.[^\s)>\]]+|[a-z0-9.-]+\.[a-z]{2,}(\/[^\s)>\]]*)?)/gi;
  const phoneRegex = /(\+?\d[\d\s().-]{6,}\d)/g;

  const cleanName = (s: string | null | undefined) => {
    const t = (s ?? "").trim();
    if (!t) return null;
    return t.replace(/^\s*(?:\d+\.)?\s*[-*•]?\s*/, "").trim() || null;
  };

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;
    const bold = line.match(/\*\*(.+?)\*\*/);
    const lineName = cleanName(bold?.[1]);

    const strippedLine = line.replace(markdownLinkRegex, (_m, _lbl, urlRaw) => {
      const href = normalizeUrl(String(urlRaw)) ?? String(urlRaw).trim();
      if (href) {
        const key = normalizeUrlKey(href);
        if (!seenWeb.has(key)) {
          seenWeb.add(key);
          actions.push({ type: "web", url: href, label: lineName ?? "Website" });
        }
      }
      return " ";
    });

    const urlMatches = Array.from(strippedLine.matchAll(urlRegex));
    for (const m of urlMatches) {
      const norm = normalizeUrl(m[0]);
      if (!norm) continue;
      const key = normalizeUrlKey(norm);
      if (seenWeb.has(key)) continue;
      seenWeb.add(key);
      actions.push({ type: "web", url: norm, label: lineName ?? "Website" });
    }

    const phoneMatches = Array.from(line.matchAll(phoneRegex));
    for (const m of phoneMatches) {
      const tel = cleanPhone(m[0]);
      if (!tel) continue;
      const telKey = tel.replace(/[^\d+]/g, "");
      if (seenTel.has(telKey)) continue;
      seenTel.add(telKey);
      actions.push({ type: "call", tel, label: lineName ? `Call ${lineName}` : "Call" });
    }
  }

  return actions.slice(0, 10);
}

// ──────────────────────────────────────────────────────────────
// Action pill component
// ──────────────────────────────────────────────────────────────

function ActionPill({
  Icon,
  label,
  onClick,
  href,
  muted,
  color,
}: {
  Icon: LucideIcon;
  label: string;
  onClick?: () => void;
  href?: string;
  muted?: boolean;
  color?: string;
}) {
  const accentColor = color ?? "var(--brand-sky)";
  const baseStyle: React.CSSProperties = {
    borderRadius: 10,
    minHeight: 34,
    padding: "0 12px",
    fontWeight: 700,
    fontSize: 12,
    border: `1px solid ${muted ? "var(--roam-border)" : accentColor + "30"}`,
    background: muted ? "transparent" : accentColor + "0D",
    color: muted ? "var(--roam-text-muted)" : accentColor,
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    cursor: muted ? "default" : "pointer",
    textDecoration: "none",
    userSelect: "none",
    WebkitTapHighlightColor: "transparent",
    transition: "all 0.15s ease",
  };

  if (href) {
    return (
      <a href={href} style={baseStyle} onPointerDown={stopEvent} onTouchStart={stopEvent} onClick={stopEvent}>
        <Icon size={13} />
        <span style={{ maxWidth: 180, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{label}</span>
      </a>
    );
  }

  return (
    <button
      type="button"
      style={baseStyle}
      onPointerDown={stopEvent}
      onTouchStart={stopEvent}
      onClick={(e) => { stopEvent(e); onClick?.(); }}
    >
      <Icon size={13} />
      <span style={{ maxWidth: 180, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{label}</span>
    </button>
  );
}

// ──────────────────────────────────────────────────────────────
// Message actions row
// ──────────────────────────────────────────────────────────────

function MessageActionsRow({
  msg, isOnline, onShowOnMap, discoveredIds, onSwitchToFound,
}: {
  msg: GuideMsg; isOnline: boolean;
  onShowOnMap?: (lat: number, lng: number, placeId?: string) => void;
  discoveredIds?: Set<string>;
  onSwitchToFound?: () => void;
}) {
  const structured = msg.actions ?? [];
  const fallback = useMemo(() => {
    if (structured.length > 0) return [];
    return extractActionsFromMarkdown(msg.content ?? "");
  }, [msg.content, structured.length]);

  // Count how many save actions are in this message (for the "View in Found" CTA)
  const saveCount = structured.filter((a) => a.type === "save").length;

  if (structured.length === 0 && fallback.length === 0) return null;

  return (
    <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
        {structured.map((a, idx) => {
          if (a.type === "web" && a.url) {
            return (
              <ActionPill
                key={`sa_web_${idx}_${a.place_id ?? idx}`}
                Icon={ExternalLink}
                label={a.label}
                onClick={isOnline ? () => { haptic.selection(); safeOpen(a.url!); } : () => haptic.selection()}
                muted={!isOnline}
              />
            );
          }
          if (a.type === "call" && a.tel) {
            return <ActionPill key={`sa_call_${idx}_${a.place_id ?? idx}`} Icon={Phone} label={a.label} href={`tel:${a.tel}`} color="#10b981" />;
          }
          if (a.type === "map" && a.lat != null && a.lng != null) {
            return (
              <ActionPill
                key={`sa_map_${idx}_${a.place_id ?? idx}`}
                Icon={MapPin}
                label={a.label}
                onClick={() => { haptic.selection(); onShowOnMap?.(a.lat!, a.lng!, a.place_id ?? undefined); }}
                color="#6366f1"
              />
            );
          }
          if (a.type === "save") {
            const isSaved = a.place_id ? discoveredIds?.has(a.place_id) : true;
            return (
              <ActionPill
                key={`sa_save_${idx}_${a.place_id ?? idx}`}
                Icon={isSaved ? Check : Bookmark}
                label={isSaved ? `Saved · ${a.place_name ?? a.label}` : a.label}
                onClick={() => { haptic.selection(); onSwitchToFound?.(); }}
                color="#10b981"
              />
            );
          }
          return null;
        })}
        {fallback.map((a, idx) => {
          if (a.type === "web") {
            return (
              <ActionPill
                key={`fb_web_${idx}`}
                Icon={Link2}
                label={a.label}
                onClick={isOnline ? () => { haptic.selection(); safeOpen(a.url); } : () => haptic.selection()}
                muted={!isOnline}
              />
            );
          }
          return <ActionPill key={`fb_call_${idx}`} Icon={Phone} label={a.label} href={`tel:${a.tel}`} color="#10b981" />;
        })}
      </div>

      {/* Found tab CTA when places were saved */}
      {saveCount > 0 && onSwitchToFound ? (
        <button
          type="button"
          onClick={() => { haptic.selection(); onSwitchToFound(); }}
          style={{
            padding: "6px 12px", borderRadius: 10,
            border: "1px solid rgba(16,185,129,0.15)", background: "rgba(16,185,129,0.06)",
            color: "#10b981", fontSize: 12, fontWeight: 700, cursor: "pointer",
            display: "inline-flex", alignItems: "center", gap: 6, alignSelf: "flex-start",
          }}
        >
          <Bookmark size={13} />
          {saveCount === 1 ? "View in Found" : `${saveCount} places saved · View all`}
          <ChevronRight size={13} />
        </button>
      ) : null}
    </div>
  );
}

// ──────────────────────────────────────────────────────────────
// Minimal safe Markdown renderer
// ──────────────────────────────────────────────────────────────

type MdNode =
  | { t: "p"; inl: InlineNode[] }
  | { t: "h"; level: 1 | 2 | 3; inl: InlineNode[] }
  | { t: "ul"; items: InlineNode[][] }
  | { t: "ol"; items: InlineNode[][] }
  | { t: "codeblock"; code: string };

type InlineNode =
  | { t: "text"; s: string }
  | { t: "strong"; c: InlineNode[] }
  | { t: "em"; c: InlineNode[] }
  | { t: "code"; s: string }
  | { t: "link"; href: string; c: InlineNode[] };

function parseInline(s: string): InlineNode[] {
  const out: InlineNode[] = [];
  let i = 0;
  const pushText = (txt: string) => { if (txt) out.push({ t: "text", s: txt }); };

  while (i < s.length) {
    if (s[i] === "`") {
      const j = s.indexOf("`", i + 1);
      if (j > i + 1) { pushText(s.slice(0, i)); out.push({ t: "code", s: s.slice(i + 1, j) }); s = s.slice(j + 1); i = 0; continue; }
    }
    if (s[i] === "[") {
      const close = s.indexOf("]", i + 1);
      if (close > i + 1 && s[close + 1] === "(") {
        const endParen = s.indexOf(")", close + 2);
        if (endParen > close + 2) {
          const label = s.slice(i + 1, close);
          const urlRaw = s.slice(close + 2, endParen);
          pushText(s.slice(0, i));
          out.push({ t: "link", href: normalizeUrl(urlRaw) ?? urlRaw, c: parseInline(label) });
          s = s.slice(endParen + 1); i = 0; continue;
        }
      }
    }
    if (s[i] === "*" && s[i + 1] === "*") {
      const j = s.indexOf("**", i + 2);
      if (j > i + 2) { pushText(s.slice(0, i)); out.push({ t: "strong", c: parseInline(s.slice(i + 2, j)) }); s = s.slice(j + 2); i = 0; continue; }
    }
    if (s[i] === "*") {
      const j = s.indexOf("*", i + 1);
      if (j > i + 1) { pushText(s.slice(0, i)); out.push({ t: "em", c: parseInline(s.slice(i + 1, j)) }); s = s.slice(j + 1); i = 0; continue; }
    }
    i++;
  }
  pushText(s);
  return out;
}

function parseMarkdown(md: string): MdNode[] {
  const lines = (md ?? "").replace(/\r\n/g, "\n").split("\n");
  const nodes: MdNode[] = [];
  let i = 0;
  const flushParagraph = (buf: string[]) => {
    const text = buf.join("\n").trimEnd();
    if (text.trim()) nodes.push({ t: "p", inl: parseInline(text) });
  };

  while (i < lines.length) {
    const line = lines[i];
    if (line.trimStart().startsWith("```")) {
      const buf: string[] = [];
      i++;
      while (i < lines.length && !lines[i].trimStart().startsWith("```")) { buf.push(lines[i]); i++; }
      if (i < lines.length) i++;
      nodes.push({ t: "codeblock", code: buf.join("\n") });
      continue;
    }
    const hm = /^(#{1,3})\s+(.*)$/.exec(line.trim());
    if (hm) {
      nodes.push({ t: "h", level: Math.min(3, hm[1].length) as 1 | 2 | 3, inl: parseInline(hm[2] ?? "") });
      i++; continue;
    }
    if (/^\s*[-*]\s+/.test(line)) {
      const items: InlineNode[][] = [];
      while (i < lines.length && /^\s*[-*]\s+/.test(lines[i])) { items.push(parseInline(lines[i].replace(/^\s*[-*]\s+/, ""))); i++; }
      nodes.push({ t: "ul", items }); continue;
    }
    if (/^\s*\d+\.\s+/.test(line)) {
      const items: InlineNode[][] = [];
      while (i < lines.length && /^\s*\d+\.\s+/.test(lines[i])) { items.push(parseInline(lines[i].replace(/^\s*\d+\.\s+/, ""))); i++; }
      nodes.push({ t: "ol", items }); continue;
    }
    if (!line.trim()) { i++; continue; }
    const pbuf: string[] = [];
    while (i < lines.length && lines[i].trim() && !lines[i].trimStart().startsWith("```") && !/^(#{1,3})\s+/.test(lines[i].trim()) && !/^\s*[-*]\s+/.test(lines[i]) && !/^\s*\d+\.\s+/.test(lines[i])) { pbuf.push(lines[i]); i++; }
    flushParagraph(pbuf);
  }
  return nodes;
}

function renderInline(nodes: InlineNode[], keyPrefix: string, inLink = false) {
  const out: React.ReactNode[] = [];
  for (let i = 0; i < nodes.length; i++) {
    const n = nodes[i];
    const k = `${keyPrefix}_${i}`;
    if (n.t === "text") {
      if (!inLink) {
        const parts = n.s.split(/(https?:\/\/[^\s)>\]]+|www\.[^\s)>\]]+)/g);
        for (let pi = 0; pi < parts.length; pi++) {
          const p = parts[pi];
          const maybe = normalizeUrl(p);
          if (maybe) {
            out.push(<a key={`${k}_u_${pi}`} href={maybe} target="_blank" rel="noopener noreferrer" style={{ color: "var(--brand-sky)", textDecoration: "underline", textUnderlineOffset: 2 }} onClick={(e) => e.stopPropagation()}>{p}</a>);
          } else { out.push(<span key={`${k}_t_${pi}`}>{p}</span>); }
        }
      } else { out.push(<span key={k}>{n.s}</span>); }
    } else if (n.t === "code") {
      out.push(<code key={k} style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace", fontSize: "0.9em", background: "rgba(0,0,0,0.08)", padding: "2px 6px", borderRadius: 5 }}>{n.s}</code>);
    } else if (n.t === "strong") {
      out.push(<strong key={k} style={{ fontWeight: 800, color: "var(--roam-text)" }}>{renderInline(n.c, k, inLink)}</strong>);
    } else if (n.t === "em") {
      out.push(<em key={k} style={{ fontStyle: "italic" }}>{renderInline(n.c, k, inLink)}</em>);
    } else if (n.t === "link") {
      out.push(<a key={k} href={normalizeUrl(n.href) ?? n.href} target="_blank" rel="noopener noreferrer" style={{ color: "var(--brand-sky)", textDecoration: "underline", textUnderlineOffset: 2 }} onClick={(e) => e.stopPropagation()}>{renderInline(n.c, k, true)}</a>);
    }
  }
  return out;
}

function MarkdownBody({ text }: { text: string }) {
  const nodes = useMemo(() => parseMarkdown(text ?? ""), [text]);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      {nodes.map((n, idx) => {
        const k = `md_${idx}`;
        if (n.t === "codeblock") {
          return (<pre key={k} style={{ margin: 0, padding: "10px 12px", borderRadius: 10, background: "rgba(0,0,0,0.08)", overflowX: "auto", fontSize: 12, lineHeight: 1.4 }}><code style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace" }}>{n.code}</code></pre>);
        }
        if (n.t === "h") {
          return (<div key={k} style={{ fontSize: n.level === 1 ? 15 : 14, fontWeight: 800, color: "var(--roam-text)", marginTop: 2 }}>{renderInline(n.inl, k)}</div>);
        }
        if (n.t === "ul" || n.t === "ol") {
          const Tag = n.t === "ul" ? "ul" : "ol";
          return (<Tag key={k} style={{ margin: 0, paddingLeft: 18, lineHeight: 1.45 }}>{n.items.map((it, ii) => (<li key={`${k}_li_${ii}`} style={{ margin: "3px 0" }}>{renderInline(it, `${k}_li_${ii}`)}</li>))}</Tag>);
        }
        return (<div key={k} style={{ lineHeight: 1.45, whiteSpace: "pre-wrap" }}>{renderInline(n.inl, k)}</div>);
      })}
    </div>
  );
}

// ──────────────────────────────────────────────────────────────
// Extra badges - rich metadata pills with category coloring
// ──────────────────────────────────────────────────────────────

function ExtraBadges({ place }: { place: PlaceItem }) {
  const extra: Record<string, unknown> = (place.extra ?? {}) as Record<string, unknown>;
  const cc = catColor(place.category);
  const badges: { label: string; accent?: boolean }[] = [];

  if (extra.free) badges.push({ label: "Free", accent: true });
  if (extra.powered_sites) badges.push({ label: "Powered" });
  if (extra.has_water) badges.push({ label: "Water" });
  if (extra.has_toilets) badges.push({ label: "Toilets" });
  if (extra.fuel_types && Array.isArray(extra.fuel_types)) {
    const fuels = extra.fuel_types as string[];
    if (fuels.includes("diesel")) badges.push({ label: "Diesel" });
    if (fuels.includes("lpg")) badges.push({ label: "LPG" });
    if (fuels.includes("adblue")) badges.push({ label: "AdBlue" });
  }
  if (extra.socket_types && Array.isArray(extra.socket_types)) {
    const display = (extra.socket_types as string[]).slice(0, 2).map((s: string) => s.replace(/_/g, " ")).join(", ");
    if (display) badges.push({ label: display });
  }
  if (extra.opening_hours) {
    const hrs = String(extra.opening_hours);
    if (hrs.length <= 20) badges.push({ label: hrs });
  }

  if (badges.length === 0) return null;

  return (
    <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginTop: 6 }}>
      {badges.map((b, i) => (
        <span
          key={i}
          style={{
            fontSize: 10,
            fontWeight: 700,
            padding: "2px 8px",
            borderRadius: 5,
            background: b.accent ? "rgba(16,185,129,0.12)" : cc.bg,
            color: b.accent ? "#059669" : cc.fg,
            whiteSpace: "nowrap",
            letterSpacing: 0.2,
          }}
        >
          {b.label}
        </span>
      ))}
    </div>
  );
}

// ──────────────────────────────────────────────────────────────
// Typing indicator - animated dots
// ──────────────────────────────────────────────────────────────

function TypingDots() {
  return (
    <div style={{ display: "flex", gap: 4, alignItems: "center", padding: "4px 0" }}>
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          style={{
            width: 7,
            height: 7,
            borderRadius: "50%",
            background: "var(--brand-sky)",
            opacity: 0.5,
            animation: `guideTyping 1.2s ease-in-out ${i * 0.2}s infinite`,
          }}
        />
      ))}
    </div>
  );
}

// ──────────────────────────────────────────────────────────────
// Place card - with category accent stripe
// ──────────────────────────────────────────────────────────────

function PlaceCard({
  place,
  isFocused,
  onFocus,
  onAdd,
  onShowOnMap,
  isOnline,
}: {
  place: PlaceItem | DiscoveredPlace;
  isFocused: boolean;
  onFocus: () => void;
  onAdd: () => void;
  onShowOnMap?: () => void;
  isOnline: boolean;
}) {
  const extra: Record<string, unknown> = (place.extra ?? {}) as Record<string, unknown>;
  const suburb = extra["addr:suburb"] || extra["addr:city"] || extra.address;
  const phone = extra.phone as string | undefined;
  const website = extra.website as string | undefined;
  const guideDesc = (place as DiscoveredPlace).guide_description;
  const cc = catColor(place.category);
  const CatIcon = CATEGORY_ICON[place.category] ?? MapPin;
  const dist = fmtDist((place as DiscoveredPlace).distance_from_user_km);

  function handleCardClick(e: MouseEvent<HTMLDivElement>) {
    const t = e.target as HTMLElement | null;
    if (!t) return onFocus();
    if (t.closest("button,a,input,textarea,select,[role='button']")) return;
    onFocus();
  }

  const stop = (e: SyntheticEvent) => e.stopPropagation();

  return (
    <div
      onClick={handleCardClick}
      style={{
        display: "flex",
        overflow: "hidden",
        borderRadius: 16,
        cursor: "pointer",
        background: "var(--roam-surface)",
        border: isFocused ? `2px solid ${cc.accent}` : "1px solid var(--roam-border, rgba(255,255,255,0.06))",
        transition: "border-color 0.15s, box-shadow 0.15s",
        boxShadow: isFocused ? `0 0 0 3px ${cc.accent}20` : "0 1px 3px rgba(0,0,0,0.06)",
      }}
    >
      {/* Category accent stripe */}
      <div style={{ width: 5, flexShrink: 0, background: cc.accent, borderRadius: "16px 0 0 16px" }} />

      <div style={{ flex: 1, padding: "12px 14px", display: "flex", flexDirection: "column", gap: 8 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {/* Category icon with colored background */}
          <div
            style={{
              width: 38,
              height: 38,
              borderRadius: 10,
              background: cc.bg,
              color: cc.fg,
              display: "grid",
              placeItems: "center",
              flexShrink: 0,
            }}
          >
            <CatIcon size={18} />
          </div>

          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: "var(--roam-text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1, minWidth: 0 }}>
                {place.name}
              </div>
              <div style={{ display: "flex", gap: 5, flexShrink: 0 }} onPointerDown={stop} onTouchStart={stop}>
                <button
                  type="button"
                  onClick={(e) => { stop(e); haptic.medium(); onAdd(); }}
                  style={{
                    borderRadius: 8, height: 28, padding: "0 10px",
                    fontWeight: 700, fontSize: 11, border: "none",
                    background: cc.accent, color: "white",
                    cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 4,
                    WebkitTapHighlightColor: "transparent",
                  }}
                >
                  <Plus size={11} />
                  Add
                </button>
                {onShowOnMap ? (
                  <button
                    type="button"
                    onClick={(e) => { stop(e); haptic.selection(); onFocus(); onShowOnMap?.(); }}
                    style={{
                      borderRadius: 8, height: 28, padding: "0 10px",
                      fontWeight: 700, fontSize: 11,
                      border: `1px solid var(--roam-border, rgba(255,255,255,0.08))`,
                      background: "transparent", color: "var(--roam-text)", cursor: "pointer",
                      display: "inline-flex", alignItems: "center", gap: 4,
                      WebkitTapHighlightColor: "transparent",
                    }}
                  >
                    <MapPin size={11} />
                    Map
                  </button>
                ) : null}
              </div>
            </div>
            <div style={{ fontSize: 12, color: "var(--roam-text-muted)", marginTop: 2, display: "flex", gap: 6, flexWrap: "wrap", fontWeight: 500 }}>
              <span style={{ color: cc.fg, fontWeight: 600 }}>{fmtCategory(place.category)}</span>
              {suburb ? <span>· {typeof suburb === "string" ? suburb.split(",")[0] : suburb}</span> : null}
              {dist ? <span style={{ fontWeight: 600 }}>· {dist}</span> : null}
            </div>
            <ExtraBadges place={place} />
          </div>
        </div>

        {/* AI description — prose listing from the guide */}
        {guideDesc ? (
          <div style={{
            fontSize: 13, fontWeight: 500, lineHeight: 1.5,
            color: "var(--roam-text-muted)",
            padding: "4px 0 2px",
            borderTop: "1px solid var(--roam-border, rgba(255,255,255,0.04))",
          }}>
            {guideDesc}
          </div>
        ) : null}

        {/* Secondary action buttons (call, web) */}
        {(phone || (isOnline && website)) ? (
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {phone ? (
            <a
              href={`tel:${phone}`}
              onPointerDown={stop} onTouchStart={stop} onClick={stop}
              style={{
                textDecoration: "none", display: "inline-flex", alignItems: "center", justifyContent: "center",
                borderRadius: 10, minHeight: 34, padding: "0 12px",
                fontWeight: 700, fontSize: 12, gap: 5,
                border: `1px solid var(--roam-border, rgba(255,255,255,0.08))`,
                background: "transparent", color: "var(--roam-success)",
              }}
            >
              <Phone size={13} />
              Call
            </a>
          ) : null}

          {isOnline && website ? (
            <button
              type="button"
              onPointerDown={stop} onTouchStart={stop}
              onClick={(e) => { stop(e); haptic.selection(); const norm = normalizeUrl(String(website)); if (norm) safeOpen(norm); }}
              style={{
                borderRadius: 10, minHeight: 34, padding: "0 12px",
                fontWeight: 700, fontSize: 12,
                border: `1px solid var(--roam-border, rgba(255,255,255,0.08))`,
                background: "transparent", color: "var(--brand-sky)", cursor: "pointer",
                display: "inline-flex", alignItems: "center", gap: 5,
              }}
            >
              <Globe size={13} />
              Web
            </button>
          ) : null}
        </div>
        ) : null}
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────
// Discovery group - colored header
// ──────────────────────────────────────────────────────────────

function DiscoveryGroup({
  category, places, focusedPlaceId, onFocusPlace, onAddStop, onShowOnMap, isOnline,
}: {
  category: string; places: DiscoveredPlace[]; focusedPlaceId: string | null;
  onFocusPlace: (id: string | null) => void; onAddStop: (place: PlaceItem) => void;
  onShowOnMap?: (placeId: string, lat: number, lng: number) => void; isOnline: boolean;
}) {
  const Icon = CATEGORY_ICON[category] ?? MapPin;
  const cc = catColor(category);
  const label = fmtCategory(category);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {/* Group header with category color */}
      <div style={{
        display: "flex", alignItems: "center", gap: 8, padding: "8px 12px",
        background: cc.soft, borderRadius: 12,
      }}>
        <div style={{ width: 28, height: 28, borderRadius: 8, background: cc.bg, color: cc.fg, display: "grid", placeItems: "center" }}>
          <Icon size={15} />
        </div>
        <span style={{ fontSize: 14, fontWeight: 700, color: cc.fg, textTransform: "capitalize" }}>{label}</span>
        <span style={{ fontSize: 11, fontWeight: 700, color: cc.fg, background: cc.bg, borderRadius: 999, padding: "2px 8px", marginLeft: "auto" }}>
          {places.length}
        </span>
      </div>

      {places.slice(0, 8).map((p) => (
        <PlaceCard
          key={p.id} place={p} isFocused={focusedPlaceId === p.id}
          onFocus={() => onFocusPlace(p.id)} onAdd={() => onAddStop(p)}
          onShowOnMap={onShowOnMap ? () => onShowOnMap(p.id, p.lat, p.lng) : undefined} isOnline={isOnline}
        />
      ))}

      {places.length > 8 ? (
        <div style={{ textAlign: "center", fontSize: 12, fontWeight: 600, color: cc.fg, padding: 8 }}>
          +{places.length - 8} more {label.toLowerCase()}
        </div>
      ) : null}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ══════════════════════════════════════════════════════════════

export function GuideView({
  focusedPlaceId, onFocusPlace, onAddStop, isOnline = true, onShowOnMap,
  guideReady = false, guidePack, tripProgress, onSendMessage, chatBusy = false,
  initialTab, autoAskMessage, stickyTabsTop = 0,
}: {
  focusedPlaceId: string | null;
  onFocusPlace: (id: string | null) => void; onAddStop: (place: PlaceItem) => void;
  isOnline?: boolean; onShowOnMap?: (placeId: string, lat: number, lng: number) => void; guideReady?: boolean;
  guidePack?: GuidePack | null; tripProgress?: TripProgress | null;
  onSendMessage?: (text: string, preferredCategories: string[]) => Promise<string | undefined>;
  chatBusy?: boolean;
  /** If set, start on this tab (e.g. "discoveries" when offline) */
  initialTab?: "chat" | "discoveries";
  /** If set and online, auto-send this message once guide is ready */
  autoAskMessage?: string | null;
  /** px offset for sticky tab bar (header height) */
  stickyTabsTop?: number;
}) {
  const [chatInput, setChatInput] = useState("");
  const [activeTab, setActiveTab] = useState<ViewTab>(initialTab ?? "chat");
  const chatEndRef = useRef<HTMLDivElement>(null);
  const [pendingUserMsg, setPendingUserMsg] = useState<string | null>(null);
  const GUIDE_TABS: ViewTab[] = ["chat", "discoveries"];
  const trackRef = useRef<HTMLDivElement>(null);
  const guideSwipe = useRef<{ x: number; y: number; t: number; locked: boolean } | null>(null);

  function getTrackX(tab: ViewTab) {
    return -GUIDE_TABS.indexOf(tab) * 100;
  }

  function setTrackTransform(pct: number, animated: boolean) {
    const el = trackRef.current;
    if (!el) return;
    el.style.transition = animated ? "transform 0.28s cubic-bezier(0.25,0.46,0.45,0.94)" : "none";
    el.style.transform  = `translateX(${pct}%)`;
  }

  // Keep track in sync when activeTab changes via button click
  useEffect(() => {
    setTrackTransform(getTrackX(activeTab), true);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab]);

  function handleGuideSwipeStart(e: React.TouchEvent) {
    const t = e.touches[0];
    guideSwipe.current = { x: t.clientX, y: t.clientY, t: Date.now(), locked: false };
  }

  function handleGuideSwipeMove(e: React.TouchEvent) {
    if (!guideSwipe.current) return;
    const t  = e.touches[0];
    const dx = t.clientX - guideSwipe.current.x;
    const dy = t.clientY - guideSwipe.current.y;

    if (!guideSwipe.current.locked) {
      if (Math.abs(dx) < 8) return;
      if (Math.abs(dy) > Math.abs(dx)) { guideSwipe.current = null; return; }
      guideSwipe.current.locked = true;
    }

    const currentIndex = GUIDE_TABS.indexOf(activeTab);
    const W = trackRef.current?.offsetWidth ?? window.innerWidth;
    // rubber-band at edges
    const atEdge = (currentIndex === 0 && dx > 0) || (currentIndex === GUIDE_TABS.length - 1 && dx < 0);
    const offset = atEdge ? dx * 0.18 : dx;
    const basePct = getTrackX(activeTab);
    setTrackTransform(basePct + (offset / W) * 100, false);
  }

  function handleGuideSwipeEnd(e: React.TouchEvent) {
    if (!guideSwipe.current?.locked) { guideSwipe.current = null; return; }
    const t   = e.changedTouches[0];
    const dx  = t.clientX - guideSwipe.current.x;
    const dy  = t.clientY - guideSwipe.current.y;
    const dt  = Date.now() - guideSwipe.current.t;
    guideSwipe.current = null;

    if (Math.abs(dx) < Math.abs(dy) * 1.5) { setTrackTransform(getTrackX(activeTab), true); return; }

    const W        = trackRef.current?.offsetWidth ?? window.innerWidth;
    const velocity = Math.abs(dx) / dt;
    const commit   = Math.abs(dx) > W * 0.30 || velocity > 0.3;
    const currentIndex = GUIDE_TABS.indexOf(activeTab);

    if (commit && dx < 0 && currentIndex < GUIDE_TABS.length - 1) {
      haptic.selection();
      setActiveTab(GUIDE_TABS[currentIndex + 1]);
    } else if (commit && dx > 0 && currentIndex > 0) {
      haptic.selection();
      setActiveTab(GUIDE_TABS[currentIndex - 1]);
    } else {
      setTrackTransform(getTrackX(activeTab), true);
    }
  }

  // Filter out hidden system prompts (e.g., auto-greeting) from visible thread
  const thread = useMemo(
    () => (guidePack?.thread ?? []).filter(
      (m) => !(m.role === "user" && m.content.startsWith("[SYSTEM:"))
    ),
    [guidePack?.thread],
  );

  // Clear optimistic pending message once it appears in the actual thread
  // (pack updates via onPackUpdate before the full send completes)
  useEffect(() => {
    if (pendingUserMsg && thread.some((m) => m.role === "user" && m.content === pendingUserMsg)) {
      setPendingUserMsg(null);
    }
  }, [thread, pendingUserMsg]);
  const prevThreadLen = useRef(-1);
  useEffect(() => {
    if (thread.length !== prevThreadLen.current) {
      setTimeout(() => chatEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" }), 80);
      prevThreadLen.current = thread.length;
    }
  }, [thread.length]);
  useEffect(() => {
    if (chatBusy) {
      setTimeout(() => chatEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" }), 80);
    }
  }, [chatBusy]);

  // Auto-ask once guide becomes ready (triggered by "View in Guide" from map)
  const autoAskFiredRef = useRef(false);
  useEffect(() => {
    if (!autoAskMessage || autoAskFiredRef.current) return;
    if (!guideReady || !onSendMessage) return;
    autoAskFiredRef.current = true;
    setActiveTab("chat");
    onSendMessage(autoAskMessage, []).catch(() => {});
  }, [guideReady, autoAskMessage, onSendMessage]);

  const discoveredPlaces = useMemo(() => guidePack?.discovered_places ?? [], [guidePack?.discovered_places]);
  const discoveredIds = useMemo(() => new Set(discoveredPlaces.map((p) => p.id)), [discoveredPlaces]);

  const discoveryGroups = useMemo(() => {
    const groups: Record<string, DiscoveredPlace[]> = {};
    for (const p of discoveredPlaces) {
      const cat = p.category ?? "town";
      if (!groups[cat]) groups[cat] = [];
      groups[cat].push(p);
    }
    for (const cat of Object.keys(groups)) {
      groups[cat].sort((a, b) => (a.distance_from_user_km ?? 9999) - (b.distance_from_user_km ?? 9999));
    }
    const priorityOrder = [
      "fuel","ev_charging","rest_area","water","toilet","dump_point","hospital","pharmacy","mechanic",
      "bakery","cafe","restaurant","fast_food","pub","bar",
      "camp","motel","hotel","hostel","grocery","town","atm","laundromat",
      "viewpoint","waterfall","swimming_hole","beach","national_park","hiking","picnic","hot_spring",
      "playground","pool","zoo","theme_park",
      "visitor_info","winery","brewery","museum","gallery","heritage","attraction","market","park",
    ];
    const cats = Object.keys(groups).sort((a, b) => {
      const aN = priorityOrder.indexOf(a); const bN = priorityOrder.indexOf(b);
      return (aN >= 0 ? aN : 999) - (bN >= 0 ? bN : 999);
    });
    return cats.map((cat) => ({ category: cat, places: groups[cat] }));
  }, [discoveredPlaces]);

  // Quick suggestions - context-aware, inspiring, trip-phase-specific
  const quickSuggestions = useMemo(() => {
    const suggestions: { label: string; desc: string; query: string; Icon: LucideIcon; color: string }[] = [];

    if (tripProgress && tripProgress.total_km > 0) {
      const kmRemaining = tripProgress.km_remaining;
      const kmDone = tripProgress.km_from_start;
      const pct = kmDone / tripProgress.total_km;
      const hour = new Date().getHours();

      // Always-relevant safety
      suggestions.push({ label: "Next fuel", desc: "Don't get caught out", query: "Where's the next fuel stop ahead? How far is it and what brand?", Icon: Fuel, color: "#f59e0b" });

      // Time-of-day food suggestions
      if (hour >= 5 && hour < 9) {
        suggestions.push({ label: "Best pie nearby", desc: "Country bakeries ahead", query: "Any country bakeries ahead with good pies? I want the real deal.", Icon: Star, color: "#ea580c" });
      } else if (hour >= 9 && hour < 11) {
        suggestions.push({ label: "Coffee stop", desc: "Good cafes ahead", query: "Where's the best coffee ahead? Real cafe, not servo coffee.", Icon: Coffee, color: "#b45309" });
      } else if (hour >= 11 && hour < 14) {
        suggestions.push({ label: "Lunch spot", desc: "Pub meal or bakery", query: "Where should I stop for lunch? I want a proper feed — pub counter meal, bakery, or good cafe.", Icon: Utensils, color: "#f97316" });
      } else if (hour >= 14 && hour < 17) {
        suggestions.push({ label: "Arvo break", desc: "Stretch & explore", query: "Good spot for an afternoon break? Lookout, swimming hole, or a cold beer somewhere?", Icon: Eye, color: "#10b981" });
      } else if (hour >= 17 && hour < 20) {
        suggestions.push({ label: "Stay tonight", desc: "Camps, pubs & motels", query: "Where should I stay tonight? Show me the best options — camps, motels, or a pub with rooms.", Icon: Bed, color: "#8b5cf6" });
      } else {
        suggestions.push({ label: "Stop now", desc: "Closest safe option", query: "I need to stop for the night right now. What's the closest safe option — rest area, camp, or motel?", Icon: Tent, color: "#8b5cf6" });
      }

      // Phase-specific discovery
      if (pct < 0.35) {
        suggestions.push({ label: "Hidden gems", desc: "Detours worth taking", query: "Any hidden gems or interesting detours coming up? I've got time to explore.", Icon: Compass, color: "#6366f1" });
      } else if (pct < 0.65) {
        suggestions.push({ label: "Best ahead", desc: "Don't miss these", query: "What are the absolute must-see stops in the next 100km? Don't let me miss anything good.", Icon: Camera, color: "#6366f1" });
      }

      // Fatigue awareness
      if (kmDone > 150) {
        suggestions.push({ label: "Need a break", desc: "Stretch the legs", query: "Where's a good spot to stop and stretch? Scenic rest area, waterfall, or swimming hole — anything to break up the drive.", Icon: ParkingMeter, color: "#f59e0b" });
      }

      // Arriving
      if (kmRemaining < 80 && kmRemaining > 5) {
        suggestions.push({ label: "Arriving soon", desc: "What's at the destination", query: "I'm nearly there — what should I know about the destination? Where to eat tonight, any tips?", Icon: Target, color: "#10b981" });
      }

      // Nature / scenic always welcome
      suggestions.push({ label: "Swim spots", desc: "Gorges, falls & beaches", query: "Any swimming holes, waterfalls, or beaches ahead? Looking for somewhere to cool off.", Icon: Waves, color: "#0891b2" });

    } else {
      // Planning phase — no active trip progress
      suggestions.push({ label: "Route highlights", desc: "Best stops along the way", query: "What are the absolute must-see highlights along this route? Don't let me drive past anything amazing.", Icon: Camera, color: "#6366f1" });
      suggestions.push({ label: "Fuel planning", desc: "Where are the long gaps?", query: "Where are the fuel stops along this route? Are there any long gaps I should plan for?", Icon: Fuel, color: "#f59e0b" });
      suggestions.push({ label: "Best bakeries", desc: "Pies, slices & coffee", query: "Where are the best country bakeries along this route? I want legendary pies.", Icon: Star, color: "#ea580c" });
      suggestions.push({ label: "Camp spots", desc: "Free camps & parks", query: "What are the best camping spots along this route? Include free camps if there are any good ones.", Icon: Tent, color: "#8b5cf6" });
      suggestions.push({ label: "Swim & scenery", desc: "Gorges, falls & lookouts", query: "Any swimming holes, waterfalls, or scenic lookouts along this route?", Icon: Waves, color: "#0891b2" });
      suggestions.push({ label: "Pub stops", desc: "Cold beer & counter meals", query: "What are the best pubs along this route for a cold beer and a counter meal?", Icon: Beer, color: "#92400e" });
    }
    return suggestions.slice(0, 6);
  }, [tripProgress]);

  async function handleAsk(text?: string) {
    const msg = (text ?? chatInput).trim();
    if (!msg) return;
    haptic.medium();
    setChatInput("");
    setActiveTab("chat");
    if (!guideReady || !onSendMessage) return;
    setPendingUserMsg(msg);
    try { await onSendMessage(msg, []); } catch {}
    finally { setPendingUserMsg(null); }
  }

  function handleSubmit(e: React.FormEvent) { e.preventDefault(); handleAsk(); }

  // ── Render ─────────────────────────────────────────────────
  return (
    <div
      style={{ display: "flex", flexDirection: "column", gap: 12 }}
      onTouchStart={handleGuideSwipeStart}
      onTouchMove={handleGuideSwipeMove}
      onTouchEnd={handleGuideSwipeEnd}
    >
      {/* Scoped animations */}
      <style>{`
        @keyframes guideTyping { 0%,80%,100%{opacity:0.3;transform:scale(0.85)} 40%{opacity:1;transform:scale(1.1)} }
        @keyframes guideFadeIn { from{opacity:0;transform:translateY(6px)} to{opacity:1;transform:translateY(0)} }
        @keyframes guidePulse { 0%,100%{opacity:0.6} 50%{opacity:1} }
      `}</style>

      {/* ── Tab switcher ────────────────────────────────────── */}
      <div style={{ position: "sticky", top: stickyTabsTop, zIndex: 40, background: "var(--roam-bg)", paddingTop: 8, paddingBottom: 4 }}>
      <div style={{ display: "flex", gap: 2, background: "var(--roam-surface)", borderRadius: 14, padding: 3, border: "1px solid var(--roam-border, rgba(255,255,255,0.06))" }}>
        {([
          { key: "chat" as ViewTab, label: "Guide", Icon: Sparkles, badge: null },
          { key: "discoveries" as ViewTab, label: "Found", Icon: MapPin, badge: discoveredPlaces.length > 0 ? discoveredPlaces.length : null },
        ] as const).map((tab) => {
          const active = activeTab === tab.key;
          const TIcon = tab.Icon;
          return (
            <button
              key={tab.key}
              type="button"
              onClick={() => { haptic.selection(); setActiveTab(tab.key); }}
              style={{
                flex: 1, borderRadius: 11, border: "none", padding: "10px 8px",
                fontSize: 13, fontWeight: 700,
                background: active ? "var(--brand-sky)" : "transparent",
                color: active ? "white" : "var(--roam-text-muted)",
                display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
                cursor: "pointer", transition: "all 0.15s ease",
                WebkitTapHighlightColor: "transparent",
              }}
            >
              <TIcon size={14} />
              {tab.label}
              {tab.badge != null ? (
                <span style={{
                  fontSize: 10, fontWeight: 800, background: active ? "rgba(255,255,255,0.25)" : "var(--brand-sky)",
                  color: "white", borderRadius: 999, padding: "1px 6px", minWidth: 18, textAlign: "center",
                }}>
                  {tab.badge}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>
      </div>

      {/* ════════════════════════════════════════════════════════
          SLIDING TRACK — both tab panels always mounted
          ════════════════════════════════════════════════════════ */}
      <div style={{ overflow: "hidden" }}>
      <div
        ref={trackRef}
        style={{
          display: "flex",
          width: "200%",
          transform: `translateX(${getTrackX(activeTab)}%)`,
          willChange: "transform",
        }}
      >

      {/* ── TAB: CHAT (Guide) ─────────────────────────────── */}
      <div style={{ width: "50%", minWidth: 0 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>

          {/* Welcome state - when no messages yet */}
          {thread.length === 0 && !pendingUserMsg ? (
            <div style={{
              background: "var(--roam-surface)", borderRadius: 18, padding: "20px 16px",
              border: "1px solid var(--roam-border, rgba(255,255,255,0.06))",
            }}>
              {/* Guide identity header */}
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
                <div style={{
                  width: 40, height: 40, borderRadius: 12,
                  overflow: "hidden",
                  boxShadow: "0 2px 8px rgba(0,0,0,0.2)",
                  flexShrink: 0,
                }}>
                  <Image src="/img/roam-app-icon.png" alt="Roam" width={40} height={40} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                </div>
                <div>
                  <div style={{ fontSize: 16, fontWeight: 800, color: "var(--roam-text)" }}>
                    Roam Guide
                  </div>
                  <div style={{ fontSize: 12, fontWeight: 500, color: "var(--roam-text-muted)" }}>
                    {guideReady ? "Your AI road trip companion" : "Loading trip data…"}
                  </div>
                </div>
              </div>

              {/* Quick suggestions as cards */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                {quickSuggestions.map((s, i) => {
                  const SI = s.Icon;
                  return (
                    <button
                      key={i}
                      type="button"
                      onClick={() => handleAsk(s.query)}
                      disabled={!guideReady || chatBusy}
                      style={{
                        borderRadius: 14, border: "none",
                        padding: "12px", textAlign: "left",
                        background: `${s.color}0D`,
                        cursor: guideReady && !chatBusy ? "pointer" : "default",
                        opacity: !guideReady || chatBusy ? 0.5 : 1,
                        display: "flex", flexDirection: "column", gap: 6,
                        transition: "transform 0.1s var(--spring, ease), opacity 0.1s",
                        WebkitTapHighlightColor: "transparent",
                      }}
                    >
                      <div style={{
                        width: 30, height: 30, borderRadius: 9,
                        background: `${s.color}1A`, color: s.color,
                        display: "grid", placeItems: "center",
                      }}>
                        <SI size={15} />
                      </div>
                      <div style={{ fontSize: 13, fontWeight: 700, color: "var(--roam-text)" }}>
                        {s.label}
                      </div>
                      <div style={{ fontSize: 11, fontWeight: 500, color: "var(--roam-text-muted)", lineHeight: 1.3 }}>
                        {s.desc}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          ) : null}

          {/* Thread - chat messages */}
          {(thread.length > 0 || pendingUserMsg) ? (
            <div style={{
              display: "flex", flexDirection: "column", gap: 8,
              // Deduct: sticky header (~120px incl. progress bar) + tab switcher (42px) +
              // input bar (50px) + gaps (36px) + bottom nav + safe-area notch
              maxHeight: "calc(100dvh - 248px - var(--bottom-nav-height, 80px) - env(safe-area-inset-bottom, 0px) - var(--roam-keyboard-h, 0px))",
              overflowY: "auto", paddingRight: 2,
              WebkitOverflowScrolling: "touch", overscrollBehavior: "contain",
            }}>
              {thread.slice(-20).map((m, idx) => {
                const mine = m.role === "user";

                if (mine) {
                  return (
                    <div key={`${m.role}_${idx}`} style={{ display: "flex", justifyContent: "flex-end", animation: "guideFadeIn 0.2s ease" }}>
                      <div style={{
                        maxWidth: "85%", padding: "10px 14px", borderRadius: "16px 16px 4px 16px",
                        background: "var(--brand-sky)", color: "white",
                        fontSize: 14, fontWeight: 600, lineHeight: 1.4,
                        boxShadow: "0 1px 3px rgba(0,0,0,0.1)",
                      }}>
                        {m.content}
                      </div>
                    </div>
                  );
                }

                // Guide message
                return (
                  <div key={`${m.role}_${idx}`} style={{ animation: "guideFadeIn 0.3s ease" }}>
                    <div style={{
                      maxWidth: "92%",
                      display: "flex", gap: 8,
                    }}>
                      {/* Guide avatar */}
                      <div style={{
                        width: 28, height: 28, borderRadius: 8, flexShrink: 0, marginTop: 2,
                        overflow: "hidden",
                        boxShadow: "0 1px 3px rgba(0,0,0,0.15)",
                      }}>
                        <Image src="/img/roam-app-icon.png" alt="Roam" width={28} height={28} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                      </div>

                      <div style={{
                        flex: 1, padding: "10px 14px", borderRadius: "4px 16px 16px 16px",
                        background: "var(--roam-surface)",
                        border: "1px solid var(--roam-border, rgba(255,255,255,0.06))",
                        fontSize: 14, fontWeight: 500, lineHeight: 1.45,
                        color: "var(--roam-text)",
                      }}>
                        <MarkdownBody text={m.content ?? ""} />
                        {!mine ? (
                          <MessageActionsRow
                            msg={m} isOnline={!!isOnline}
                            discoveredIds={discoveredIds}
                            onShowOnMap={onShowOnMap ? (lat, lng, pid) => { onFocusPlace(pid ?? null); onShowOnMap(pid ?? `${lat}_${lng}`, lat, lng); } : undefined}
                            onSwitchToFound={() => setActiveTab("discoveries")}
                          />
                        ) : null}
                      </div>
                    </div>

                    {/* Discovery CTA — for tool-resolved messages without save actions */}
                    {m.resolved_tool_id && discoveredPlaces.length > 0 && !(m.actions ?? []).some((a) => a.type === "save") ? (
                      <button
                        type="button"
                        onClick={() => { haptic.selection(); setActiveTab("discoveries"); }}
                        style={{
                          marginTop: 6, marginLeft: 36, padding: "6px 12px",
                          borderRadius: 10, border: "1px solid rgba(59,130,246,0.15)",
                          background: "rgba(59,130,246,0.06)",
                          color: "var(--brand-sky)",
                          fontSize: 12, fontWeight: 700, cursor: "pointer",
                          display: "inline-flex", alignItems: "center", gap: 6,
                          animation: "guideFadeIn 0.3s ease",
                        }}
                      >
                        <MapPin size={13} />
                        View {discoveredPlaces.length} places
                        <ChevronRight size={13} />
                      </button>
                    ) : null}
                  </div>
                );
              })}

              {/* Optimistic user message shown immediately while awaiting response */}
              {pendingUserMsg ? (
                <div style={{ display: "flex", justifyContent: "flex-end", animation: "guideFadeIn 0.2s ease" }}>
                  <div style={{
                    maxWidth: "85%", padding: "10px 14px", borderRadius: "16px 16px 4px 16px",
                    background: "var(--brand-sky)", color: "white",
                    fontSize: 14, fontWeight: 600, lineHeight: 1.4,
                    boxShadow: "0 1px 3px rgba(0,0,0,0.1)",
                  }}>
                    {pendingUserMsg}
                  </div>
                </div>
              ) : null}

              {/* Typing indicator */}
              {chatBusy ? (
                <div style={{ display: "flex", gap: 8, animation: "guideFadeIn 0.2s ease" }}>
                  <div style={{
                    width: 28, height: 28, borderRadius: 8, flexShrink: 0,
                    overflow: "hidden",
                    boxShadow: "0 1px 3px rgba(0,0,0,0.15)",
                  }}>
                    <Image src="/img/roam-app-icon.png" alt="Roam" width={28} height={28} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                  </div>
                  <div style={{
                    padding: "12px 16px", borderRadius: "4px 16px 16px 16px",
                    background: "var(--roam-surface)",
                    border: "1px solid var(--roam-border, rgba(255,255,255,0.06))",
                  }}>
                    <TypingDots />
                  </div>
                </div>
              ) : null}

              <div ref={chatEndRef} />
            </div>
          ) : null}

          {/* Input bar - sticky so keyboard pushes it up */}
          <div style={{
            position: "sticky",
            bottom: 0,
            zIndex: 10,
            background: "var(--roam-bg)",
            paddingTop: 4,
            paddingBottom: "env(safe-area-inset-bottom, 0px)",
            display: "flex",
            flexDirection: "column",
            gap: 8,
          }}>
            <form onSubmit={handleSubmit} style={{ display: "flex", gap: 8 }}>
              <div style={{
                flex: 1, display: "flex", alignItems: "center",
                background: "var(--roam-surface)", borderRadius: 14,
                border: "1px solid var(--roam-border, rgba(255,255,255,0.06))",
                padding: "0 4px 0 16px",
                transition: "border-color 0.15s",
              }}>
                <input
                  type="text"
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  placeholder="Ask about your route…"
                  style={{
                    flex: 1, padding: "13px 0", border: "none", outline: "none",
                    fontSize: 14, fontWeight: 500, background: "transparent",
                    color: "var(--roam-text)",
                  }}
                />
                <button
                  type="submit"
                  disabled={!guideReady || chatBusy || !chatInput.trim()}
                  style={{
                    width: 36, height: 36, borderRadius: 10, border: "none",
                    background: chatInput.trim() ? "var(--brand-sky)" : "transparent",
                    color: chatInput.trim() ? "white" : "var(--roam-text-muted)",
                    cursor: chatInput.trim() ? "pointer" : "default",
                    display: "grid", placeItems: "center",
                    transition: "all 0.15s ease",
                    opacity: !guideReady || chatBusy ? 0.4 : 1,
                  }}
                >
                  <Send size={16} />
                </button>
              </div>
            </form>

            {/* Quick suggestions - compact row when thread has messages */}
            {(thread.length > 0 || pendingUserMsg) && !chatBusy ? (
              <div style={{ display: "flex", gap: 6, overflowX: "auto", paddingBottom: 2, WebkitOverflowScrolling: "touch" }}>
                {quickSuggestions.slice(0, 4).map((s, i) => {
                  const SI = s.Icon;
                  return (
                    <button
                      key={i} type="button"
                      onClick={() => handleAsk(s.query)}
                      disabled={!guideReady}
                      style={{
                        flex: "0 0 auto", borderRadius: 10, border: "none",
                        padding: "7px 11px", fontSize: 12, fontWeight: 700,
                        background: `${s.color}0D`, color: s.color,
                        cursor: "pointer", whiteSpace: "nowrap",
                        display: "flex", alignItems: "center", gap: 5,
                        opacity: guideReady ? 1 : 0.5,
                      }}
                    >
                      <SI size={13} />
                      {s.label}
                    </button>
                  );
                })}
              </div>
            ) : null}
          </div>
        </div>
      </div>{/* end chat panel */}

      {/* ── TAB: DISCOVERIES ─────────────────────────────── */}
      <div style={{ width: "50%", minWidth: 0 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {discoveredPlaces.length === 0 ? (
            <div style={{
              background: "var(--roam-surface)", borderRadius: 18, padding: 32, textAlign: "center",
              border: "1px solid var(--roam-border, rgba(255,255,255,0.06))",
            }}>
              <div style={{
                width: 52, height: 52, borderRadius: 14, margin: "0 auto 14px",
                background: "rgba(59,130,246,0.08)", color: "var(--brand-sky)",
                display: "grid", placeItems: "center",
              }}>
                <Search size={24} />
              </div>
              <div style={{ fontSize: 16, fontWeight: 800, color: "var(--roam-text)", marginBottom: 6 }}>
                No discoveries yet
              </div>
              <div style={{ fontSize: 13, fontWeight: 500, color: "var(--roam-text-muted)", lineHeight: 1.5, maxWidth: 260, margin: "0 auto" }}>
                Ask the Guide about fuel, camps, food, or scenic stops to discover places along your route.
              </div>
              <button
                type="button"
                onClick={() => { haptic.selection(); setActiveTab("chat"); }}
                style={{
                  marginTop: 16, borderRadius: 12, border: "none", padding: "10px 20px",
                  fontSize: 14, fontWeight: 700,
                  background: "var(--brand-sky)", color: "white", cursor: "pointer",
                  display: "inline-flex", alignItems: "center", gap: 8,
                  boxShadow: "0 2px 8px rgba(59,130,246,0.25)",
                }}
              >
                <Sparkles size={15} />
                Ask the Guide
              </button>
            </div>
          ) : (
            <>
              {/* Summary header */}
              <div style={{
                background: "var(--roam-surface)", borderRadius: 14, padding: "12px 16px",
                border: "1px solid var(--roam-border, rgba(255,255,255,0.06))",
                display: "flex", alignItems: "center", justifyContent: "space-between",
              }}>
                <div>
                  <div style={{ fontSize: 15, fontWeight: 800, color: "var(--roam-text)" }}>
                    {discoveredPlaces.length} places found
                  </div>
                  <div style={{ fontSize: 12, fontWeight: 500, color: "var(--roam-text-muted)", marginTop: 2 }}>
                    {discoveryGroups.length} categories · nearest first
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => { haptic.selection(); setActiveTab("chat"); }}
                  style={{
                    borderRadius: 10, border: "1px solid var(--roam-border, rgba(255,255,255,0.08))",
                    padding: "7px 12px", fontSize: 12, fontWeight: 700,
                    background: "transparent", color: "var(--brand-sky)",
                    cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 6,
                  }}
                >
                  <Sparkles size={13} />
                  Ask more
                </button>
              </div>

              {discoveryGroups.map((g) => (
                <DiscoveryGroup
                  key={g.category} category={g.category} places={g.places}
                  focusedPlaceId={focusedPlaceId} onFocusPlace={onFocusPlace}
                  onAddStop={onAddStop} onShowOnMap={onShowOnMap} isOnline={isOnline}
                />
              ))}
            </>
          )}
        </div>
      </div>{/* end discoveries panel */}

      </div>{/* end track */}
      </div>{/* end overflow wrapper */}

    </div>
  );
}
