// src/components/trip/GuideView.tsx
"use client";

import { useMemo, useRef, useState, useEffect } from "react";
import type { PlacesPack, PlaceItem, PlaceCategory } from "@/lib/types/places";
import type { MouseEvent, SyntheticEvent } from "react";

import type {
  GuidePack,
  DiscoveredPlace,
  TripProgress,
  GuideAction,
  GuideMsg,
} from "@/lib/types/guide";
import { haptic } from "@/lib/native/haptics";

import type { LucideIcon } from "lucide-react";
import {
  Search,
  Sparkles,
  MapPin,
  Layers,
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
  ExternalLink,
} from "lucide-react";

// ──────────────────────────────────────────────────────────────
// Constants — category chips + icon map
// ──────────────────────────────────────────────────────────────

type ChipKey = PlaceCategory | "all";
type Chip = { key: ChipKey; label: string; Icon: LucideIcon };

/**
 * Chips in priority order for the horizontal scroll bar.
 * First ~8 are visible without scrolling on most phones.
 * Organised: safety → food → sleep → nature → family → culture → supplies
 */
const CHIPS: Chip[] = [
  { key: "all", label: "All", Icon: Layers },
  // Safety & essentials
  { key: "fuel", label: "Fuel", Icon: Fuel },
  { key: "ev_charging", label: "EV", Icon: Zap },
  { key: "rest_area", label: "Rest", Icon: ParkingMeter },
  { key: "toilet", label: "Toilets", Icon: Bath },
  { key: "water", label: "Water", Icon: Droplets },
  // Food & drink
  { key: "bakery", label: "Bakery", Icon: Star },
  { key: "cafe", label: "Café", Icon: Coffee },
  { key: "restaurant", label: "Food", Icon: Utensils },
  { key: "fast_food", label: "Takeaway", Icon: Utensils },
  { key: "pub", label: "Pub", Icon: Beer },
  // Accommodation
  { key: "camp", label: "Camp", Icon: Tent },
  { key: "motel", label: "Motel", Icon: Bed },
  { key: "hotel", label: "Hotel", Icon: Bed },
  // Nature & outdoors
  { key: "viewpoint", label: "Views", Icon: Eye },
  { key: "beach", label: "Beach", Icon: Waves },
  { key: "swimming_hole", label: "Swim", Icon: Waves },
  { key: "waterfall", label: "Waterfall", Icon: Droplets },
  { key: "national_park", label: "Parks", Icon: TreePine },
  { key: "hiking", label: "Hiking", Icon: Mountain },
  { key: "picnic", label: "Picnic", Icon: TreePine },
  { key: "hot_spring", label: "Hot Spring", Icon: Thermometer },
  // Family & recreation
  { key: "playground", label: "Kids", Icon: Baby },
  { key: "pool", label: "Pool", Icon: Waves },
  { key: "zoo", label: "Zoo", Icon: Compass },
  { key: "theme_park", label: "Theme Park", Icon: Star },
  // Culture & sightseeing
  { key: "winery", label: "Wine", Icon: Wine },
  { key: "brewery", label: "Brew", Icon: Beer },
  { key: "visitor_info", label: "Info", Icon: Info },
  { key: "museum", label: "Museum", Icon: Landmark },
  { key: "gallery", label: "Gallery", Icon: Landmark },
  { key: "heritage", label: "Heritage", Icon: Landmark },
  { key: "attraction", label: "Sights", Icon: Camera },
  { key: "market", label: "Market", Icon: Store },
  // Supplies
  { key: "grocery", label: "Grocery", Icon: ShoppingCart },
  { key: "town", label: "Towns", Icon: Building2 },
  { key: "atm", label: "ATM", Icon: Banknote },
  { key: "laundromat", label: "Laundry", Icon: Shirt },
  { key: "dump_point", label: "Dump", Icon: Trash2 },
  { key: "mechanic", label: "Mechanic", Icon: Wrench },
  { key: "hospital", label: "Hospital", Icon: Hospital },
  { key: "pharmacy", label: "Pharmacy", Icon: Pill },
];

/** Fast lookup: category → icon component */
const CATEGORY_ICON: Record<string, LucideIcon> = {};
for (const c of CHIPS) CATEGORY_ICON[c.key] = c.Icon;

type ViewTab = "chat" | "discoveries" | "browse";

// ──────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────

function getTags(p: PlaceItem): Record<string, any> {
  const ex: any = p.extra ?? {};
  if (ex?.tags && typeof ex.tags === "object") return ex.tags as Record<string, any>;
  return ex as Record<string, any>;
}

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
    return normUrl
      .toLowerCase()
      .replace(/^https?:\/\//, "")
      .replace(/^www\./, "")
      .replace(/\/+$/, "");
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
// Markdown-based action extraction (FALLBACK for old messages
// that don't have structured actions from the backend)
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
  const urlRegex =
    /(https?:\/\/[^\s)>\]]+|www\.[^\s)>\]]+|[a-z0-9.-]+\.[a-z]{2,}(\/[^\s)>\]]*)?)/gi;
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
}: {
  Icon: LucideIcon;
  label: string;
  onClick?: () => void;
  href?: string;
  muted?: boolean;
}) {
  const baseStyle: React.CSSProperties = {
    borderRadius: 999,
    minHeight: 36,
    padding: "0 12px",
    fontWeight: 950,
    fontSize: 12.5,
    border: "none",
    background: muted ? "var(--roam-surface)" : "var(--roam-surface-hover)",
    color: "var(--roam-text)",
    boxShadow: "var(--shadow-button)",
    display: "inline-flex",
    alignItems: "center",
    gap: 8,
    cursor: "pointer",
    textDecoration: "none",
    userSelect: "none",
    WebkitTapHighlightColor: "transparent",
  };

  if (href) {
    return (
      <a
        href={href}
        className="trip-interactive"
        style={baseStyle}
        onPointerDown={stopEvent}
        onTouchStart={stopEvent}
        onClick={stopEvent}
      >
        <Icon size={15} />
        <span className="trip-truncate" style={{ maxWidth: 200 }}>
          {label}
        </span>
      </a>
    );
  }

  return (
    <button
      type="button"
      className="trip-interactive"
      style={baseStyle}
      onPointerDown={stopEvent}
      onTouchStart={stopEvent}
      onClick={(e) => {
        stopEvent(e);
        onClick?.();
      }}
    >
      <Icon size={15} />
      <span className="trip-truncate" style={{ maxWidth: 200 }}>
        {label}
      </span>
    </button>
  );
}

// ──────────────────────────────────────────────────────────────
// Message actions row — prefers structured backend actions,
// falls back to markdown extraction for older messages
// ──────────────────────────────────────────────────────────────

function MessageActionsRow({
  msg,
  isOnline,
}: {
  msg: GuideMsg;
  isOnline: boolean;
}) {
  const structured = msg.actions ?? [];

  // Only extract from markdown if no structured actions exist
  const fallback = useMemo(() => {
    if (structured.length > 0) return [];
    return extractActionsFromMarkdown(msg.content ?? "");
  }, [msg.content, structured.length]);

  const hasStructured = structured.length > 0;
  const hasFallback = fallback.length > 0;
  if (!hasStructured && !hasFallback) return null;

  return (
    <div style={{ marginTop: 10, display: "flex", flexWrap: "wrap", gap: 8 }}>
      {/* Structured actions from backend (preferred) */}
      {structured.map((a, idx) => {
        if (a.type === "web" && a.url) {
          return (
            <ActionPill
              key={`sa_web_${idx}_${a.place_id ?? idx}`}
              Icon={ExternalLink}
              label={a.label}
              onClick={
                isOnline
                  ? () => {
                      haptic.selection();
                      safeOpen(a.url!);
                    }
                  : () => haptic.selection()
              }
              muted={!isOnline}
            />
          );
        }
        if (a.type === "call" && a.tel) {
          return (
            <ActionPill
              key={`sa_call_${idx}_${a.place_id ?? idx}`}
              Icon={Phone}
              label={a.label}
              href={`tel:${a.tel}`}
            />
          );
        }
        return null;
      })}

      {/* Fallback: extracted from markdown */}
      {fallback.map((a, idx) => {
        if (a.type === "web") {
          return (
            <ActionPill
              key={`fb_web_${idx}`}
              Icon={Link2}
              label={a.label}
              onClick={
                isOnline
                  ? () => {
                      haptic.selection();
                      safeOpen(a.url);
                    }
                  : () => haptic.selection()
              }
              muted={!isOnline}
            />
          );
        }
        return (
          <ActionPill
            key={`fb_call_${idx}`}
            Icon={Phone}
            label={a.label}
            href={`tel:${a.tel}`}
          />
        );
      })}
    </div>
  );
}

// ──────────────────────────────────────────────────────────────
// Minimal safe Markdown renderer (no raw HTML)
// Supports: paragraphs, line breaks, lists, headings, code fences,
// inline code, **bold**, *italic*, [text](url), autolink urls
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
  const pushText = (txt: string) => {
    if (!txt) return;
    out.push({ t: "text", s: txt });
  };

  while (i < s.length) {
    if (s[i] === "`") {
      const j = s.indexOf("`", i + 1);
      if (j > i + 1) {
        pushText(s.slice(0, i));
        out.push({ t: "code", s: s.slice(i + 1, j) });
        s = s.slice(j + 1);
        i = 0;
        continue;
      }
    }

    if (s[i] === "[") {
      const close = s.indexOf("]", i + 1);
      if (close > i + 1 && s[close + 1] === "(") {
        const endParen = s.indexOf(")", close + 2);
        if (endParen > close + 2) {
          const label = s.slice(i + 1, close);
          const urlRaw = s.slice(close + 2, endParen);
          const href = normalizeUrl(urlRaw) ?? urlRaw;
          pushText(s.slice(0, i));
          out.push({ t: "link", href, c: parseInline(label) });
          s = s.slice(endParen + 1);
          i = 0;
          continue;
        }
      }
    }

    if (s[i] === "*" && s[i + 1] === "*") {
      const j = s.indexOf("**", i + 2);
      if (j > i + 2) {
        const inner = s.slice(i + 2, j);
        pushText(s.slice(0, i));
        out.push({ t: "strong", c: parseInline(inner) });
        s = s.slice(j + 2);
        i = 0;
        continue;
      }
    }

    if (s[i] === "*") {
      const j = s.indexOf("*", i + 1);
      if (j > i + 1) {
        const inner = s.slice(i + 1, j);
        pushText(s.slice(0, i));
        out.push({ t: "em", c: parseInline(inner) });
        s = s.slice(j + 1);
        i = 0;
        continue;
      }
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
    if (!text.trim()) return;
    nodes.push({ t: "p", inl: parseInline(text) });
  };

  while (i < lines.length) {
    const line = lines[i];

    if (line.trimStart().startsWith("```")) {
      const buf: string[] = [];
      i++;
      while (i < lines.length && !lines[i].trimStart().startsWith("```")) {
        buf.push(lines[i]);
        i++;
      }
      if (i < lines.length) i++;
      nodes.push({ t: "codeblock", code: buf.join("\n") });
      continue;
    }

    const hm = /^(#{1,3})\s+(.*)$/.exec(line.trim());
    if (hm) {
      const level = Math.min(3, hm[1].length) as 1 | 2 | 3;
      nodes.push({ t: "h", level, inl: parseInline(hm[2] ?? "") });
      i++;
      continue;
    }

    if (/^\s*[-*]\s+/.test(line)) {
      const items: InlineNode[][] = [];
      while (i < lines.length && /^\s*[-*]\s+/.test(lines[i])) {
        const itemText = lines[i].replace(/^\s*[-*]\s+/, "");
        items.push(parseInline(itemText));
        i++;
      }
      nodes.push({ t: "ul", items });
      continue;
    }

    if (/^\s*\d+\.\s+/.test(line)) {
      const items: InlineNode[][] = [];
      while (i < lines.length && /^\s*\d+\.\s+/.test(lines[i])) {
        const itemText = lines[i].replace(/^\s*\d+\.\s+/, "");
        items.push(parseInline(itemText));
        i++;
      }
      nodes.push({ t: "ol", items });
      continue;
    }

    if (!line.trim()) {
      i++;
      continue;
    }

    const pbuf: string[] = [];
    while (
      i < lines.length &&
      lines[i].trim() &&
      !lines[i].trimStart().startsWith("```") &&
      !/^(#{1,3})\s+/.test(lines[i].trim()) &&
      !/^\s*[-*]\s+/.test(lines[i]) &&
      !/^\s*\d+\.\s+/.test(lines[i])
    ) {
      pbuf.push(lines[i]);
      i++;
    }
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
            out.push(
              <a
                key={`${k}_u_${pi}`}
                href={maybe}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  color: "var(--roam-accent)",
                  textDecoration: "underline",
                  textUnderlineOffset: 2,
                }}
                onClick={(e) => e.stopPropagation()}
              >
                {p}
              </a>,
            );
          } else {
            out.push(<span key={`${k}_t_${pi}`}>{p}</span>);
          }
        }
      } else {
        out.push(<span key={k}>{n.s}</span>);
      }
      continue;
    }

    if (n.t === "code") {
      out.push(
        <code
          key={k}
          style={{
            fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
            fontSize: "0.92em",
            background: "rgba(0,0,0,0.06)",
            padding: "2px 6px",
            borderRadius: 8,
          }}
        >
          {n.s}
        </code>,
      );
      continue;
    }

    if (n.t === "strong") {
      out.push(
        <strong key={k} style={{ fontWeight: 950 }}>
          {renderInline(n.c, k, inLink)}
        </strong>,
      );
      continue;
    }

    if (n.t === "em") {
      out.push(
        <em key={k} style={{ fontStyle: "italic" }}>
          {renderInline(n.c, k, inLink)}
        </em>,
      );
      continue;
    }

    if (n.t === "link") {
      const href = normalizeUrl(n.href) ?? n.href;
      out.push(
        <a
          key={k}
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          style={{
            color: "var(--roam-accent)",
            textDecoration: "underline",
            textUnderlineOffset: 2,
          }}
          onClick={(e) => e.stopPropagation()}
        >
          {renderInline(n.c, k, true)}
        </a>,
      );
      continue;
    }
  }
  return out;
}

function MarkdownBody({ text }: { text: string }) {
  const nodes = useMemo(() => parseMarkdown(text ?? ""), [text]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {nodes.map((n, idx) => {
        const k = `md_${idx}`;

        if (n.t === "codeblock") {
          return (
            <pre
              key={k}
              style={{
                margin: 0,
                padding: "10px 12px",
                borderRadius: 14,
                background: "rgba(0,0,0,0.06)",
                overflowX: "auto",
                WebkitOverflowScrolling: "touch",
                fontSize: 12.5,
                lineHeight: 1.35,
              }}
            >
              <code style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace" }}>
                {n.code}
              </code>
            </pre>
          );
        }

        if (n.t === "h") {
          const size = n.level === 1 ? 15 : n.level === 2 ? 14 : 13;
          return (
            <div
              key={k}
              style={{
                fontSize: size,
                fontWeight: 950,
                color: "var(--roam-text)",
                marginTop: n.level === 1 ? 2 : 0,
              }}
            >
              {renderInline(n.inl, k)}
            </div>
          );
        }

        if (n.t === "ul" || n.t === "ol") {
          const ListTag = n.t === "ul" ? "ul" : "ol";
          return (
            <ListTag
              key={k}
              style={{
                margin: 0,
                paddingLeft: 18,
                color: "var(--roam-text)",
                fontWeight: 850,
                lineHeight: 1.35,
              }}
            >
              {n.items.map((it, ii) => (
                <li key={`${k}_li_${ii}`} style={{ margin: "4px 0px" }}>
                  {renderInline(it, `${k}_li_${ii}`)}
                </li>
              ))}
            </ListTag>
          );
        }

        return (
          <div
            key={k}
            style={{
              color: "var(--roam-text)",
              fontWeight: 850,
              lineHeight: 1.35,
              whiteSpace: "pre-wrap",
            }}
          >
            {renderInline(n.inl, k)}
          </div>
        );
      })}
    </div>
  );
}

// ──────────────────────────────────────────────────────────────
// Extra badges — show rich metadata from the new extra fields
// ──────────────────────────────────────────────────────────────

function ExtraBadges({ place }: { place: PlaceItem }) {
  const extra: any = place.extra ?? {};
  const badges: { label: string; accent?: boolean }[] = [];

  // Free camp
  if (extra.free) badges.push({ label: "Free", accent: true });
  // Powered sites
  if (extra.powered_sites) badges.push({ label: "Powered" });
  // Has water
  if (extra.has_water) badges.push({ label: "Water" });
  // Has toilets
  if (extra.has_toilets) badges.push({ label: "Toilets" });
  // Fuel types
  if (extra.fuel_types && Array.isArray(extra.fuel_types)) {
    const fuels = extra.fuel_types as string[];
    if (fuels.includes("diesel")) badges.push({ label: "Diesel" });
    if (fuels.includes("lpg")) badges.push({ label: "LPG" });
    if (fuels.includes("adblue")) badges.push({ label: "AdBlue" });
  }
  // EV socket types
  if (extra.socket_types && Array.isArray(extra.socket_types)) {
    const sockets = extra.socket_types as string[];
    const display = sockets.slice(0, 2).map((s: string) => s.replace(/_/g, " ")).join(", ");
    if (display) badges.push({ label: display });
  }
  // Opening hours (short)
  if (extra.opening_hours) {
    const hrs = String(extra.opening_hours);
    if (hrs.length <= 20) badges.push({ label: hrs });
  }

  if (badges.length === 0) return null;

  return (
    <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginTop: 4 }}>
      {badges.map((b, i) => (
        <span
          key={i}
          style={{
            fontSize: 10,
            fontWeight: 950,
            padding: "2px 7px",
            borderRadius: 6,
            background: b.accent ? "rgba(0,180,100,0.12)" : "rgba(0,0,0,0.05)",
            color: b.accent ? "rgba(0,140,70,1)" : "var(--roam-text-muted)",
            whiteSpace: "nowrap",
          }}
        >
          {b.label}
        </span>
      ))}
    </div>
  );
}

// ──────────────────────────────────────────────────────────────
// Place card
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
  const extra: any = place.extra ?? {};
  const suburb = extra["addr:suburb"] || extra["addr:city"] || extra.address;
  const phone = extra.phone as string | undefined;
  const website = extra.website as string | undefined;

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
      className="trip-interactive"
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 8,
        padding: "12px 14px",
        borderRadius: 20,
        cursor: "pointer",
        background: isFocused ? "var(--roam-surface-hover)" : "var(--roam-surface)",
        boxShadow: isFocused ? "var(--shadow-heavy)" : "var(--shadow-soft)",
        outline: isFocused ? "3px solid var(--brand-sky)" : "3px solid transparent",
        outlineOffset: -3,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <div
          style={{
            width: 36,
            height: 36,
            borderRadius: 10,
            background: "var(--roam-surface-hover)",
            display: "grid",
            placeItems: "center",
            flexShrink: 0,
          }}
        >
          <CatIcon size={18} />
        </div>

        <div style={{ minWidth: 0, flex: 1 }}>
          <div
            style={{ fontSize: 15, fontWeight: 950, color: "var(--roam-text)" }}
            className="trip-truncate"
          >
            {place.name}
          </div>
          <div
            style={{
              fontSize: 12,
              color: "var(--roam-text-muted)",
              marginTop: 2,
              fontWeight: 850,
              display: "flex",
              gap: 6,
              flexWrap: "wrap",
            }}
          >
            <span>{fmtCategory(place.category)}</span>
            {suburb ? <span>· {typeof suburb === "string" ? suburb.split(",")[0] : suburb}</span> : null}
            {dist ? <span>· {dist}</span> : null}
          </div>

          <ExtraBadges place={place} />
        </div>
      </div>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button
          type="button"
          onPointerDown={stop}
          onTouchStart={stop}
          onClick={(e) => {
            stop(e);
            haptic.medium();
            onAdd();
          }}
          className="trip-btn-sm trip-interactive"
          style={{
            borderRadius: 12,
            minHeight: 38,
            padding: "0 12px",
            fontWeight: 950,
            fontSize: 13,
            background: "var(--roam-accent)",
            color: "white",
            boxShadow: "var(--shadow-button)",
          }}
        >
          + Add
        </button>

        {onShowOnMap ? (
          <button
            type="button"
            onPointerDown={stop}
            onTouchStart={stop}
            onClick={(e) => {
              stop(e);
              haptic.selection();
              onFocus();
              onShowOnMap?.();
            }}
            className="trip-btn-sm trip-interactive"
            style={{
              borderRadius: 12,
              minHeight: 38,
              padding: "0 12px",
              fontWeight: 950,
              fontSize: 13,
              background: "var(--roam-surface-hover)",
              color: "var(--roam-text)",
              boxShadow: "var(--shadow-button)",
            }}
          >
            Map
          </button>
        ) : null}

        {phone ? (
          <a
            href={`tel:${phone}`}
            onPointerDown={stop}
            onTouchStart={stop}
            onClick={stop}
            className="trip-btn-sm trip-interactive"
            style={{
              textDecoration: "none",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              borderRadius: 12,
              minHeight: 38,
              padding: "0 12px",
              fontWeight: 950,
              fontSize: 13,
              background: "var(--roam-surface-hover)",
              color: "var(--roam-text)",
              boxShadow: "var(--shadow-button)",
              gap: 6,
            }}
          >
            <Phone size={14} />
            Call
          </a>
        ) : null}

        {isOnline && website ? (
          <button
            type="button"
            onPointerDown={stop}
            onTouchStart={stop}
            onClick={(e) => {
              stop(e);
              haptic.selection();
              const norm = normalizeUrl(String(website));
              if (norm) safeOpen(norm);
            }}
            className="trip-btn-sm trip-interactive"
            style={{
              borderRadius: 12,
              minHeight: 38,
              padding: "0 12px",
              fontWeight: 950,
              fontSize: 13,
              background: "var(--roam-surface-hover)",
              color: "var(--roam-text)",
              boxShadow: "var(--shadow-button)",
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
            }}
          >
            <Globe size={14} />
            Web
          </button>
        ) : null}
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────
// Discovery group
// ──────────────────────────────────────────────────────────────

function DiscoveryGroup({
  category,
  places,
  focusedPlaceId,
  onFocusPlace,
  onAddStop,
  onShowOnMap,
  isOnline,
}: {
  category: string;
  places: DiscoveredPlace[];
  focusedPlaceId: string | null;
  onFocusPlace: (id: string | null) => void;
  onAddStop: (place: PlaceItem) => void;
  onShowOnMap?: (placeId: string) => void;
  isOnline: boolean;
}) {
  const Icon = CATEGORY_ICON[category] ?? MapPin;
  const label = fmtCategory(category);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "4px 0" }}>
        <Icon size={16} />
        <span style={{ fontSize: 14, fontWeight: 950, color: "var(--roam-text)" }}>{label}</span>
        <span
          style={{
            fontSize: 12,
            fontWeight: 900,
            color: "var(--roam-text-muted)",
            background: "var(--roam-surface-hover)",
            borderRadius: 999,
            padding: "2px 8px",
          }}
        >
          {places.length}
        </span>
      </div>

      {places.slice(0, 8).map((p) => (
        <PlaceCard
          key={p.id}
          place={p}
          isFocused={focusedPlaceId === p.id}
          onFocus={() => onFocusPlace(p.id)}
          onAdd={() => onAddStop(p)}
          onShowOnMap={onShowOnMap ? () => onShowOnMap(p.id) : undefined}
          isOnline={isOnline}
        />
      ))}

      {places.length > 8 ? (
        <div
          style={{
            textAlign: "center",
            fontSize: 12,
            fontWeight: 900,
            color: "var(--roam-text-muted)",
            padding: 8,
          }}
        >
          +{places.length - 8} more {label.toLowerCase()}
        </div>
      ) : null}
    </div>
  );
}

// ──────────────────────────────────────────────────────────────
// Main Component
// ──────────────────────────────────────────────────────────────

export function GuideView({
  places,
  focusedPlaceId,
  onFocusPlace,
  onAddStop,
  isOnline = true,
  onShowOnMap,
  guideReady = false,
  guidePack,
  tripProgress,
  onSendMessage,
  chatBusy = false,
}: {
  places: PlacesPack | null;
  focusedPlaceId: string | null;
  onFocusPlace: (id: string | null) => void;
  onAddStop: (place: PlaceItem) => void;
  isOnline?: boolean;
  onShowOnMap?: (placeId: string) => void;
  guideReady?: boolean;
  guidePack?: GuidePack | null;
  tripProgress?: TripProgress | null;
  onSendMessage?: (text: string, preferredCategories: string[]) => Promise<string | undefined>;
  chatBusy?: boolean;
}) {
  const [chatInput, setChatInput] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [chip, setChip] = useState<ChipKey>("all");
  const [activeTab, setActiveTab] = useState<ViewTab>("chat");

  const chatEndRef = useRef<HTMLDivElement>(null);

  const thread = guidePack?.thread ?? [];
  const prevThreadLen = useRef(thread.length);
  useEffect(() => {
    if (thread.length > prevThreadLen.current) {
      setTimeout(
        () => chatEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" }),
        80,
      );
    }
    prevThreadLen.current = thread.length;
  }, [thread.length]);

  const discoveredPlaces = guidePack?.discovered_places ?? [];

  // ── Discovered places grouped by category ──────────────────
  const discoveryGroups = useMemo(() => {
    const groups: Record<string, DiscoveredPlace[]> = {};
    for (const p of discoveredPlaces) {
      const cat = p.category ?? "town";
      if (!groups[cat]) groups[cat] = [];
      groups[cat].push(p);
    }

    for (const cat of Object.keys(groups)) {
      groups[cat].sort(
        (a, b) => (a.distance_from_user_km ?? 9999) - (b.distance_from_user_km ?? 9999),
      );
    }

    // Priority order: safety → food → sleep → nature → culture → supplies
    const priorityOrder = [
      "fuel", "ev_charging", "rest_area", "water", "toilet", "dump_point",
      "hospital", "pharmacy", "mechanic",
      "bakery", "cafe", "restaurant", "fast_food", "pub", "bar",
      "camp", "motel", "hotel", "hostel",
      "grocery", "town", "atm", "laundromat",
      "viewpoint", "waterfall", "swimming_hole", "beach",
      "national_park", "hiking", "picnic", "hot_spring",
      "playground", "pool", "zoo", "theme_park",
      "visitor_info", "winery", "brewery", "museum", "gallery",
      "heritage", "attraction", "market", "park",
    ];

    const cats = Object.keys(groups).sort((a, b) => {
      const ai = priorityOrder.indexOf(a);
      const bi = priorityOrder.indexOf(b);
      const aN = ai >= 0 ? ai : 999;
      const bN = bi >= 0 ? bi : 999;
      return aN - bN;
    });

    return cats.map((cat) => ({ category: cat, places: groups[cat] }));
  }, [discoveredPlaces]);

  // ── Browse: filter corridor places ─────────────────────────
  const browseItems = useMemo(() => {
    const items = places?.items ?? [];
    const q = searchQuery.trim().toLowerCase();
    let list = items;
    if (chip !== "all") list = list.filter((p) => p.category === chip);
    if (q) list = list.filter((p) => (p.name ?? "").toLowerCase().includes(q));
    return list.slice(0, 140);
  }, [places, searchQuery, chip]);

  // ── Quick suggestions — context-aware based on trip phase ──
  const quickSuggestions = useMemo(() => {
    const suggestions: { label: string; query: string; Icon: LucideIcon }[] = [];

    if (tripProgress && tripProgress.total_km > 0) {
      const kmRemaining = tripProgress.km_remaining;
      const kmDone = tripProgress.km_from_start;
      const hour = new Date().getHours();

      // Always useful
      suggestions.push({
        label: "Next fuel",
        query: "Where's the next fuel stop ahead?",
        Icon: Fuel,
      });

      // Time-based
      if (hour >= 5 && hour < 9) {
        suggestions.push({
          label: "Coffee",
          query: "Any good cafes or bakeries ahead for a morning coffee?",
          Icon: Coffee,
        });
      } else if (hour >= 11 && hour < 14) {
        suggestions.push({
          label: "Lunch",
          query: "Where's a good spot to stop for lunch?",
          Icon: Utensils,
        });
      } else if (hour >= 16 && hour < 20) {
        suggestions.push({
          label: "Tonight",
          query: "Where should I stay tonight? Show me camps and motels ahead.",
          Icon: Bed,
        });
      } else if (hour >= 20 || hour < 5) {
        suggestions.push({
          label: "Stop now",
          query: "I need to stop for the night. What's the closest safe option?",
          Icon: Tent,
        });
      }

      // Distance-based
      if (kmDone > 150) {
        suggestions.push({
          label: "Rest area",
          query: "Where's the next rest area? Need a break.",
          Icon: ParkingMeter,
        });
      }
      if (kmRemaining > 200) {
        suggestions.push({
          label: "Highlights",
          query: "What are the best stops and things to see in the next 100km?",
          Icon: Camera,
        });
      }
      if (kmRemaining < 80 && kmRemaining > 5) {
        suggestions.push({
          label: "Near destination",
          query: "What's worth seeing near my destination?",
          Icon: Target,
        });
      }

      // Nature/discovery
      suggestions.push({
        label: "Scenic",
        query: "Any scenic lookouts, waterfalls, or swimming holes ahead?",
        Icon: Eye,
      });
      suggestions.push({
        label: "Water",
        query: "Where can I fill up drinking water ahead?",
        Icon: Droplets,
      });
    } else {
      // Planning phase — no live position
      suggestions.push({
        label: "Fuel stops",
        query: "Where can I refuel along this route?",
        Icon: Fuel,
      });
      suggestions.push({
        label: "Camps",
        query: "Find camping spots along my route",
        Icon: Tent,
      });
      suggestions.push({
        label: "Scenic",
        query: "What's worth seeing along this route?",
        Icon: Camera,
      });
      suggestions.push({
        label: "Towns",
        query: "What towns will I pass through?",
        Icon: Building2,
      });
      suggestions.push({
        label: "Food",
        query: "Where are good bakeries and cafes along the route?",
        Icon: Coffee,
      });
    }

    return suggestions.slice(0, 6);
  }, [tripProgress]);

  // ── Send handler ───────────────────────────────────────────
  async function handleAsk(text?: string) {
    const msg = (text ?? chatInput).trim();
    if (!msg) return;

    haptic.medium();
    setChatInput("");
    setActiveTab("chat");

    if (!guideReady || !onSendMessage) return;

    const preferred: string[] = chip !== "all" ? [chip] : [];

    try {
      await onSendMessage(msg, preferred);
    } catch {
      // error handled by page
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    handleAsk();
  }

  // ── Render ─────────────────────────────────────────────────

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {/* ── Tab switcher ────────────────────────────────────── */}
      <div
        style={{
          display: "flex",
          gap: 6,
          background: "var(--roam-surface)",
          borderRadius: 16,
          padding: 4,
          boxShadow: "var(--shadow-soft)",
        }}
      >
        {(
          [
            { key: "chat" as ViewTab, label: "Guide", badge: null },
            {
              key: "discoveries" as ViewTab,
              label: "Found",
              badge: discoveredPlaces.length > 0 ? discoveredPlaces.length : null,
            },
            { key: "browse" as ViewTab, label: "Browse", badge: null },
          ] as const
        ).map((tab) => {
          const active = activeTab === tab.key;
          return (
            <button
              key={tab.key}
              type="button"
              className="trip-interactive"
              onClick={() => {
                haptic.selection();
                setActiveTab(tab.key);
              }}
              style={{
                flex: 1,
                borderRadius: 12,
                border: "none",
                padding: "10px 8px",
                fontSize: 13,
                fontWeight: 950,
                background: active ? "var(--roam-surface-hover)" : "transparent",
                color: active ? "var(--roam-text)" : "var(--roam-text-muted)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 6,
                cursor: "pointer",
              }}
            >
              {tab.label}
              {tab.badge != null ? (
                <span
                  style={{
                    fontSize: 11,
                    fontWeight: 950,
                    background: "var(--roam-accent)",
                    color: "white",
                    borderRadius: 999,
                    padding: "1px 6px",
                    minWidth: 20,
                    textAlign: "center",
                  }}
                >
                  {tab.badge}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>

      {/* ════════════════════════════════════════════════════════
          TAB: CHAT (Guide)
          ════════════════════════════════════════════════════════ */}
      {activeTab === "chat" ? (
        <div
          style={{
            background: "var(--roam-surface)",
            padding: 14,
            borderRadius: 20,
            boxShadow: "var(--shadow-soft)",
            display: "flex",
            flexDirection: "column",
            gap: 10,
          }}
        >
          {/* Header */}
          <div
            style={{
              display: "flex",
              alignItems: "baseline",
              justifyContent: "space-between",
              gap: 10,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <div
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 8,
                  fontSize: 14,
                  fontWeight: 950,
                  color: "var(--roam-text)",
                }}
              >
                <Sparkles size={16} />
                Ask Roam
              </div>
              {!guideReady ? (
                <div style={{ fontSize: 12, fontWeight: 900, color: "var(--roam-text-muted)" }}>
                  Loading…
                </div>
              ) : null}
            </div>
            {chatBusy ? (
              <div style={{ fontSize: 12, fontWeight: 900, color: "var(--roam-text-muted)" }}>
                Thinking…
              </div>
            ) : null}
          </div>

          {/* Quick suggestions — shown when chat is empty */}
          {thread.length === 0 ? (
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {quickSuggestions.map((s, i) => {
                const SI = s.Icon;
                return (
                  <button
                    key={i}
                    type="button"
                    className="trip-interactive"
                    onClick={() => handleAsk(s.query)}
                    disabled={!guideReady || chatBusy}
                    style={{
                      borderRadius: 999,
                      border: "none",
                      padding: "8px 12px",
                      fontSize: 13,
                      fontWeight: 900,
                      background: "var(--roam-surface-hover)",
                      color: "var(--roam-text)",
                      cursor: "pointer",
                      opacity: !guideReady || chatBusy ? 0.5 : 1,
                      whiteSpace: "nowrap",
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                    }}
                  >
                    <SI size={16} />
                    {s.label}
                  </button>
                );
              })}
            </div>
          ) : null}

          {/* Thread */}
          {thread.length > 0 ? (
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 10,
                maxHeight: 400,
                overflowY: "auto",
                paddingRight: 4,
                WebkitOverflowScrolling: "touch",
                overscrollBehavior: "contain",
              }}
            >
              {thread.slice(-20).map((m, idx) => {
                const mine = m.role === "user";
                const bubbleBg = mine
                  ? "var(--roam-surface-hover)"
                  : "rgba(0,0,0,0.04)";
                const bubbleRadius = mine
                  ? "16px 16px 4px 16px"
                  : "16px 16px 16px 4px";

                return (
                  <div key={`${m.role}_${idx}`}>
                    <div
                      style={{
                        alignSelf: mine ? "flex-end" : "flex-start",
                        marginLeft: mine ? "auto" : 0,
                        marginRight: mine ? 0 : "auto",
                        maxWidth: "92%",
                        padding: "10px 14px",
                        borderRadius: bubbleRadius,
                        background: bubbleBg,
                        color: "var(--roam-text)",
                        fontSize: 14,
                        fontWeight: 850,
                        lineHeight: 1.35,
                      }}
                    >
                      {!mine ? (
                        <div
                          style={{
                            fontSize: 11,
                            fontWeight: 950,
                            color: "var(--roam-text-muted)",
                            marginBottom: 6,
                            display: "flex",
                            alignItems: "center",
                            gap: 5,
                          }}
                        >
                          <Sparkles size={12} />
                          Roam Guide
                        </div>
                      ) : null}

                      <MarkdownBody text={m.content ?? ""} />

                      {/* Actions: structured from backend → fallback from markdown */}
                      {!mine ? (
                        <MessageActionsRow msg={m} isOnline={!!isOnline} />
                      ) : null}
                    </div>

                    {/* Discovery CTA after tool resolution */}
                    {!mine && m.resolved_tool_id && discoveredPlaces.length > 0 ? (
                      <button
                        type="button"
                        className="trip-interactive"
                        onClick={() => {
                          haptic.selection();
                          setActiveTab("discoveries");
                        }}
                        style={{
                          marginTop: 6,
                          padding: "6px 12px",
                          borderRadius: 12,
                          border: "none",
                          background: "rgba(0,150,255,0.08)",
                          color: "var(--roam-accent)",
                          fontSize: 12,
                          fontWeight: 950,
                          cursor: "pointer",
                          display: "inline-flex",
                          alignItems: "center",
                          gap: 8,
                        }}
                      >
                        <MapPin size={14} />
                        View {discoveredPlaces.length} places
                        <span aria-hidden="true">→</span>
                      </button>
                    ) : null}
                  </div>
                );
              })}

              {chatBusy ? (
                <div
                  style={{
                    alignSelf: "flex-start",
                    maxWidth: "60%",
                    padding: "10px 14px",
                    borderRadius: "16px 16px 16px 4px",
                    background: "rgba(0,0,0,0.04)",
                    color: "var(--roam-text-muted)",
                    fontSize: 14,
                    fontWeight: 850,
                  }}
                >
                  <span style={{ animation: "pulse 1.5s ease-in-out infinite" }}>
                    Searching…
                  </span>
                </div>
              ) : null}

              <div ref={chatEndRef} />
            </div>
          ) : thread.length === 0 && quickSuggestions.length === 0 ? (
            <div
              style={{
                color: "var(--roam-text-muted)",
                fontSize: 13,
                fontWeight: 850,
              }}
            >
              Ask about fuel, camps, food, scenic stops — anything along your route.
            </div>
          ) : null}

          {/* Input */}
          <form
            onSubmit={handleSubmit}
            style={{ display: "flex", gap: 10, marginTop: 4 }}
          >
            <input
              type="text"
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              placeholder="Ask about your route…"
              className="trip-interactive"
              style={{
                flex: 1,
                padding: "12px 14px",
                borderRadius: 999,
                border: "none",
                outline: "none",
                fontSize: 14,
                fontWeight: 850,
                background: "var(--roam-surface-hover)",
                color: "var(--roam-text)",
                boxShadow: "inset 0 0 0 2px rgba(0,0,0,0.04)",
              }}
            />
            <button
              type="submit"
              className="trip-btn trip-btn-primary trip-interactive"
              disabled={!guideReady || chatBusy}
              style={{
                width: "auto",
                borderRadius: 999,
                padding: "0 16px",
                minHeight: 46,
                fontWeight: 950,
                opacity: !guideReady || chatBusy ? 0.6 : 1,
              }}
            >
              Ask
            </button>
          </form>
        </div>
      ) : null}

      {/* ════════════════════════════════════════════════════════
          TAB: DISCOVERIES
          ════════════════════════════════════════════════════════ */}
      {activeTab === "discoveries" ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {discoveredPlaces.length === 0 ? (
            <div
              style={{
                background: "var(--roam-surface)",
                borderRadius: 20,
                padding: 32,
                textAlign: "center",
                boxShadow: "var(--shadow-soft)",
              }}
            >
              <div
                style={{ display: "grid", placeItems: "center", marginBottom: 10 }}
              >
                <Search size={22} />
              </div>
              <div
                style={{
                  fontSize: 15,
                  fontWeight: 950,
                  color: "var(--roam-text)",
                }}
              >
                No discoveries yet
              </div>
              <div
                style={{
                  fontSize: 13,
                  fontWeight: 850,
                  color: "var(--roam-text-muted)",
                  marginTop: 8,
                }}
              >
                Ask the Guide about fuel, camps, food, or scenic stops to discover
                places along your route.
              </div>
              <button
                type="button"
                className="trip-interactive"
                onClick={() => {
                  haptic.selection();
                  setActiveTab("chat");
                }}
                style={{
                  marginTop: 16,
                  borderRadius: 999,
                  border: "none",
                  padding: "10px 18px",
                  fontSize: 14,
                  fontWeight: 950,
                  background: "var(--roam-accent)",
                  color: "white",
                  cursor: "pointer",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 10,
                }}
              >
                <Sparkles size={16} />
                Ask the Guide
              </button>
            </div>
          ) : (
            <>
              <div
                style={{
                  background: "var(--roam-surface)",
                  borderRadius: 20,
                  padding: "14px 16px",
                  boxShadow: "var(--shadow-soft)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                }}
              >
                <div>
                  <div
                    style={{
                      fontSize: 15,
                      fontWeight: 950,
                      color: "var(--roam-text)",
                    }}
                  >
                    {discoveredPlaces.length} places found
                  </div>
                  <div
                    style={{
                      fontSize: 12,
                      fontWeight: 850,
                      color: "var(--roam-text-muted)",
                      marginTop: 2,
                    }}
                  >
                    {discoveryGroups.length} categories · nearest first
                  </div>
                </div>
                <button
                  type="button"
                  className="trip-interactive"
                  onClick={() => {
                    haptic.selection();
                    setActiveTab("chat");
                  }}
                  style={{
                    borderRadius: 999,
                    border: "none",
                    padding: "8px 14px",
                    fontSize: 13,
                    fontWeight: 950,
                    background: "var(--roam-surface-hover)",
                    color: "var(--roam-text)",
                    cursor: "pointer",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 8,
                  }}
                >
                  <Sparkles size={16} />
                  Ask more
                </button>
              </div>

              {discoveryGroups.map((g) => (
                <DiscoveryGroup
                  key={g.category}
                  category={g.category}
                  places={g.places}
                  focusedPlaceId={focusedPlaceId}
                  onFocusPlace={onFocusPlace}
                  onAddStop={onAddStop}
                  onShowOnMap={onShowOnMap}
                  isOnline={isOnline}
                />
              ))}
            </>
          )}
        </div>
      ) : null}

      {/* ════════════════════════════════════════════════════════
          TAB: BROWSE
          ════════════════════════════════════════════════════════ */}
      {activeTab === "browse" ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search places…"
            className="trip-interactive"
            style={{
              padding: "12px 14px",
              borderRadius: 16,
              border: "none",
              outline: "none",
              background: "var(--roam-surface)",
              color: "var(--roam-text)",
              fontSize: 14,
              fontWeight: 850,
              boxShadow: "var(--shadow-soft)",
            }}
          />

          <div
            style={{
              display: "flex",
              gap: 8,
              overflowX: "auto",
              paddingBottom: 4,
              WebkitOverflowScrolling: "touch",
            }}
          >
            {CHIPS.map((c) => {
              const active = chip === c.key;
              const CI = c.Icon;
              return (
                <button
                  key={c.key}
                  type="button"
                  className="trip-interactive"
                  onClick={() => {
                    haptic.selection();
                    setChip(c.key);
                  }}
                  style={{
                    flex: "0 0 auto",
                    borderRadius: 999,
                    border: "none",
                    padding: "8px 12px",
                    fontSize: 13,
                    fontWeight: 950,
                    background: active
                      ? "var(--roam-surface-hover)"
                      : "var(--roam-surface)",
                    color: active ? "var(--roam-text)" : "var(--roam-text-muted)",
                    boxShadow: active
                      ? "var(--shadow-button)"
                      : "var(--shadow-soft)",
                    display: "flex",
                    gap: 8,
                    alignItems: "center",
                    cursor: "pointer",
                  }}
                >
                  <CI size={16} />
                  {c.label}
                </button>
              );
            })}
          </div>

          {browseItems.length === 0 ? (
            <div
              style={{
                padding: 18,
                textAlign: "center",
                color: "var(--roam-text-muted)",
                fontSize: 14,
                fontWeight: 850,
                background: "var(--roam-surface)",
                borderRadius: 20,
                boxShadow: "var(--shadow-soft)",
              }}
            >
              No places found
              {chip !== "all" ? ` for "${fmtCategory(chip)}"` : ""}.
            </div>
          ) : (
            browseItems.map((p) => (
              <PlaceCard
                key={p.id}
                place={p}
                isFocused={focusedPlaceId === p.id}
                onFocus={() => onFocusPlace(p.id)}
                onAdd={() => onAddStop(p)}
                onShowOnMap={onShowOnMap ? () => onShowOnMap(p.id) : undefined}
                isOnline={isOnline}
              />
            ))
          )}
        </div>
      ) : null}
    </div>
  );
}