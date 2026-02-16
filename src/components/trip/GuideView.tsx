// src/components/trip/GuideView.tsx
"use client";

import { useMemo, useRef, useState, useEffect } from "react";
import type { PlacesPack, PlaceItem, PlaceCategory } from "@/lib/types/places";
import type { MouseEvent, SyntheticEvent } from "react";

import type { GuidePack, DiscoveredPlace, TripProgress } from "@/lib/types/guide";
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
  Map as MapIcon,
  Target,
  Camera,
  ParkingMeter,
} from "lucide-react";

// ──────────────────────────────────────────────────────────────
// Constants
// ──────────────────────────────────────────────────────────────

type ChipKey = PlaceCategory | "all";
type Chip = { key: ChipKey; label: string; Icon: LucideIcon };

const CHIPS: Chip[] = [
  { key: "all", label: "All", Icon: Layers },
  { key: "fuel", label: "Fuel", Icon: Fuel },
  { key: "camp", label: "Camp", Icon: Tent },
  { key: "toilet", label: "Toilets", Icon: Bath },
  { key: "water", label: "Water", Icon: Droplets },
  { key: "town", label: "Towns", Icon: Building2 },
  { key: "grocery", label: "Groceries", Icon: ShoppingCart },
  { key: "mechanic", label: "Mechanic", Icon: Wrench },
  { key: "hospital", label: "Hospital", Icon: Hospital },
  { key: "pharmacy", label: "Pharmacy", Icon: Pill },
  { key: "cafe", label: "Cafes", Icon: Coffee },
  { key: "restaurant", label: "Food", Icon: Utensils },
  { key: "park", label: "Parks", Icon: TreePine },
  { key: "viewpoint", label: "Views", Icon: Eye },
  { key: "beach", label: "Beaches", Icon: Waves },
  { key: "hotel", label: "Stay", Icon: Bed },
];

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

function buildAddress(tags: Record<string, any>) {
  const hn = tags["addr:housenumber"];
  const st = tags["addr:street"];
  const suburb = tags["addr:suburb"] || tags["addr:city"] || tags["addr:town"];
  const pc = tags["addr:postcode"];
  const parts = [hn && st ? `${hn} ${st}` : st, suburb, pc].filter(Boolean);
  return parts.length ? parts.join(", ") : null;
}

function fmtDist(km?: number | null) {
  if (km == null) return null;
  if (km < 1) return `${Math.round(km * 1000)}m`;
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
  // If it's a naked domain like example.com
  if (/^[a-z0-9.-]+\.[a-z]{2,}(\/|$)/i.test(s)) return `https://${s}`;
  return null;
}

function cleanPhone(raw: string) {
  // Keep + and digits, strip others
  const trimmed = raw.trim();
  const keepPlus = trimmed.startsWith("+");
  const digits = trimmed.replace(/[^\d]/g, "");
  // Heuristic: avoid short junk; allow typical phone lengths
  if (digits.length < 8 || digits.length > 15) return null;
  return (keepPlus ? "+" : "") + digits;
}

type MessageAction =
  | { type: "web"; url: string; label: string }
  | { type: "call"; tel: string; label: string };
  function extractActions(text: string): MessageAction[] {
    if (!text) return [];
  
    const actions: MessageAction[] = [];
  
    // Keep ordering stable and dedupe hard (url host+path, phone digits)
    const seenWeb = new Set<string>();
    const seenTel = new Set<string>();
  
    const lines = text.split(/\r?\n/);
  
    // "Current" context name (updated as we scan down)
    let currentName: string | null = null;
  
    const cleanName = (s: string | null | undefined) => {
      const t = (s ?? "").trim();
      if (!t) return null;
      // strip bullets/emoji/prefixes
      const u = t.replace(/^[-*•\s]+/, "").trim();
      // avoid obvious non-names
      if (!u) return null;
      if (u.length > 60) return u.slice(0, 60).trim();
      return u;
    };
  
    const nameFromBoldOrHeading = (line: string) => {
      // **Name**
      const b = line.match(/\*\*(.+?)\*\*/);
      if (b?.[1]) return cleanName(b[1]);
      // # Name
      const h = line.match(/^\s*#{1,3}\s+(.+)\s*$/);
      if (h?.[1]) return cleanName(h[1]);
      return null;
    };
  
    const nameFromPrefixBeforeMatch = (line: string, matchIndex: number) => {
      // Take prefix before the url/phone and try to interpret it as "Name: ..." or "Name — ..."
      const prefix = line.slice(0, matchIndex).trim();
      if (!prefix) return null;
  
      // Common separators
      const parts = prefix.split(/—|–|-|:|\|/).map((p) => p.trim()).filter(Boolean);
      if (!parts.length) return null;
  
      // Often the name is the last "chunk" before the separator
      return cleanName(parts[parts.length - 1]);
    };
  
    // Regexes
    const urlRegex = /(https?:\/\/[^\s)>\]]+|www\.[^\s)>\]]+|[a-z0-9.-]+\.[a-z]{2,}(\/[^\s)>\]]*)?)/gi;
    const phoneRegex = /(\+?\d[\d\s().-]{6,}\d)/g;
  
    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (!line) continue;
  
      // Update currentName if this line looks like a "header/name line"
      const headerName = nameFromBoldOrHeading(line);
      if (headerName) currentName = headerName;
  
      // --- URLs in this line ---
      {
        const matches = Array.from(line.matchAll(urlRegex));
        for (const m of matches) {
          const rawUrl = m[0];
          const idx = m.index ?? 0;
  
          const norm = normalizeUrl(rawUrl);
          if (!norm) continue;
  
          let key = norm;
          try {
            const u = new URL(norm);
            key = `${u.host}${u.pathname}`;
          } catch {}
  
          if (seenWeb.has(key)) continue;
          seenWeb.add(key);
  
          const localName = nameFromPrefixBeforeMatch(line, idx) ?? currentName;
  
          let finalUrl = norm;
          // normalizeUrl already ensures scheme, but just in case:
          if (!/^https?:\/\//i.test(finalUrl)) finalUrl = `https://${finalUrl}`;
  
          actions.push({
            type: "web",
            url: finalUrl,
            label: localName ? `Website · ${localName}` : "Website",
          });
        }
      }
  
      // --- Phones in this line ---
      {
        const matches = Array.from(line.matchAll(phoneRegex));
        for (const m of matches) {
          const rawPhone = m[0];
          const idx = m.index ?? 0;
  
          const tel = cleanPhone(rawPhone);
          if (!tel) continue;
  
          const telKey = tel.replace(/[^\d+]/g, "");
          if (seenTel.has(telKey)) continue;
          seenTel.add(telKey);
  
          const localName = nameFromPrefixBeforeMatch(line, idx) ?? currentName;
  
          actions.push({
            type: "call",
            tel,
            label: localName ? `Call ${localName}` : "Call",
          });
        }
      }
    }
  
    // Keep UI sane
    return actions.slice(0, 8);
  }
  
function stopEvent(e: SyntheticEvent) {
  e.stopPropagation();
}

function ActionPill({
  Icon,
  label,
  onClick,
  href,
}: {
  Icon: LucideIcon;
  label: string;
  onClick?: () => void;
  href?: string;
}) {
  const baseStyle: React.CSSProperties = {
    borderRadius: 999,
    minHeight: 36,
    padding: "0 12px",
    fontWeight: 950,
    fontSize: 12.5,
    border: "none",
    background: "var(--roam-surface-hover)",
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
        <span className="trip-truncate" style={{ maxWidth: 220 }}>
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
      <span className="trip-truncate" style={{ maxWidth: 220 }}>
        {label}
      </span>
    </button>
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

  // Simple token scan
  let i = 0;
  const pushText = (txt: string) => {
    if (!txt) return;
    out.push({ t: "text", s: txt });
  };

  while (i < s.length) {
    // Inline code `
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

    // Link [text](url)
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

    // Bold **text**
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

    // Italic *text*
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

    // Code fences
    if (line.trimStart().startsWith("```")) {
      const fence = line.trimStart().slice(0, 3);
      const buf: string[] = [];
      i++;
      while (i < lines.length && !lines[i].trimStart().startsWith(fence)) {
        buf.push(lines[i]);
        i++;
      }
      // skip closing fence if present
      if (i < lines.length) i++;
      nodes.push({ t: "codeblock", code: buf.join("\n") });
      continue;
    }

    // Headings
    const hm = /^(#{1,3})\s+(.*)$/.exec(line.trim());
    if (hm) {
      const level = Math.min(3, hm[1].length) as 1 | 2 | 3;
      nodes.push({ t: "h", level, inl: parseInline(hm[2] ?? "") });
      i++;
      continue;
    }

    // Unordered list
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

    // Ordered list
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

    // Blank line splits paragraphs
    if (!line.trim()) {
      i++;
      continue;
    }

    // Paragraph gather
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

function renderInline(nodes: InlineNode[], keyPrefix: string) {
  const out: React.ReactNode[] = [];
  for (let i = 0; i < nodes.length; i++) {
    const n = nodes[i];
    const k = `${keyPrefix}_${i}`;

    if (n.t === "text") {
      // Autolink urls inside text chunks
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
              style={{ color: "var(--roam-accent)", textDecoration: "underline", textUnderlineOffset: 2 }}
              onClick={(e) => e.stopPropagation()}
            >
              {p}
            </a>,
          );
        } else {
          out.push(<span key={`${k}_t_${pi}`}>{p}</span>);
        }
      }
      continue;
    }

    if (n.t === "code") {
      out.push(
        <code
          key={k}
          style={{
            fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace",
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
          {renderInline(n.c, k)}
        </strong>,
      );
      continue;
    }

    if (n.t === "em") {
      out.push(
        <em key={k} style={{ fontStyle: "italic" }}>
          {renderInline(n.c, k)}
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
          style={{ color: "var(--roam-accent)", textDecoration: "underline", textUnderlineOffset: 2 }}
          onClick={(e) => e.stopPropagation()}
        >
          {renderInline(n.c, k)}
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
              <code
                style={{
                  fontFamily:
                    "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace",
                }}
              >
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
                <li key={`${k}_li_${ii}`} style={{ margin: "4px 0" }}>
                  {renderInline(it, `${k}_li_${ii}`)}
                </li>
              ))}
            </ListTag>
          );
        }

        // paragraph
        return (
          <div key={k} style={{ color: "var(--roam-text)", fontWeight: 850, lineHeight: 1.35, whiteSpace: "pre-wrap" }}>
            {renderInline(n.inl, k)}
          </div>
        );
      })}
    </div>
  );
}
function MessageActionsRow({ text, isOnline }: { text: string; isOnline: boolean }) {
  const actions = useMemo(() => extractActions(text ?? ""), [text]);

  if (!actions.length) return null;

  return (
    <div
      style={{
        marginTop: 10,
        display: "flex",
        flexWrap: "wrap",
        gap: 8,
      }}
    >
      {actions.map((a, idx) => {
        if (a.type === "web") {
          return (
            <ActionPill
              key={`web_${idx}_${a.url}`}
              Icon={Link2}
              label={a.label}
              onClick={
                isOnline
                  ? () => {
                      haptic.selection();
                      safeOpen(a.url);
                    }
                  : () => {
                      haptic.selection();
                    }
              }
            />
          );
        }

        return (
          <ActionPill
            key={`call_${idx}_${a.tel}`}
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
// Sub-components
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
  const tags = getTags(place);
  const suburb = tags["addr:suburb"] || tags["addr:city"] || tags["addr:town"];
  const phone = tags.phone as string | undefined;
  const website = tags.website as string | undefined;

  const CatIcon = CATEGORY_ICON[place.category];

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
            fontSize: 18,
            flexShrink: 0,
          }}
          aria-hidden="true"
        >
          {CatIcon ? <CatIcon size={18} /> : "📍"}
        </div>

        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ fontSize: 15, fontWeight: 950, color: "var(--roam-text)" }} className="trip-truncate">
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
            {suburb ? <span>· {suburb}</span> : null}
            {dist ? <span>· {dist} away</span> : null}
          </div>
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
          + Add to Trip
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
            }}
          >
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
              safeOpen(String(website));
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
            Web
          </button>
        ) : null}
      </div>
    </div>
  );
}

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

  // Auto-scroll chat on new messages
  const thread = guidePack?.thread ?? [];
  const prevThreadLen = useRef(thread.length);
  useEffect(() => {
    if (thread.length > prevThreadLen.current) {
      setTimeout(() => chatEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" }), 80);
    }
    prevThreadLen.current = thread.length;
  }, [thread.length]);

  // Switch to discoveries tab when new places are found
  const discoveredPlaces = guidePack?.discovered_places ?? [];
  const prevDiscoveredLen = useRef(discoveredPlaces.length);
  useEffect(() => {
    if (discoveredPlaces.length > prevDiscoveredLen.current && discoveredPlaces.length > 0) {
      // Don't auto-switch — let user notice the badge update
    }
    prevDiscoveredLen.current = discoveredPlaces.length;
  }, [discoveredPlaces.length]);

  // ── Discovered places grouped by category ──────────────────
  const discoveryGroups = useMemo(() => {
    const groups: Record<string, DiscoveredPlace[]> = {};
    for (const p of discoveredPlaces) {
      const cat = p.category ?? "unknown";
      if (!groups[cat]) groups[cat] = [];
      groups[cat].push(p);
    }

    for (const cat of Object.keys(groups)) {
      groups[cat].sort((a, b) => (a.distance_from_user_km ?? 9999) - (b.distance_from_user_km ?? 9999));
    }

    const essentialOrder = ["fuel", "water", "camp", "toilet", "hospital", "grocery", "mechanic"];
    const cats = Object.keys(groups).sort((a, b) => {
      const ai = essentialOrder.indexOf(a);
      const bi = essentialOrder.indexOf(b);
      if (ai >= 0 && bi >= 0) return ai - bi;
      if (ai >= 0) return -1;
      if (bi >= 0) return 1;
      return groups[b].length - groups[a].length;
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

  // ── Quick suggestions (smart prompts based on progress) ────
  const quickSuggestions = useMemo(() => {
    const suggestions: { label: string; query: string; Icon: LucideIcon }[] = [];

    if (tripProgress) {
      const kmRemaining = tripProgress.km_remaining;
      const hour = new Date().getHours();

      suggestions.push({ label: "Fuel ahead", query: "Where's the next fuel stop?", Icon: Fuel });

      if (hour >= 11 && hour < 14) {
        suggestions.push({ label: "Lunch spots", query: "Good places to stop for lunch nearby?", Icon: Utensils });
      } else if (hour >= 16 && hour < 20) {
        suggestions.push({ label: "Stay tonight", query: "Where can I stay tonight? Camps or motels ahead.", Icon: Bed });
      } else if (hour >= 20 || hour < 5) {
        suggestions.push({ label: "Nearest stop", query: "I need to stop for the night. What's closest?", Icon: Tent });
      }

      if (kmRemaining > 200) {
        suggestions.push({ label: "Rest stops", query: "Where are good rest stops in the next 100km?", Icon: ParkingMeter });
      }
      if (kmRemaining < 100) {
        suggestions.push({ label: "Near destination", query: "What's there to see near my destination?", Icon: Target });
      }

      suggestions.push({ label: "Water", query: "Where can I get drinking water ahead?", Icon: Droplets });
      suggestions.push({ label: "Scenic", query: "Any scenic viewpoints or interesting stops ahead?", Icon: Camera });
    } else {
      suggestions.push({ label: "Fuel", query: "Where can I refuel along this route?", Icon: Fuel });
      suggestions.push({ label: "Camps", query: "Find camping spots along my route", Icon: Tent });
      suggestions.push({ label: "Scenic", query: "What's worth seeing along this route?", Icon: Camera });
      suggestions.push({ label: "Towns", query: "What towns will I pass through?", Icon: Building2 });
    }

    return suggestions.slice(0, 5);
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
        {([
          { key: "chat" as ViewTab, label: "Chat", badge: null },
          {
            key: "discoveries" as ViewTab,
            label: "Discoveries",
            badge: discoveredPlaces.length > 0 ? discoveredPlaces.length : null,
          },
          { key: "browse" as ViewTab, label: "Browse", badge: null },
        ]).map((tab) => {
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
          TAB: CHAT
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
          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 10 }}>
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
              {!guideReady ? <div style={{ fontSize: 12, fontWeight: 900, color: "var(--roam-text-muted)" }}>Booting…</div> : null}
            </div>
            {chatBusy ? <div style={{ fontSize: 12, fontWeight: 900, color: "var(--roam-text-muted)" }}>Thinking…</div> : null}
          </div>

          {/* Quick suggestions */}
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
                maxHeight: 360,
                overflowY: "auto",
                paddingRight: 4,
                WebkitOverflowScrolling: "touch",
                overscrollBehavior: "contain",
              }}
            >
              {thread.slice(-20).map((m, idx) => {
                const mine = m.role === "user";
                const bubbleBg = mine ? "var(--roam-surface-hover)" : "rgba(0,0,0,0.04)";
                const bubbleRadius = mine ? "16px 16px 4px 16px" : "16px 16px 16px 4px";

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
                        <div style={{ fontSize: 11, fontWeight: 950, color: "var(--roam-text-muted)", marginBottom: 6 }}>
                          Roam Guide
                        </div>
                      ) : null}

                      {/* ✅ Markdown rendering */}
                      <MarkdownBody text={m.content ?? ""} />

                      {/* ✅ Actions (web + call) */}
                      {!mine ? <MessageActionsRow text={m.content ?? ""} isOnline={!!isOnline} /> : null}
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
                        View {discoveredPlaces.length} discovered places
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
                  <span style={{ animation: "pulse 1.5s ease-in-out infinite" }}>Searching…</span>
                </div>
              ) : null}

              <div ref={chatEndRef} />
            </div>
          ) : thread.length === 0 && quickSuggestions.length === 0 ? (
            <div style={{ color: "var(--roam-text-muted)", fontSize: 13, fontWeight: 850 }}>
              Ask about fuel, camps, food, scenic stops — anything along your route.
            </div>
          ) : null}

          {/* Input */}
          <form onSubmit={handleSubmit} style={{ display: "flex", gap: 10, marginTop: 4 }}>
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
              <div style={{ display: "grid", placeItems: "center", marginBottom: 10 }}>
                <Search size={22} />
              </div>
              <div style={{ fontSize: 15, fontWeight: 950, color: "var(--roam-text)" }}>No discoveries yet</div>
              <div style={{ fontSize: 13, fontWeight: 850, color: "var(--roam-text-muted)", marginTop: 8 }}>
                Ask the Guide about fuel, camps, food, or scenic stops to discover places along your route.
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
                  <div style={{ fontSize: 15, fontWeight: 950, color: "var(--roam-text)" }}>
                    {discoveredPlaces.length} places discovered
                  </div>
                  <div style={{ fontSize: 12, fontWeight: 850, color: "var(--roam-text-muted)", marginTop: 2 }}>
                    {discoveryGroups.length} categories · sorted by distance
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
            placeholder="Search places by name…"
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
                    background: active ? "var(--roam-surface-hover)" : "var(--roam-surface)",
                    color: active ? "var(--roam-text)" : "var(--roam-text-muted)",
                    boxShadow: active ? "var(--shadow-button)" : "var(--shadow-soft)",
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
              No places found.
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
