// src/components/trip/GuideView.tsx

import { useMemo, useRef, useState, useEffect } from "react";
import type { PlaceItem } from "@/lib/types/places";
import type { MouseEvent, SyntheticEvent } from "react";

import type {
    GuidePack,
    DiscoveredPlace,
    TripProgress, GuideMsg
} from "@/lib/types/guide";
import { haptic } from "@/lib/native/haptics";
import { usePlaceDetail } from "@/lib/context/PlaceDetailContext";

import { CATEGORY_ICON, getCategoryColor } from "@/lib/places/categoryMeta";
import { fmtDist, fmtCategory, normalizeUrl, safeOpen, cleanPhone } from "@/lib/places/format";

import type { LucideIcon } from "lucide-react";
import {
    Search,
    Sparkles,
    MapPin,
    Fuel,
    Tent,
    Bath,
    Droplets,
    Coffee,
    Utensils,
    Eye,
    Waves,
    Bed,
    Phone,
    Link2,
    ParkingMeter,
    Target,
    Camera,
    Zap,
    Beer,
    Baby,
    Trash2,
    Shirt,
    Star,
    Globe,
    Compass,
    Dog,
    ExternalLink,
    Plus,
    Send,
    ChevronRight,
    Bookmark,
    Check,
    ShowerHead,
    Flame,
    Wifi,
    Signal,
    UtensilsCrossed,
    WifiOff,
} from "lucide-react";

const catColor = getCategoryColor;

type ViewTab = "chat" | "discoveries";

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

function stopEvent(e: SyntheticEvent) {
  e.stopPropagation();
}

// ──────────────────────────────────────────────────────────────
// Markdown action extraction (fallback for old messages)
// ──────────────────────────────────────────────────────────────

type FallbackAction =
  | { type: "web"; url: string; label: string }
  | { type: "call"; tel: string; label: string };

// Hoisted regexes - compiling these per call added 5-15ms on low-end
// devices once messages got long. Module scope is fine because they're
// global-flag regexes reset via .matchAll() / String.replace().
const MARKDOWN_LINK_REGEX = /\[([^\]]+)\]\(([^)]+)\)/g;
const URL_REGEX = /(https?:\/\/[^\s)>\]]+|www\.[^\s)>\]]+|[a-z0-9.-]+\.[a-z]{2,}(\/[^\s)>\]]*)?)/gi;
const PHONE_REGEX = /(\+?\d[\d\s().-]{6,}\d)/g;
const BOLD_REGEX = /\*\*(.+?)\*\*/;
const LEADING_BULLET_REGEX = /^\s*(?:\d+\.)?\s*[-*•]?\s*/;

function extractActionsFromMarkdown(text: string): FallbackAction[] {
  if (!text) return [];
  const actions: FallbackAction[] = [];
  const seenWeb = new Set<string>();
  const seenTel = new Set<string>();
  const lines = text.split(/\r?\n/);

  const cleanName = (s: string | null | undefined) => {
    const t = (s ?? "").trim();
    if (!t) return null;
    return t.replace(LEADING_BULLET_REGEX, "").trim() || null;
  };

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;
    const bold = line.match(BOLD_REGEX);
    const lineName = cleanName(bold?.[1]);

    const strippedLine = line.replace(MARKDOWN_LINK_REGEX, (_m, _lbl, urlRaw) => {
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

    const urlMatches = Array.from(strippedLine.matchAll(URL_REGEX));
    for (const m of urlMatches) {
      const norm = normalizeUrl(m[0]);
      if (!norm) continue;
      const key = normalizeUrlKey(norm);
      if (seenWeb.has(key)) continue;
      seenWeb.add(key);
      actions.push({ type: "web", url: norm, label: lineName ?? "Website" });
    }

    const phoneMatches = Array.from(line.matchAll(PHONE_REGEX));
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
    borderRadius: "var(--r-card)",
    minHeight: 44,
    padding: "0 14px",
    fontWeight: 700,
    fontSize: 13,
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

  // Group structured actions by destination (place_id or place_name, fallback to ungrouped)
  const groups = useMemo(() => {
    if (structured.length === 0) return [];
    const map = new Map<string, { name: string | null; actions: typeof structured }>();
    for (const a of structured) {
      const key = a.place_id ?? a.place_name ?? "__ungrouped__";
      if (!map.has(key)) map.set(key, { name: a.place_name ?? null, actions: [] });
      map.get(key)!.actions.push(a);
    }
    return Array.from(map.values());
  }, [structured]);

  if (structured.length === 0 && fallback.length === 0) return null;

  return (
    <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 6 }}>
      {groups.map((group, gi) => (
        <div
          key={gi}
          style={{
            display: "inline-flex",
            alignItems: "center",
            flexWrap: "wrap",
            gap: 0,
            borderRadius: "var(--r-card)",
            overflow: "hidden",
            alignSelf: "flex-start",
            border: "1px solid var(--roam-border)",
            background: "var(--roam-surface, rgba(255,255,255,0.04))",
          }}
        >
          {group.name ? (
            <span style={{
              padding: "6px 10px",
              fontSize: 12,
              fontWeight: 700,
              color: "var(--roam-text-muted)",
              borderRight: "1px solid var(--roam-border)",
              whiteSpace: "nowrap",
            }}>
              {group.name}
            </span>
          ) : null}
          {group.actions.map((a, idx) => {
            const isLast = idx === group.actions.length - 1;
            const dividerStyle = !isLast ? { borderRight: "1px solid var(--roam-border)" } : {};
            if (a.type === "web" && a.url) {
              return (
                <button
                  key={`sa_web_${gi}_${idx}`}
                  type="button"
                  onClick={isOnline ? () => { haptic.selection(); safeOpen(a.url!); } : () => haptic.selection()}
                  style={{
                    display: "inline-flex", alignItems: "center", gap: 6,
                    padding: "10px 12px", minHeight: 44, background: "none", border: "none",
                    cursor: isOnline ? "pointer" : "default",
                    fontSize: 13, fontWeight: 700,
                    color: isOnline ? "var(--roam-text)" : "var(--roam-text-muted)",
                    opacity: isOnline ? 1 : 0.5,
                    ...dividerStyle,
                  }}
                >
                  <ExternalLink size={12} />
                  <span>Website</span>
                </button>
              );
            }
            if (a.type === "call" && a.tel) {
              return (
                <a
                  key={`sa_call_${gi}_${idx}`}
                  href={`tel:${a.tel}`}
                  style={{
                    display: "inline-flex", alignItems: "center", gap: 6,
                    padding: "10px 12px", minHeight: 44, textDecoration: "none",
                    fontSize: 13, fontWeight: 700, color: "var(--roam-success)",
                    ...dividerStyle,
                  }}
                >
                  <Phone size={12} />
                  <span>Call</span>
                </a>
              );
            }
            if (a.type === "map" && a.lat != null && a.lng != null) {
              return (
                <button
                  key={`sa_map_${gi}_${idx}`}
                  type="button"
                  onClick={() => { haptic.selection(); onShowOnMap?.(a.lat!, a.lng!, a.place_id ?? undefined); }}
                  style={{
                    display: "inline-flex", alignItems: "center", gap: 6,
                    padding: "10px 12px", minHeight: 44, background: "none", border: "none",
                    cursor: "pointer", fontSize: 13, fontWeight: 700, color: "var(--brand-shared)",
                    ...dividerStyle,
                  }}
                >
                  <MapPin size={12} />
                  <span>Map</span>
                </button>
              );
            }
            if (a.type === "save") {
              const isSaved = a.place_id ? discoveredIds?.has(a.place_id) : true;
              return (
                <button
                  key={`sa_save_${gi}_${idx}`}
                  type="button"
                  onClick={() => { haptic.selection(); onSwitchToFound?.(); }}
                  style={{
                    display: "inline-flex", alignItems: "center", gap: 6,
                    padding: "10px 12px", minHeight: 44, background: "none", border: "none",
                    cursor: "pointer", fontSize: 13, fontWeight: 700, color: "var(--roam-success)",
                    ...dividerStyle,
                  }}
                >
                  {isSaved ? <Check size={12} /> : <Bookmark size={12} />}
                  <span>{isSaved ? "Saved" : "Save"}</span>
                </button>
              );
            }
            return null;
          })}
        </div>
      ))}

      {/* Fallback (markdown-extracted) actions */}
      {fallback.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
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
      )}

      {/* Found tab CTA when places were saved */}
      {saveCount > 0 && onSwitchToFound ? (
        <button
          type="button"
          onClick={() => { haptic.selection(); onSwitchToFound(); }}
          style={{
            padding: "10px 14px", minHeight: 44, borderRadius: "var(--r-card)",
            border: "2px solid var(--roam-success)", background: "var(--roam-surface-hover)",
            color: "var(--roam-success)", fontSize: "var(--font-sm)", fontWeight: 700, cursor: "pointer",
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
      out.push(<code key={k} style={{ fontFamily: "var(--ff-mono)", fontSize: "0.9em", background: "var(--roam-surface-hover)", padding: "2px 6px", borderRadius: "var(--r-btn)" }}>{n.s}</code>);
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
          return (<pre key={k} style={{ margin: 0, padding: "10px 12px", borderRadius: "var(--r-card)", background: "var(--roam-surface-hover)", overflowX: "auto", fontSize: 12, lineHeight: 1.4 }}><code style={{ fontFamily: "var(--ff-mono)" }}>{n.code}</code></pre>);
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
  const badges: { label: string; accent?: boolean; warn?: boolean }[] = [];

  if (extra.free) badges.push({ label: "Free", accent: true });

  // ── Dump point badges ─────────────────────────────────────
  if (place.category === "dump_point") {
    const acc = extra.dump_access as string | undefined;
    if (acc === "public") badges.push({ label: "Public Access", accent: true });
    else if (acc === "customers_only") badges.push({ label: "Customers Only", warn: true });
    else if (acc === "key_required") badges.push({ label: "Key Required", warn: true });

    const dumpType = extra.dump_type as string | undefined;
    if (dumpType === "both") badges.push({ label: "Black + Grey Water" });
    else if (dumpType === "black_water") badges.push({ label: "Black Water" });
    else if (dumpType === "grey_water") badges.push({ label: "Grey Water" });

    if (extra.has_potable_water_at_dump) badges.push({ label: "Potable Water", accent: true });
    if (extra.has_rinse) badges.push({ label: "Rinse Water" });

    const dumpFee = extra.dump_fee as string | undefined;
    if (dumpFee && dumpFee !== "free") badges.push({ label: `Fee: ${dumpFee}` });
  }

  // ── Water point badges ────────────────────────────────────
  if (place.category === "water") {
    const wt = extra.water_type as string | undefined;
    if (wt === "potable") badges.push({ label: "Potable", accent: true });
    else if (wt === "non_potable") badges.push({ label: "Non-potable", warn: true });
    else if (wt === "bore") badges.push({ label: "Bore Water" });
    else if (wt === "rainwater") badges.push({ label: "Rainwater" });

    const wf = extra.water_flow as string | undefined;
    if (wf === "tap") badges.push({ label: "Tap" });
    else if (wf === "tank") badges.push({ label: "Tank" });
    else if (wf === "pump") badges.push({ label: "Pump" });
    else if (wf === "bore") badges.push({ label: "Bore Pump" });

    if (extra.water_treated) badges.push({ label: "Treated" });
    if (extra.water_always_available === true) badges.push({ label: "Always On" });
    else if (extra.water_always_available === false) badges.push({ label: "Seasonal", warn: true });
  }

  // ── Toilet badges ─────────────────────────────────────────
  if (place.category === "toilet") {
    const tt = extra.toilet_type as string | undefined;
    if (tt === "flush") badges.push({ label: "Flush" });
    else if (tt === "pit") badges.push({ label: "Pit Toilet" });
    else if (tt === "composting") badges.push({ label: "Composting" });
    else if (tt === "long_drop") badges.push({ label: "Long Drop" });

    if (typeof extra.toilet_count === "number") badges.push({ label: `${extra.toilet_count} stalls` });
    if (extra.has_disabled_access) badges.push({ label: "Accessible" });
    if (extra.has_baby_change) badges.push({ label: "Baby Change" });
    if (extra.has_hand_wash) badges.push({ label: "Hand Wash" });
  }

  // ── Shower badges ─────────────────────────────────────────
  if (place.category === "shower") {
    const st = extra.shower_type as string | undefined;
    if (st === "hot") badges.push({ label: "Hot", accent: true });
    else if (st === "solar") badges.push({ label: "Solar Hot" });
    else if (st === "cold") badges.push({ label: "Cold Only", warn: true });

    if (extra.shower_token) badges.push({ label: "Token/Coin" });
    if (typeof extra.shower_count === "number") badges.push({ label: `${extra.shower_count} showers` });

    const sf = extra.shower_fee as string | undefined;
    if (sf && sf !== "free") badges.push({ label: `Fee: ${sf}` });
  }

  // ── Generic badges (all categories) ──────────────────────
  if (extra.powered_sites) badges.push({ label: "Powered" });
  if (extra.has_water && place.category !== "water") badges.push({ label: "Water" });
  if (extra.has_toilets && place.category !== "toilet") badges.push({ label: "Toilets" });
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
            borderRadius: "var(--r-btn)",
            background: b.accent ? "rgba(16,185,129,0.12)" : b.warn ? "rgba(239,68,68,0.10)" : cc.bg,
            color: b.accent ? "#059669" : b.warn ? "#dc2626" : cc.fg,
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
// Camp amenities icon strip
// ──────────────────────────────────────────────────────────────

type AmenityDef = { key: string; icon: LucideIcon; label: string; trueColor: string };

const CAMP_AMENITIES: AmenityDef[] = [
  { key: "has_toilets",         icon: Bath,            label: "Toilets",  trueColor: "#7c3aed" },
  { key: "has_showers",         icon: ShowerHead,      label: "Showers",  trueColor: "#2563eb" },
  { key: "has_water",           icon: Droplets,        label: "Water",    trueColor: "#0891b2" },
  { key: "powered_sites",       icon: Zap,             label: "Power",    trueColor: "#d97706" },
  { key: "has_dump_point",      icon: Trash2,          label: "Dump",     trueColor: "#64748b" },
  { key: "has_bbq",             icon: Flame,           label: "BBQ",      trueColor: "#ea580c" },
  { key: "has_wifi",            icon: Wifi,            label: "WiFi",     trueColor: "#059669" },
  { key: "has_swimming",        icon: Waves,           label: "Swim",     trueColor: "#0284c7" },
  { key: "has_playground",      icon: Baby,            label: "Play",     trueColor: "#7c3aed" },
  { key: "has_laundry",         icon: Shirt,           label: "Laundry",  trueColor: "#475569" },
  { key: "has_kitchen",         icon: UtensilsCrossed, label: "Kitchen",  trueColor: "#92400e" },
  { key: "pets_allowed",        icon: Dog,             label: "Pets",     trueColor: "#b45309" },
  { key: "fires_allowed",       icon: Flame,           label: "Fires",    trueColor: "#dc2626" },
  { key: "has_phone_reception", icon: Signal,          label: "Signal",   trueColor: "#16a34a" },
];

function CampAmenities({ place }: { place: PlaceItem }) {
  if (place.category !== "camp") return null;
  const extra = (place.extra ?? {}) as Record<string, unknown>;
  const visible = CAMP_AMENITIES.filter((a) => extra[a.key] !== undefined).slice(0, 9);
  if (visible.length === 0) return null;

  return (
    <div style={{
      display: "flex", gap: 2, flexWrap: "wrap", marginTop: 6,
      padding: "5px 6px", borderRadius: "var(--r-card)",
      background: "rgba(139,92,246,0.05)", border: "1px solid var(--brand-shared)",
    }}>
      {visible.map((a) => {
        const val = extra[a.key];
        const on = val === true || (typeof val === "string" && val !== "no" && val !== "false");
        const Icon = a.icon;
        const tip = val === "on_lead" ? " (on lead)" : val === "seasonal" ? " (seasonal)" : val === "hours_only" ? " (limited hours)" : "";
        return (
          <div key={a.key} title={a.label + tip} style={{
            display: "flex", flexDirection: "column", alignItems: "center", gap: 2,
            padding: "3px 5px", borderRadius: "var(--r-card)", minWidth: 34, opacity: on ? 1 : 0.28,
          }}>
            <Icon size={13} color={on ? a.trueColor : "var(--roam-text-muted)"} strokeWidth={on ? 2.5 : 1.5} />
            <span style={{
              fontSize: 8, fontWeight: on ? 700 : 400,
              color: on ? a.trueColor : "var(--roam-text-muted)",
              whiteSpace: "nowrap", letterSpacing: 0.2,
            }}>{a.label}</span>
          </div>
        );
      })}
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
  onDetail,
  isOnline,
}: {
  place: PlaceItem | DiscoveredPlace;
  isFocused: boolean;
  onFocus: () => void;
  onAdd: () => void;
  onShowOnMap?: () => void;
  onDetail?: () => void;
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
    if (!t) return onDetail ? onDetail() : onFocus();
    if (t.closest("button,a,input,textarea,select,[role='button']")) return;
    if (onDetail) { haptic.selection(); onDetail(); } else { onFocus(); }
  }

  const stop = (e: SyntheticEvent) => e.stopPropagation();

  return (
    <div
      onClick={handleCardClick}
      style={{
        display: "flex",
        overflow: "hidden",
        borderRadius: "var(--r-card)",
        cursor: "pointer",
        background: "var(--roam-surface)",
        border: isFocused ? `2px solid ${cc.accent}` : "1px solid var(--roam-border)",
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
              borderRadius: "var(--r-card)",
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
                    borderRadius: "var(--r-card)", height: 36, minHeight: 44, padding: "0 12px",
                    fontWeight: 700, fontSize: 12, border: "none",
                    background: cc.accent, color: "white",
                    cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 5,
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
                      borderRadius: "var(--r-card)", height: 36, minHeight: 44, padding: "0 12px",
                      fontWeight: 700, fontSize: 12,
                      border: `1px solid var(--roam-border)`,
                      background: "transparent", color: "var(--roam-text)", cursor: "pointer",
                      display: "inline-flex", alignItems: "center", gap: 5,
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
              {typeof suburb === "string" && suburb ? <span>· {suburb.split(",")[0]}</span> : null}
              {dist ? <span style={{ fontWeight: 600 }}>· {dist}</span> : null}
            </div>
            <ExtraBadges place={place} />
            <CampAmenities place={place} />
          </div>
        </div>

        {/* AI description - prose listing from the guide */}
        {guideDesc ? (
          <div style={{
            fontSize: 13, fontWeight: 500, lineHeight: 1.5,
            color: "var(--roam-text-muted)",
            padding: "4px 0 2px",
            marginTop: 4, paddingTop: 6,
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
                borderRadius: "var(--r-card)", minHeight: 44, padding: "0 14px",
                fontWeight: 700, fontSize: 13, gap: 6,
                border: `1px solid var(--roam-border)`,
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
                borderRadius: "var(--r-card)", minHeight: 44, padding: "0 14px",
                fontWeight: 700, fontSize: 13,
                border: `1px solid var(--roam-border)`,
                background: "transparent", color: "var(--brand-sky)", cursor: "pointer",
                display: "inline-flex", alignItems: "center", gap: 6,
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
  category, places, focusedPlaceId, onFocusPlace, onAddStop, onShowOnMap, onDetailPlace, isOnline,
}: {
  category: string; places: DiscoveredPlace[]; focusedPlaceId: string | null;
  onFocusPlace: (id: string | null) => void; onAddStop: (place: PlaceItem) => void;
  onShowOnMap?: (placeId: string, lat: number, lng: number) => void;
  onDetailPlace?: (place: DiscoveredPlace) => void;
  isOnline: boolean;
}) {
  const Icon = CATEGORY_ICON[category] ?? MapPin;
  const cc = catColor(category);
  const label = fmtCategory(category);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {/* Group header with category color */}
      <div style={{
        display: "flex", alignItems: "center", gap: 8, padding: "8px 12px",
        background: cc.soft, borderRadius: "var(--r-card)",
      }}>
        <div style={{ width: 28, height: 28, borderRadius: "var(--r-card)", background: cc.bg, color: cc.fg, display: "grid", placeItems: "center" }}>
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
          onShowOnMap={onShowOnMap ? () => onShowOnMap(p.id, p.lat, p.lng) : undefined}
          onDetail={onDetailPlace ? () => onDetailPlace(p) : undefined}
          isOnline={isOnline}
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

export type GuideTabBarProps = {
  activeTab: ViewTab;
  setActiveTab: (tab: ViewTab) => void;
  discoveredCount: number;
};

export function GuideView({
  focusedPlaceId, onFocusPlace, onAddStop, isOnline = true, onShowOnMap,
  guideReady = false, guidePack, tripProgress, onSendMessage, chatBusy = false,
  initialTab, autoAskMessage, renderTabBar,
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
  /** If provided, GuideView won't render its own tab bar - caller renders it externally */
  renderTabBar?: (props: GuideTabBarProps) => void;
}) {
  const { openPlace } = usePlaceDetail();
  const [chatInput, setChatInput] = useState("");
  const [activeTab, setActiveTab] = useState<ViewTab>(initialTab ?? "chat");
  const chatEndRef = useRef<HTMLDivElement>(null);
  const [pendingUserMsg, setPendingUserMsg] = useState<string | null>(null);
  const GUIDE_TABS: ViewTab[] = ["chat", "discoveries"];
  const trackRef = useRef<HTMLDivElement>(null);
  const guideContainerRef = useRef<HTMLDivElement>(null);
  const guideSwipe = useRef<{ x: number; y: number; t: number; locked: boolean } | null>(null);

  function getTrackX(tab: ViewTab) {
    return -(GUIDE_TABS.indexOf(tab) * 100) / 2;
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

  // Notify external tab bar renderer on every relevant change
  // (discoveredPlaces is derived below, so we read from guidePack directly here)
  useEffect(() => {
    const count = guidePack?.discovered_places?.length ?? 0;
    renderTabBar?.({ activeTab, setActiveTab, discoveredCount: count });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, guidePack?.discovered_places?.length]);

  // Imperative touch listeners so we can preventDefault on touchmove
  // to block vertical scroll while a horizontal tab-swipe is active.
  useEffect(() => {
    const el = guideContainerRef.current;
    if (!el) return;

    function onTouchStart(e: TouchEvent) {
      const t = e.touches[0];
      guideSwipe.current = { x: t.clientX, y: t.clientY, t: Date.now(), locked: false };
    }

    function onTouchMove(e: TouchEvent) {
      if (!guideSwipe.current) return;
      const t  = e.touches[0];
      const dx = t.clientX - guideSwipe.current.x;
      const dy = t.clientY - guideSwipe.current.y;

      if (!guideSwipe.current.locked) {
        if (Math.abs(dx) < 8) return;
        if (Math.abs(dy) > Math.abs(dx)) { guideSwipe.current = null; return; }
        guideSwipe.current.locked = true;
      }

      // Horizontal swipe locked - block vertical scrolling
      e.preventDefault();

      const currentIndex = GUIDE_TABS.indexOf(activeTab);
      const W = trackRef.current?.offsetWidth ?? window.innerWidth;
      const atEdge = (currentIndex === 0 && dx > 0) || (currentIndex === GUIDE_TABS.length - 1 && dx < 0);
      const offset = atEdge ? dx * 0.18 : dx;
      const basePct = getTrackX(activeTab);
      setTrackTransform(basePct + (offset / W) * 100, false);
    }

    function onTouchEnd(e: TouchEvent) {
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

    el.addEventListener("touchstart", onTouchStart, { passive: true });
    el.addEventListener("touchmove", onTouchMove, { passive: false });
    el.addEventListener("touchend", onTouchEnd, { passive: true });
    return () => {
      el.removeEventListener("touchstart", onTouchStart);
      el.removeEventListener("touchmove", onTouchMove);
      el.removeEventListener("touchend", onTouchEnd);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab]);

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
        suggestions.push({ label: "Lunch spot", desc: "Pub meal or bakery", query: "Where should I stop for lunch? I want a proper feed - pub counter meal, bakery, or good cafe.", Icon: Utensils, color: "#f97316" });
      } else if (hour >= 14 && hour < 17) {
        suggestions.push({ label: "Arvo break", desc: "Stretch & explore", query: "Good spot for an afternoon break? Lookout, swimming hole, or a cold beer somewhere?", Icon: Eye, color: "var(--roam-success)" });
      } else if (hour >= 17 && hour < 20) {
        suggestions.push({ label: "Stay tonight", desc: "Camps, pubs & motels", query: "Where should I stay tonight? Show me the best options - camps, motels, or a pub with rooms.", Icon: Bed, color: "#8b5cf6" });
      } else {
        suggestions.push({ label: "Stop now", desc: "Closest safe option", query: "I need to stop for the night right now. What's the closest safe option - rest area, camp, or motel?", Icon: Tent, color: "#8b5cf6" });
      }

      // Phase-specific discovery
      if (pct < 0.35) {
        suggestions.push({ label: "Hidden gems", desc: "Detours worth taking", query: "Any hidden gems or interesting detours coming up? I've got time to explore.", Icon: Compass, color: "var(--brand-shared)" });
      } else if (pct < 0.65) {
        suggestions.push({ label: "Best ahead", desc: "Don't miss these", query: "What are the absolute must-see stops in the next 100km? Don't let me miss anything good.", Icon: Camera, color: "var(--brand-shared)" });
      }

      // Fatigue awareness
      if (kmDone > 150) {
        suggestions.push({ label: "Need a break", desc: "Stretch the legs", query: "Where's a good spot to stop and stretch? Scenic rest area, waterfall, or swimming hole - anything to break up the drive.", Icon: ParkingMeter, color: "#f59e0b" });
      }

      // Arriving
      if (kmRemaining < 80 && kmRemaining > 5) {
        suggestions.push({ label: "Arriving soon", desc: "What's at the destination", query: "I'm nearly there - what should I know about the destination? Where to eat tonight, any tips?", Icon: Target, color: "var(--roam-success)" });
      }

      // Nature / scenic always welcome
      suggestions.push({ label: "Swim spots", desc: "Gorges, falls & beaches", query: "Any swimming holes, waterfalls, or beaches ahead? Looking for somewhere to cool off.", Icon: Waves, color: "#0891b2" });

    } else {
      // Planning phase - no active trip progress
      suggestions.push({ label: "Route highlights", desc: "Best stops along the way", query: "What are the absolute must-see highlights along this route? Don't let me drive past anything amazing.", Icon: Camera, color: "var(--brand-shared)" });
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
      ref={guideContainerRef}
      style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" }}
    >
      {/* Scoped animations */}
      <style>{`
        @keyframes guideTyping { 0%,80%,100%{opacity:0.3;transform:scale(0.85)} 40%{opacity:1;transform:scale(1.1)} }
        @keyframes guideFadeIn { from{opacity:0;transform:translateY(6px)} to{opacity:1;transform:translateY(0)} }
        @keyframes guidePulse { 0%,100%{opacity:0.6} 50%{opacity:1} }
      `}</style>

      {/* ── Tab switcher (only rendered when not hoisted externally) ── */}
      {!renderTabBar && (
        <div style={{ flexShrink: 0, zIndex: 40, background: "var(--roam-bg)", paddingTop: 8, paddingBottom: 4 }}>
          <div style={{ display: "flex", gap: 2, background: "var(--roam-surface)", borderRadius: "var(--r-card)", padding: 3, border: "1px solid var(--roam-border)" }}>
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
                    flex: 1, borderRadius: "var(--r-card)", border: "none", padding: "10px 8px",
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
      )}

      {/* ════════════════════════════════════════════════════════
          SLIDING TRACK - all tab panels always mounted
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

          {/* Offline banner */}
          {!isOnline && (
            <div style={{
              background: "var(--bg-warn, rgba(255,180,50,0.08))", borderRadius: "var(--r-card)", padding: "12px 16px",
              border: "1px solid var(--roam-warn)",
              display: "flex", alignItems: "center", gap: 10,
              fontSize: 13, fontWeight: 600, color: "var(--text-warn, #e6a040)",
            }}>
              <WifiOff size={16} style={{ flexShrink: 0 }} />
              <span>You&apos;re offline. Chat needs internet, but your saved places in the <strong>Found</strong> tab are available.</span>
            </div>
          )}

          {/* Welcome state - when no messages yet */}
          {thread.length === 0 && !pendingUserMsg ? (
            <div style={{
              background: "var(--roam-surface)", borderRadius: "var(--r-card)", padding: "20px 16px",
              border: "1px solid var(--roam-border)",
            }}>
              {/* Guide identity header */}
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
                <div style={{
                  width: 40, height: 40, borderRadius: "var(--r-card)",
                  overflow: "hidden",
                  boxShadow: "var(--shadow-medium)",
                  flexShrink: 0,
                }}>
                  <img src="/img/roam-app-icon.png" alt="Roam" width={40} height={40} loading="lazy" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
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
                      disabled={!guideReady || chatBusy || !isOnline}
                      style={{
                        borderRadius: "var(--r-card)", border: "none",
                        padding: "12px", textAlign: "left",
                        background: `${s.color}0D`,
                        cursor: guideReady && !chatBusy && isOnline ? "pointer" : "default",
                        opacity: !guideReady || chatBusy || !isOnline ? 0.5 : 1,
                        display: "flex", flexDirection: "column", gap: 6,
                        transition: "transform 0.1s var(--spring, ease), opacity 0.1s",
                        WebkitTapHighlightColor: "transparent",
                      }}
                    >
                      <div style={{
                        width: 30, height: 30, borderRadius: "var(--r-card)",
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
              maxHeight: "calc(100dvh - 270px - var(--bottom-nav-height, 80px) - env(safe-area-inset-bottom, 0px) - var(--roam-keyboard-h, 0px))",
              overflowY: "auto", paddingRight: 2,
              WebkitOverflowScrolling: "touch", overscrollBehaviorX: "contain",
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
                        boxShadow: "var(--shadow-soft)",
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
                        width: 28, height: 28, borderRadius: "var(--r-card)", flexShrink: 0, marginTop: 2,
                        overflow: "hidden",
                        boxShadow: "var(--shadow-soft)",
                      }}>
                        <img src="/img/roam-app-icon.png" alt="Roam" width={28} height={28} loading="lazy" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                      </div>

                      <div style={{
                        flex: 1, padding: "10px 14px", borderRadius: "4px 16px 16px 16px",
                        background: "var(--roam-surface)",
                        border: "1px solid var(--roam-border)",
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

                    {/* Discovery CTA - for tool-resolved messages without save actions */}
                    {m.resolved_tool_id && discoveredPlaces.length > 0 && !(m.actions ?? []).some((a) => a.type === "save") ? (
                      <button
                        type="button"
                        onClick={() => { haptic.selection(); setActiveTab("discoveries"); }}
                        style={{
                          marginTop: 6, marginLeft: 36, padding: "6px 12px",
                          borderRadius: "var(--r-card)", border: "1px solid var(--roam-info)",
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
                    boxShadow: "var(--shadow-soft)",
                  }}>
                    {pendingUserMsg}
                  </div>
                </div>
              ) : null}

              {/* Typing indicator */}
              {chatBusy ? (
                <div style={{ display: "flex", gap: 8, animation: "guideFadeIn 0.2s ease" }}>
                  <div style={{
                    width: 28, height: 28, borderRadius: "var(--r-card)", flexShrink: 0,
                    overflow: "hidden",
                    boxShadow: "var(--shadow-soft)",
                  }}>
                    <img src="/img/roam-app-icon.png" alt="Roam" width={28} height={28} loading="lazy" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                  </div>
                  <div style={{
                    padding: "12px 16px", borderRadius: "4px 16px 16px 16px",
                    background: "var(--roam-surface)",
                    border: "1px solid var(--roam-border)",
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
            paddingBottom: "var(--bottom-nav-height, calc(80px + env(safe-area-inset-bottom, 0px)))",
            display: "flex",
            flexDirection: "column",
            gap: 8,
          }}>
            <form onSubmit={handleSubmit} style={{ display: "flex", gap: 8 }}>
              <div style={{
                flex: 1, display: "flex", alignItems: "center",
                background: "var(--roam-surface)", borderRadius: "var(--r-card)",
                border: "1px solid var(--roam-border)",
                padding: "0 4px 0 16px",
                transition: "border-color 0.15s",
              }}>
                <input
                  type="text"
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  placeholder={isOnline ? "Ask about your route…" : "Guide chat requires internet"}
                  disabled={!isOnline}
                  style={{
                    flex: 1, padding: "13px 0", border: "none", outline: "none",
                    fontSize: 14, fontWeight: 500, background: "transparent",
                    color: "var(--roam-text)",
                  }}
                />
                <button
                  type="submit"
                  disabled={!guideReady || chatBusy || !chatInput.trim() || !isOnline}
                  style={{
                    width: 44, height: 44, borderRadius: "var(--r-card)", border: "none",
                    background: chatInput.trim() && isOnline ? "var(--brand-sky)" : "transparent",
                    color: chatInput.trim() && isOnline ? "white" : "var(--roam-text-muted)",
                    cursor: chatInput.trim() && isOnline ? "pointer" : "default",
                    display: "grid", placeItems: "center",
                    transition: "all 0.15s ease",
                    opacity: !guideReady || chatBusy || !isOnline ? 0.4 : 1,
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
                        flex: "0 0 auto", borderRadius: "var(--r-card)", border: "none",
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
              background: "var(--roam-surface)", borderRadius: "var(--r-card)", padding: 32, textAlign: "center",
              border: "1px solid var(--roam-border)",
            }}>
              <div style={{
                width: 52, height: 52, borderRadius: "var(--r-card)", margin: "0 auto 14px",
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
                  marginTop: 16, borderRadius: "var(--r-card)", border: "none", padding: "10px 20px",
                  fontSize: 14, fontWeight: 700,
                  background: "var(--brand-sky)", color: "white", cursor: "pointer",
                  display: "inline-flex", alignItems: "center", gap: 8,
                  boxShadow: "var(--shadow-soft)",
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
                background: "var(--roam-surface)", borderRadius: "var(--r-card)", padding: "12px 16px",
                border: "1px solid var(--roam-border)",
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
                    borderRadius: "var(--r-card)", border: "1px solid var(--roam-border)",
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
                  onAddStop={onAddStop} onShowOnMap={onShowOnMap}
                  onDetailPlace={openPlace}
                  isOnline={isOnline}
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
