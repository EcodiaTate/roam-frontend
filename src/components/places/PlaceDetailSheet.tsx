// src/components/places/PlaceDetailSheet.tsx
//
// Bottom-sheet detail view for any PlaceItem / DiscoveredPlace.
// Opens from the global PlaceDetailContext - any component can call
// openPlace(place) to show this sheet.
//
// Layout: satellite map hero (with drag handle overlay) → header →
//         hero image → AI description → quick actions → attributes →
//         location → Wikipedia → OSM attribution


import {
    useRef,
    useEffect,
    useState,
    useCallback,
    type ReactNode,
} from "react";
import { lazy, Suspense } from "react";
import type { PlaceExtra } from "@/lib/types/places";
import { usePlaceDetail } from "@/lib/context/PlaceDetailContext";
import { parseOpeningHours, ohToHuman } from "@/lib/utils/openingHours";
import { haptic } from "@/lib/native/haptics";

const PlaceMapPreview = lazy(() => import("@/components/places/PlaceMapPreview"));

import { CATEGORY_ICON, getCategoryColor } from "@/lib/places/categoryMeta";
import { AmenityGrid, type AmenityItem } from "@/components/ui/AmenityGrid";
import { fmtDist, fmtCategory, normalizeUrl, safeOpen, cleanPhone } from "@/lib/places/format";

import {
    X,
    Phone,
    Globe,
    Share2,
    Navigation,
    Plus,
    Bookmark,
    MapPin,
    Clock,
    Zap,
    Fuel,
    Bath,
    Droplets,
    Trash2,
    Thermometer,
    Baby,
    Star,
    Banknote,
    Flag,
    Compass,
    ChevronRight,
    ExternalLink,
    WifiOff,
    CheckCircle2,
    XCircle,
    Map as MapIcon,
    type LucideIcon,
} from "lucide-react";

const catColor = getCategoryColor;

function fmtCoord(val: number, isLat: boolean): string {
  const dir = isLat ? (val >= 0 ? "N" : "S") : (val >= 0 ? "E" : "W");
  return `${Math.abs(val).toFixed(5)}° ${dir}`;
}

// ── Sub-components ──────────────────────────────────────────

function SectionHeader({ title }: { title: string }) {
  return (
    <div style={{
      fontSize: "var(--font-xs)",
      fontWeight: 800,
      textTransform: "uppercase",
      letterSpacing: "0.6px",
      color: "var(--roam-text-muted)",
      marginBottom: 8,
    }}>
      {title}
    </div>
  );
}

function AttrRow({ Icon, label, value, accent }: {
  Icon: LucideIcon;
  label: string;
  value: ReactNode;
  accent?: string;
}) {
  return (
    <div style={{
      display: "flex",
      alignItems: "flex-start",
      gap: 12,
      padding: "10px 0",
      borderBottom: "1px solid var(--roam-border)",
    }}>
      <div style={{
        width: 32,
        height: 32,
        borderRadius: "var(--r-card)",
        background: accent ? `${accent}18` : "var(--roam-surface-hover)",
        color: accent ?? "var(--roam-text-muted)",
        display: "grid",
        placeItems: "center",
        flexShrink: 0,
        marginTop: 1,
      }}>
        <Icon size={15} strokeWidth={2} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: "var(--font-xs)", fontWeight: 700, color: "var(--roam-text-muted)", marginBottom: 2 }}>
          {label}
        </div>
        <div style={{ fontSize: "var(--font-sm)", fontWeight: 600, color: "var(--roam-text)", lineHeight: 1.4 }}>
          {value}
        </div>
      </div>
    </div>
  );
}

function BoolRow({ Icon, label, value }: { Icon: LucideIcon; label: string; value: boolean }) {
  return (
    <div style={{
      display: "flex",
      alignItems: "center",
      gap: 10,
      padding: "8px 0",
      borderBottom: "1px solid var(--roam-border)",
    }}>
      <Icon size={15} strokeWidth={2} style={{ color: "var(--roam-text-muted)", flexShrink: 0 }} />
      <span style={{ flex: 1, fontSize: "var(--font-sm)", fontWeight: 600, color: "var(--roam-text)" }}>{label}</span>
      {value
        ? <CheckCircle2 size={16} style={{ color: "var(--brand-eucalypt)", flexShrink: 0 }} />
        : <XCircle size={16} style={{ color: "var(--roam-text-muted)", opacity: 0.4, flexShrink: 0 }} />
      }
    </div>
  );
}

function FacilityChip({ label, active }: { label: string; active: boolean }) {
  return (
    <span style={{
      display: "inline-flex",
      alignItems: "center",
      gap: 4,
      padding: "5px 10px",
      borderRadius: "var(--r-pill)",
      fontSize: "var(--font-xs)",
      fontWeight: 700,
      background: active ? "var(--accent-tint)" : "var(--roam-surface-hover)",
      color: active ? "var(--brand-eucalypt)" : "var(--roam-text-muted)",
      border: active ? "2px solid var(--roam-success)" : "2px solid var(--roam-border)",
    }}>
      {active && <CheckCircle2 size={11} />}
      {label}
    </span>
  );
}

// ── Quick action button ──────────────────────────────────────

function ActionBtn({
  Icon, label, color, onClick, href, filled,
}: {
  Icon: LucideIcon;
  label: string;
  color: string;
  onClick?: () => void;
  href?: string;
  filled?: boolean;
}) {
  const inner = (
    <div style={{
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      gap: 6,
      flex: 1,
    }}>
      <div style={{
        width: 48,
        height: 48,
        borderRadius: "var(--r-card)",
        background: `${color}18`,
        color: color,
        display: "grid",
        placeItems: "center",
      }}>
        <Icon size={20} strokeWidth={2} fill={filled ? "currentColor" : "none"} />
      </div>
      <span style={{
        fontSize: "var(--font-xxs)",
        fontWeight: 700,
        color: "var(--roam-text-muted)",
        letterSpacing: "0.2px",
      }}>
        {label}
      </span>
    </div>
  );

  const baseStyle: React.CSSProperties = {
    background: "transparent",
    border: "none",
    padding: 0,
    cursor: "pointer",
    WebkitTapHighlightColor: "transparent",
    touchAction: "manipulation",
    display: "flex",
    flex: 1,
    justifyContent: "center",
  };

  if (href) {
    return (
      <a href={href} style={{ ...baseStyle, textDecoration: "none" }} onClick={() => haptic.light()}>
        {inner}
      </a>
    );
  }

  return (
    <button type="button" style={baseStyle} onClick={() => { haptic.light(); onClick?.(); }}>
      {inner}
    </button>
  );
}

// ── Swipe-to-dismiss hook ────────────────────────────────────
// Pointer events for both touch and mouse.

function useSwipeToDismiss(onDismiss: () => void) {
  const sheetRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ startY: number; pointerId: number } | null>(null);

  useEffect(() => {
    const sheet = sheetRef.current;
    if (!sheet) return;

    const handleEl = sheet.querySelector(".place-detail-drag-zone") as HTMLElement | null;
    const target = handleEl ?? sheet;

    function onPointerDown(e: PointerEvent) {
      if (e.button !== 0) return;
      dragRef.current = { startY: e.clientY, pointerId: e.pointerId };
      target.setPointerCapture(e.pointerId);
    }

    function onPointerMove(e: PointerEvent) {
      if (!dragRef.current || e.pointerId !== dragRef.current.pointerId || !sheet) return;
      const dy = e.clientY - dragRef.current.startY;
      if (dy < 0) return;
      sheet.style.transition = "none";
      sheet.style.transform = `translateY(${dy}px)`;
    }

    function onPointerUp(e: PointerEvent) {
      if (!dragRef.current || e.pointerId !== dragRef.current.pointerId || !sheet) {
        dragRef.current = null;
        return;
      }
      const dy = e.clientY - dragRef.current.startY;
      dragRef.current = null;
      sheet.style.transition = "";

      if (dy > 110) {
        sheet.style.transform = "translateY(120%)";
        setTimeout(onDismiss, 280);
      } else {
        sheet.style.transform = "";
      }
    }

    function onPointerCancel(e: PointerEvent) {
      if (!dragRef.current || e.pointerId !== dragRef.current.pointerId || !sheet) return;
      dragRef.current = null;
      sheet.style.transition = "";
      sheet.style.transform = "";
    }

    target.addEventListener("pointerdown", onPointerDown);
    target.addEventListener("pointermove", onPointerMove);
    target.addEventListener("pointerup", onPointerUp);
    target.addEventListener("pointercancel", onPointerCancel);

    return () => {
      target.removeEventListener("pointerdown", onPointerDown);
      target.removeEventListener("pointermove", onPointerMove);
      target.removeEventListener("pointerup", onPointerUp);
      target.removeEventListener("pointercancel", onPointerCancel);
    };
  }, [onDismiss]);

  return sheetRef;
}

// ══════════════════════════════════════════════════════════════
// PLACE DETAIL SHEET - MAIN COMPONENT
// ══════════════════════════════════════════════════════════════

export function PlaceDetailSheet({
  isOnline = true,
  onNavigate,
}: {
  isOnline?: boolean;
  onNavigate?: (placeId: string, lat: number, lng: number, name: string) => void;
}) {
  const { place, closePlace, navigateHandler: contextNavigate, saveHandler: contextSave, showOnMapHandler: contextShowOnMap, savedIds, setSavedIds, stopPlaceIds } = usePlaceDetail();
  const [imgError, setImgError] = useState(false);
  const [visible, setVisible] = useState(false);

  // Reset image error when place changes
  const prevPlaceRef = useRef(place);
  if (prevPlaceRef.current !== place) {
    prevPlaceRef.current = place;
    if (place && imgError) setImgError(false);
  }

  useEffect(() => {
    if (place) {
      requestAnimationFrame(() => requestAnimationFrame(() => setVisible(true)));
    } else {
      setVisible(false);
    }
  }, [place]);

  const handleClose = useCallback(() => {
    setVisible(false);
    haptic.light();
    setTimeout(closePlace, 280);
  }, [closePlace]);

  const sheetRef = useSwipeToDismiss(handleClose);

  useEffect(() => {
    if (!place) return;
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") handleClose(); }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [place, handleClose]);

  if (!place) return null;

  const p = place;
  const extra = (place.extra ?? {}) as PlaceExtra & Record<string, unknown>;
  const cc = catColor(place.category);
  const CatIcon = CATEGORY_ICON[place.category] ?? MapPin;

  const dist = fmtDist(place.distance_from_user_km);
  const ohStatus = parseOpeningHours(extra.opening_hours, new Date());
  const phone = extra.phone ? cleanPhone(String(extra.phone)) : null;
  const website = extra.website ? normalizeUrl(String(extra.website)) : null;
  const address = extra.address ? String(extra.address) : null;
  const brand = extra.brand ? String(extra.brand) : null;
  const operator = extra.operator ? String(extra.operator) : null;
  const brandLabel = brand ?? operator ?? null;
  const feeStr = extra.fee ? String(extra.fee) : null;
  const accessStr = extra.access ? String(extra.access) : null;
  const capacityStr = extra.capacity ? String(extra.capacity) : null;
  const descriptionStr = extra.description ? String(extra.description) : null;
  const thumbnailUrl = extra.thumbnail_url ? String(extra.thumbnail_url) : null;
  const guideDesc = place.guide_description ?? null;
  const stars = typeof extra.stars === "number" ? extra.stars : null;
  const wheelchair = extra.wheelchair;
  const kmFromStart = place.km_from_start;

  const fuelTypes = Array.isArray(extra.fuel_types) ? (extra.fuel_types as string[]) : [];
  const socketTypes = Array.isArray(extra.socket_types) ? (extra.socket_types as string[]) : [];

  // Fuel prices (from map marker data or bundle)
  type FuelPrice = { fuel_type: string; price_cents: number };
  let fuelPrices: FuelPrice[] = [];
  try {
    const raw = extra.fuel_prices_json;
    if (typeof raw === "string" && raw.length > 2) {
      fuelPrices = JSON.parse(raw) as FuelPrice[];
    }
  } catch {}

  // EV connector details (from map marker data)
  type EvConnector = { type: string; power_kw?: number | null; quantity: number };
  let evConnectors: EvConnector[] = [];
  try {
    const raw = extra.connectors_json;
    if (typeof raw === "string" && raw.length > 2) {
      evConnectors = JSON.parse(raw) as EvConnector[];
    }
  } catch {}
  const evMaxPower = typeof extra.max_power_kw === "number" ? extra.max_power_kw : null;
  const evCost = extra.usage_cost ? String(extra.usage_cost) : null;
  const evOperational = extra.is_operational;

  const hasPowered = !!extra.powered_sites;
  const hasWater = !!extra.has_water;
  const hasToilets = !!extra.has_toilets;
  const isFree = !!extra.free;

  const dumpType = extra.dump_type as string | undefined;
  const dumpFee = extra.dump_fee as string | undefined;
  const dumpAccess = extra.dump_access as string | undefined;
  const hasRinse = !!extra.has_rinse;
  const hasPotableAtDump = !!extra.has_potable_water_at_dump;

  const waterType = extra.water_type as string | undefined;
  const waterFlow = extra.water_flow as string | undefined;
  const waterTreated = extra.water_treated as boolean | undefined;
  const waterAlways = extra.water_always_available as boolean | undefined;

  const toiletType = extra.toilet_type as string | undefined;
  const toiletCount = typeof extra.toilet_count === "number" ? extra.toilet_count : null;
  const hasBabyChange = !!extra.has_baby_change;
  const hasDisabled = !!extra.has_disabled_access;
  const hasHandWash = !!extra.has_hand_wash;
  const toiletMaintained = extra.toilet_maintained as boolean | undefined;

  const showerType = extra.shower_type as string | undefined;
  const showerFee = extra.shower_fee as string | undefined;
  const showerToken = !!extra.shower_token;
  const showerCount = typeof extra.shower_count === "number" ? extra.shower_count : null;

  const hasHeroImage = !imgError && !!thumbnailUrl;

  const hasContact = !!(phone || website);
  const hasFuelAttrs = fuelTypes.length > 0 || extra.has_diesel || extra.has_unleaded || extra.has_lpg;
  const hasEvAttrs = socketTypes.length > 0;
  const hasCampAttrs = hasPowered || (place.category === "camp" && (hasWater || hasToilets));
  const hasDumpAttrs = !!(dumpType || dumpFee || dumpAccess || hasRinse || hasPotableAtDump);
  const hasWaterAttrs = !!(waterType || waterFlow || waterTreated != null || waterAlways != null);
  const hasToiletAttrs = !!(toiletType || toiletCount || hasBabyChange || hasDisabled || hasHandWash || toiletMaintained != null);
  const hasShowerAttrs = !!(showerType || showerFee || showerToken || showerCount);
  const hasAccessCost = !!(feeStr || accessStr || isFree || wheelchair);

  const isSaved = savedIds.has(place.id);

  function handleNavigate() {
    haptic.medium();
    const handler = onNavigate ?? contextNavigate;
    if (handler) {
      handler(p.id, p.lat, p.lng, p.name);
    }
    // No fallback to Google Maps - navigation is handled in-house
  }

  function handleShowOnMap() {
    haptic.medium();
    contextShowOnMap?.(p.id, p.lat, p.lng);
  }

  function handleShare() {
    haptic.light();
    const text = `${p.name}\n${fmtCategory(p.category)}\n📍 ${fmtCoord(p.lat, true)}, ${fmtCoord(p.lng, false)}`;
    if (typeof navigator !== "undefined" && "share" in navigator) {
      navigator.share({ title: p.name, text }).catch(() => {});
    }
  }

  function handleSave() {
    haptic.success();
    // Optimistic toggle - flip savedIds immediately, handler syncs in background
    const next = new Set(savedIds);
    if (isSaved) { next.delete(p.id); } else { next.add(p.id); }
    setSavedIds(next);
    contextSave?.(p.id);
  }

  return (
    <div
      className="place-detail-backdrop"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 200,
        background: visible ? "var(--overlay-bg)" : "transparent",
        backdropFilter: visible ? "blur(4px)" : "none",
        WebkitBackdropFilter: visible ? "blur(4px)" : "none",
        transition: "background 0.28s ease, backdrop-filter 0.28s ease",
        display: "flex",
        flexDirection: "column",
        justifyContent: "flex-end",
        pointerEvents: place ? "auto" : "none",
      }}
      onClick={(e) => { if (e.target === e.currentTarget) handleClose(); }}
      role="dialog"
      aria-modal="true"
      aria-label={`Details for ${place.name}`}
    >
      <div
        ref={sheetRef}
        className="place-detail-sheet"
        data-visible={visible}
        style={{
          background: "var(--roam-surface)",
          borderRadius: "28px 28px 0 0",
          boxShadow: "var(--shadow-sheet)",
          transform: visible ? "translateY(0)" : "translateY(100%)",
          transition: "transform 0.28s cubic-bezier(0.34,1.12,0.64,1)",
          maxHeight: "92dvh",
          width: "100%",
          maxWidth: 420,
          marginLeft: "auto",
          marginRight: "auto",
          display: "flex",
          flexDirection: "column",
          overflowY: "hidden",
          touchAction: "none",
          willChange: "transform",
          contain: "layout style",
        }}
      >

        {/* ── Map hero with overlaid drag handle ────────────── */}
        <div
          className="place-detail-drag-zone"
          style={{
            position: "relative",
            flexShrink: 0,
            cursor: "grab",
            touchAction: "none",
          }}
        >
          <Suspense fallback={null}>
            <PlaceMapPreview
              lat={place.lat}
              lng={place.lng}
              color={cc.accent}
              height={150}
              zoom={11}
              styleId="roam-basemap-hybrid"
              radius={0}
            />
          </Suspense>

          {/* Drag handle */}
          <div style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            padding: "12px 0",
            display: "flex",
            justifyContent: "center",
            pointerEvents: "none",
          }}>
            <div style={{
              width: 36, height: 5,
              background: "rgba(255,255,255,0.8)",
              borderRadius: "var(--r-card)",
              boxShadow: "var(--shadow-soft)",
            }} />
          </div>

          {/* Close button */}
          <button
            type="button"
            onClick={handleClose}
            style={{
              position: "absolute",
              top: 8,
              right: 8,
              width: 44, height: 44,
              borderRadius: "50%",
              border: "none",
              background: "rgba(0,0,0,0.4)",
              backdropFilter: "blur(8px)",
              WebkitBackdropFilter: "blur(8px)",
              color: "var(--on-color)",
              display: "grid",
              placeItems: "center",
              cursor: "pointer",
              touchAction: "manipulation",
              WebkitTapHighlightColor: "transparent",
              zIndex: 1,
            }}
          >
            <X size={18} strokeWidth={2.5} />
          </button>
        </div>

        {/* ── Scrollable body ────────────────────────────────── */}
        <div style={{
          flex: 1,
          overflowY: "auto",
          WebkitOverflowScrolling: "touch" as React.CSSProperties["WebkitOverflowScrolling"],
          overscrollBehaviorX: "contain",
          overscrollBehaviorY: "contain",
          touchAction: "pan-y",
          paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 20px)",
        }}>

          {/* ── HEADER ─────────────────────────────────────── */}
          <div style={{ padding: "16px 16px 16px" }}>
            <div style={{ marginBottom: 8 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
                <CatIcon size={14} strokeWidth={2.5} style={{ color: cc.fg }} />
                <span style={{
                  fontSize: "var(--font-xs)",
                  fontWeight: 700,
                  color: cc.fg,
                  textTransform: "capitalize",
                  letterSpacing: "0.3px",
                }}>
                  {fmtCategory(place.category)}
                  {brandLabel ? ` · ${brandLabel}` : ""}
                </span>
              </div>

              <h1 style={{
                fontSize: "var(--font-h2)",
                fontWeight: 800,
                color: "var(--roam-text)",
                lineHeight: 1.2,
                margin: 0,
              }}>
                {place.name}
              </h1>

              {stars != null && (
                <div style={{ display: "flex", alignItems: "center", gap: 2, marginTop: 4 }}>
                  {Array.from({ length: 5 }, (_, i) => (
                    <Star
                      key={i}
                      size={12}
                      fill={i < stars ? "var(--brand-amber)" : "none"}
                      stroke={i < stars ? "var(--brand-amber)" : "var(--roam-text-muted)"}
                      strokeWidth={2}
                    />
                  ))}
                  <span style={{ fontSize: "var(--font-xs)", color: "var(--roam-text-muted)", marginLeft: 4 }}>
                    {stars}-star
                  </span>
                </div>
              )}
            </div>

            {/* Distance + hours */}
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
              {dist && (
                <span style={{
                  display: "inline-flex", alignItems: "center", gap: 4,
                  fontSize: "var(--font-sm)", fontWeight: 700,
                  color: "var(--roam-text-muted)",
                }}>
                  <Navigation size={12} strokeWidth={2.5} />
                  {dist}
                </span>
              )}
              {kmFromStart != null && (
                <span style={{
                  fontSize: "var(--font-sm)", fontWeight: 600,
                  color: "var(--roam-text-muted)",
                }}>
                  · {kmFromStart.toFixed(0)} km from start
                </span>
              )}
              {ohStatus && (
                <span style={{
                  display: "inline-flex", alignItems: "center", gap: 4,
                  padding: "3px 8px",
                  borderRadius: "var(--r-pill)",
                  fontSize: "var(--font-xs)",
                  fontWeight: 700,
                  background: ohStatus.isOpen ? "var(--accent-tint)" : "var(--roam-surface-hover)",
                  color: ohStatus.isOpen ? "var(--brand-eucalypt)" : "var(--roam-text-muted)",
                }}>
                  <Clock size={10} strokeWidth={3} />
                  {ohStatus.label}
                </span>
              )}
            </div>
          </div>

          {/* ── HERO IMAGE ─────────────────────────────────── */}
          {hasHeroImage && thumbnailUrl && (
            <div style={{
              position: "relative",
              width: "calc(100% - 32px)",
              margin: "0 16px 16px",
              height: 180,
              background: cc.soft,
              borderRadius: "var(--r-card)",
              overflow: "hidden",
            }}>
              <img
                src={thumbnailUrl}
                alt={place.name}
                loading="eager"
                className="terra-img-reveal revealed"
                style={{ objectFit: "cover", width: "100%", height: "100%", position: "absolute", inset: 0 }}
                onError={() => setImgError(true)}
              />
              <div style={{
                position: "absolute",
                inset: 0,
                background: "linear-gradient(to bottom, transparent 50%, rgba(0,0,0,0.35) 100%)",
                pointerEvents: "none",
              }} />
            </div>
          )}

          <div style={{ padding: "0 16px", display: "flex", flexDirection: "column", gap: 20 }}>

            {/* ── AI DESCRIPTION ─────────────────────────── */}
            {guideDesc && (
              <div style={{
                padding: "14px 16px",
                borderRadius: "var(--r-card)",
                background: `${cc.accent}0f`,
                borderLeft: `3px solid ${cc.accent}`,
              }}>
                <div style={{
                  fontSize: "var(--font-xxs)",
                  fontWeight: 800,
                  textTransform: "uppercase",
                  letterSpacing: "0.6px",
                  color: cc.fg,
                  marginBottom: 6,
                  display: "flex",
                  alignItems: "center",
                  gap: 4,
                }}>
                  ✦ Guide note
                </div>
                <p style={{
                  margin: 0,
                  fontSize: "var(--font-sm)",
                  fontWeight: 500,
                  lineHeight: 1.55,
                  color: "var(--roam-text)",
                }}>
                  {guideDesc}
                </p>
              </div>
            )}

            {/* OSM description */}
            {descriptionStr && descriptionStr !== guideDesc && (
              <p style={{
                margin: 0,
                fontSize: "var(--font-sm)",
                lineHeight: 1.55,
                color: "var(--roam-text-muted)",
                fontWeight: 500,
              }}>
                {descriptionStr}
              </p>
            )}

            {/* ── QUICK ACTIONS ───────────────────────────── */}
            <div>
              <SectionHeader title="Actions" />
              <div style={{
                display: "flex",
                flexWrap: "wrap",
                gap: 8,
                padding: "12px 8px",
                borderRadius: "var(--r-card)",
                background: "var(--roam-surface-hover)",
              }}>
                {(onNavigate ?? contextNavigate) && (
                  stopPlaceIds.has(p.id) ? (
                    <div style={{ opacity: 0.45, pointerEvents: "none", flex: 1, display: "flex", justifyContent: "center" }}>
                      <ActionBtn
                        Icon={Plus}
                        label="In trip"
                        color="var(--roam-text-muted)"
                      />
                    </div>
                  ) : (
                    <ActionBtn
                      Icon={Plus}
                      label="Add to trip"
                      color="var(--brand-eucalypt)"
                      onClick={handleNavigate}
                    />
                  )
                )}
                {phone && (
                  <ActionBtn Icon={Phone} label="Call" color="var(--brand-sky)" href={`tel:${phone}`} />
                )}
                {website && isOnline && (
                  <ActionBtn Icon={Globe} label="Website" color="var(--brand-sky)" onClick={() => safeOpen(website)} />
                )}
                {contextShowOnMap && (
                  <ActionBtn Icon={MapIcon} label="Map" color="var(--brand-sky)" onClick={handleShowOnMap} />
                )}
                <ActionBtn Icon={Share2} label="Share" color="var(--roam-text-muted)" onClick={handleShare} />
                {contextSave && (
                  <ActionBtn
                    Icon={Bookmark}
                    label={isSaved ? "Saved" : "Save"}
                    color={isSaved ? "var(--brand-eucalypt)" : "var(--brand-amber)"}
                    filled={isSaved}
                    onClick={handleSave}
                  />
                )}
              </div>
            </div>

            {/* ── CONTACT ─────────────────────────────────── */}
            {hasContact && (
              <div>
                <SectionHeader title="Contact" />
                <div style={{ borderRadius: "var(--r-card)", background: "var(--roam-surface-hover)", overflow: "hidden", padding: "0 14px" }}>
                  {phone && (
                    <AttrRow
                      Icon={Phone}
                      label="Phone"
                      accent="var(--brand-sky)"
                      value={
                        <a
                          href={`tel:${phone}`}
                          style={{ color: "var(--brand-sky)", textDecoration: "none", fontWeight: 700 }}
                          onClick={() => haptic.light()}
                        >
                          {phone}
                        </a>
                      }
                    />
                  )}
                  {website && (
                    <AttrRow
                      Icon={Globe}
                      label="Website"
                      accent="var(--brand-sky)"
                      value={
                        <button
                          type="button"
                          onClick={() => { haptic.light(); safeOpen(website); }}
                          style={{
                            background: "none", border: "none", padding: 0,
                            color: "var(--brand-sky)", fontWeight: 700,
                            fontSize: "var(--font-sm)", cursor: "pointer",
                            display: "flex", alignItems: "center", gap: 4,
                            WebkitTapHighlightColor: "transparent",
                          }}
                        >
                          {website.replace(/^https?:\/\//, "").replace(/\/$/, "")}
                          <ExternalLink size={11} />
                        </button>
                      }
                    />
                  )}
                </div>
              </div>
            )}

            {/* ── HOURS ───────────────────────────────────── */}
            {extra.opening_hours && (
              <div>
                <SectionHeader title="Hours" />
                <div style={{ borderRadius: "var(--r-card)", background: "var(--roam-surface-hover)", overflow: "hidden", padding: "0 14px" }}>
                  <AttrRow
                    Icon={Clock}
                    label="Opening Hours"
                    accent={ohStatus?.isOpen ? "var(--brand-eucalypt)" : "var(--roam-text-muted)"}
                    value={
                      <div>
                        <div style={{
                          fontWeight: 700,
                          color: ohStatus?.isOpen ? "var(--brand-eucalypt)" : "var(--roam-danger)",
                          marginBottom: 2,
                        }}>
                          {ohStatus?.isOpen ? "Open" : "Closed"}
                          {ohStatus?.nextLabel ? ` · ${ohStatus.nextLabel}` : ""}
                        </div>
                        <div style={{ fontSize: "var(--font-xs)", color: "var(--roam-text-muted)", fontWeight: 500 }}>
                          {ohToHuman(String(extra.opening_hours))}
                        </div>
                      </div>
                    }
                  />
                </div>
              </div>
            )}

            {/* ── FUEL TYPES + PRICES ──────────────────────── */}
            {hasFuelAttrs && (
              <div>
                <SectionHeader title="Fuel Available" />
                {fuelPrices.length > 0 ? (
                  <div style={{ borderRadius: "var(--r-card)", background: "var(--roam-surface-hover)", overflow: "hidden", padding: "0 14px" }}>
                    {fuelPrices
                      .sort((a, b) => {
                        const order = ["unleaded", "e10", "premium_unleaded_95", "premium_unleaded_98", "diesel", "premium_diesel", "lpg"];
                        return (order.indexOf(a.fuel_type) === -1 ? 99 : order.indexOf(a.fuel_type)) - (order.indexOf(b.fuel_type) === -1 ? 99 : order.indexOf(b.fuel_type));
                      })
                      .map((fp) => (
                        <div key={fp.fuel_type} style={{
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                          padding: "10px 0",
                          borderBottom: "1px solid var(--roam-border)",
                        }}>
                          <span style={{ fontSize: "var(--font-sm)", fontWeight: 600, color: "var(--roam-text-muted)", textTransform: "capitalize" }}>
                            <Fuel size={12} style={{ display: "inline", verticalAlign: "middle", marginRight: 6 }} />
                            {fp.fuel_type.replace(/_/g, " ")}
                          </span>
                          <span style={{ fontSize: "var(--font-sm)", fontWeight: 800, color: "var(--roam-text)" }}>
                            ${(fp.price_cents / 100).toFixed(2)}/L
                          </span>
                        </div>
                      ))}
                  </div>
                ) : (
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                    {fuelTypes.map((f) => (
                      <span key={f} style={{
                        padding: "6px 12px",
                        borderRadius: "var(--r-pill)",
                        fontSize: "var(--font-sm)",
                        fontWeight: 700,
                        background: "var(--severity-minor-tint)",
                        color: "var(--roam-warn)",
                        border: "1px solid var(--roam-border-strong)",
                        textTransform: "capitalize",
                      }}>
                        <Fuel size={12} style={{ display: "inline", verticalAlign: "middle", marginRight: 4 }} />
                        {f.replace(/_/g, " ")}
                      </span>
                    ))}
                    {extra.has_diesel && !fuelTypes.includes("diesel") && <FacilityChip label="Diesel" active />}
                    {extra.has_unleaded && !fuelTypes.includes("unleaded") && <FacilityChip label="Unleaded" active />}
                    {extra.has_lpg && !fuelTypes.includes("lpg") && <FacilityChip label="LPG" active />}
                  </div>
                )}
              </div>
            )}

            {/* ── EV SOCKETS / CHARGER DETAILS ─────────────── */}
            {(hasEvAttrs || evConnectors.length > 0) && (
              <div>
                <SectionHeader title="Charging" />
                {evOperational != null && (
                  <div style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 6,
                    padding: "4px 10px",
                    borderRadius: "var(--r-pill)",
                    fontSize: "var(--font-xs)",
                    fontWeight: 800,
                    marginBottom: 8,
                    background: evOperational ? "var(--accent-tint)" : "var(--danger-tint)",
                    color: evOperational ? "var(--roam-success)" : "var(--roam-danger)",
                  }}>
                    {evOperational ? "Operational" : "Out of Service"}
                  </div>
                )}
                {evConnectors.length > 0 ? (
                  <div style={{ borderRadius: "var(--r-card)", background: "var(--roam-surface-hover)", overflow: "hidden", padding: "0 14px" }}>
                    {evConnectors.map((cn, i) => (
                      <div key={`${cn.type}-${i}`} style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        padding: "10px 0",
                        borderBottom: "1px solid var(--roam-border)",
                      }}>
                        <span style={{ fontSize: "var(--font-sm)", fontWeight: 600, color: "var(--roam-text-muted)" }}>
                          <Zap size={12} style={{ display: "inline", verticalAlign: "middle", marginRight: 6 }} />
                          {cn.type}{cn.quantity > 1 ? ` x${cn.quantity}` : ""}
                        </span>
                        {cn.power_kw ? (
                          <span style={{ fontSize: "var(--font-sm)", fontWeight: 800, color: "var(--roam-text)" }}>
                            {cn.power_kw}kW
                          </span>
                        ) : null}
                      </div>
                    ))}
                    {evCost && (
                      <div style={{ padding: "10px 0", fontSize: "var(--font-xs)", fontWeight: 600, color: "var(--roam-text-muted)" }}>
                        {evCost}
                      </div>
                    )}
                  </div>
                ) : (
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                    {socketTypes.map((s) => (
                      <span key={s} style={{
                        padding: "6px 12px",
                        borderRadius: "var(--r-pill)",
                        fontSize: "var(--font-sm)",
                        fontWeight: 700,
                        background: "rgba(16,185,129,0.1)",
                        color: "var(--roam-success)",
                        border: "1px solid var(--roam-success)",
                        textTransform: "capitalize",
                      }}>
                        <Zap size={12} style={{ display: "inline", verticalAlign: "middle", marginRight: 4 }} />
                        {s.replace(/_/g, " ")}
                      </span>
                    ))}
                    {evMaxPower && (
                      <span style={{
                        padding: "6px 12px",
                        borderRadius: "var(--r-pill)",
                        fontSize: "var(--font-sm)",
                        fontWeight: 700,
                        background: "var(--roam-surface-hover)",
                        color: "var(--roam-text-muted)",
                        border: "1px solid var(--roam-border)",
                      }}>
                        {evMaxPower}kW max
                      </span>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* ── AMENITY GRID (quick-glance overview) ────── */}
            {(() => {
              const amenities: AmenityItem[] = [];
              if (hasWater) amenities.push({ icon: "water_drop", label: "Water" });
              if (hasToilets) amenities.push({ icon: "wc", label: "Toilets" });
              if (hasPowered) amenities.push({ icon: "power", label: "Powered Sites" });
              if (isFree) amenities.push({ icon: "money_off", label: "Free" });
              if (extra.has_showers || hasShowerAttrs) amenities.push({ icon: "shower", label: "Showers" });
              if (extra.pets_allowed || extra.dogs_allowed) amenities.push({ icon: "pets", label: "Pet Friendly" });
              if (wheelchair === "yes") amenities.push({ icon: "accessible", label: "Accessible" });
              if (extra.has_bbq) amenities.push({ icon: "outdoor_grill", label: "BBQ" });
              if (extra.has_picnic_table) amenities.push({ icon: "table_restaurant", label: "Picnic Table" });
              if (extra.has_wifi) amenities.push({ icon: "wifi", label: "WiFi" });
              if (extra.has_dump_point || hasDumpAttrs) amenities.push({ icon: "delete", label: "Dump Point" });
              if (capacityStr) amenities.push({ icon: "camping", label: `${capacityStr} Sites` });
              return amenities.length > 0 ? (
                <div>
                  <SectionHeader title="Amenities" />
                  <AmenityGrid items={amenities} maxItems={6} />
                </div>
              ) : null;
            })()}

            {/* ── CAMPING ATTRIBUTES ──────────────────────── */}
            {hasCampAttrs && (
              <div>
                <SectionHeader title="Facilities" />
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                  {isFree && <FacilityChip label="Free" active />}
                  {hasPowered && <FacilityChip label="Powered sites" active />}
                  {hasWater && <FacilityChip label="Water" active />}
                  {hasToilets && <FacilityChip label="Toilets" active />}
                  {capacityStr && (
                    <span style={{
                      padding: "5px 10px",
                      borderRadius: "var(--r-pill)",
                      fontSize: "var(--font-xs)",
                      fontWeight: 700,
                      background: "var(--roam-surface-hover)",
                      color: "var(--roam-text-muted)",
                      border: "1px solid var(--roam-border)",
                    }}>
                      {capacityStr} sites
                    </span>
                  )}
                </div>
              </div>
            )}

            {/* ── DUMP POINT ──────────────────────────────── */}
            {hasDumpAttrs && (
              <div>
                <SectionHeader title="Dump Point" />
                <div style={{ borderRadius: "var(--r-card)", background: "var(--roam-surface-hover)", overflow: "hidden", padding: "0 14px" }}>
                  {dumpType && <AttrRow Icon={Trash2} label="Type" value={dumpType.replace(/_/g, " ")} />}
                  {dumpAccess && <AttrRow Icon={Flag} label="Access" value={dumpAccess.replace(/_/g, " ")} />}
                  {dumpFee && <AttrRow Icon={Banknote} label="Fee" value={dumpFee} />}
                  {hasRinse && <BoolRow Icon={Droplets} label="Rinse water" value />}
                  {hasPotableAtDump && <BoolRow Icon={Droplets} label="Potable water" value />}
                </div>
              </div>
            )}

            {/* ── WATER POINT ─────────────────────────────── */}
            {hasWaterAttrs && (
              <div>
                <SectionHeader title="Water" />
                <div style={{ borderRadius: "var(--r-card)", background: "var(--roam-surface-hover)", overflow: "hidden", padding: "0 14px" }}>
                  {waterType && <AttrRow Icon={Droplets} label="Water Type" value={waterType.replace(/_/g, " ")} accent="var(--brand-sky)" />}
                  {waterFlow && <AttrRow Icon={Droplets} label="Flow" value={waterFlow.replace(/_/g, " ")} />}
                  {waterTreated != null && <BoolRow Icon={CheckCircle2} label="Treated" value={waterTreated} />}
                  {waterAlways != null && <BoolRow Icon={Clock} label="Always available" value={waterAlways} />}
                </div>
              </div>
            )}

            {/* ── TOILET ──────────────────────────────────── */}
            {hasToiletAttrs && (
              <div>
                <SectionHeader title="Toilets" />
                <div style={{ borderRadius: "var(--r-card)", background: "var(--roam-surface-hover)", overflow: "hidden", padding: "0 14px" }}>
                  {toiletType && <AttrRow Icon={Bath} label="Type" value={toiletType.replace(/_/g, " ")} />}
                  {toiletCount != null && <AttrRow Icon={Bath} label="Count" value={`${toiletCount} cubicles`} />}
                  {hasBabyChange && <BoolRow Icon={Baby} label="Baby change" value />}
                  {hasDisabled && <BoolRow Icon={CheckCircle2} label="Accessible" value />}
                  {hasHandWash && <BoolRow Icon={Droplets} label="Hand wash" value />}
                  {toiletMaintained != null && <BoolRow Icon={CheckCircle2} label="Maintained" value={toiletMaintained} />}
                </div>
              </div>
            )}

            {/* ── SHOWER ──────────────────────────────────── */}
            {hasShowerAttrs && (
              <div>
                <SectionHeader title="Showers" />
                <div style={{ borderRadius: "var(--r-card)", background: "var(--roam-surface-hover)", overflow: "hidden", padding: "0 14px" }}>
                  {showerType && <AttrRow Icon={Thermometer} label="Type" value={`${showerType} shower`} />}
                  {showerCount != null && <AttrRow Icon={Bath} label="Count" value={`${showerCount} showers`} />}
                  {showerFee && <AttrRow Icon={Banknote} label="Fee" value={showerFee} />}
                  {showerToken && <BoolRow Icon={Banknote} label="Token required" value />}
                </div>
              </div>
            )}

            {/* ── ACCESS & COST ────────────────────────────── */}
            {hasAccessCost && (
              <div>
                <SectionHeader title="Access & Cost" />
                <div style={{ borderRadius: "var(--r-card)", background: "var(--roam-surface-hover)", overflow: "hidden", padding: "0 14px" }}>
                  {isFree && <BoolRow Icon={CheckCircle2} label="Free" value />}
                  {feeStr && <AttrRow Icon={Banknote} label="Fee" value={feeStr} accent="var(--brand-amber)" />}
                  {accessStr && <AttrRow Icon={Flag} label="Access" value={accessStr} />}
                  {wheelchair === "yes" && <BoolRow Icon={CheckCircle2} label="Wheelchair accessible" value />}
                  {wheelchair === "limited" && (
                    <AttrRow Icon={CheckCircle2} label="Wheelchair" value="Limited access" />
                  )}
                </div>
              </div>
            )}

            {/* ── LOCATION ────────────────────────────────── */}
            <div>
              <SectionHeader title="Location" />
              <div style={{ borderRadius: "var(--r-card)", background: "var(--roam-surface-hover)", overflow: "hidden", padding: "0 14px" }}>
                {address && (
                  <AttrRow Icon={MapPin} label="Address" value={address} accent="var(--roam-accent)" />
                )}
                <AttrRow
                  Icon={Compass}
                  label="Coordinates"
                  value={
                    <button
                      type="button"
                      onClick={() => {
                        haptic.light();
                        navigator.clipboard?.writeText(`${place.lat}, ${place.lng}`).catch(() => {});
                      }}
                      style={{
                        background: "none", border: "none", padding: 0,
                        color: "var(--brand-sky)", fontWeight: 700,
                        fontSize: "var(--font-sm)", cursor: "pointer",
                        display: "flex", alignItems: "center", gap: 6,
                        WebkitTapHighlightColor: "transparent",
                        fontFamily: "var(--ff-mono)",
                      }}
                    >
                      {fmtCoord(place.lat, true)}, {fmtCoord(place.lng, false)}
                    </button>
                  }
                />
                {kmFromStart != null && (
                  <AttrRow
                    Icon={Navigation}
                    label="Along route"
                    value={`${kmFromStart.toFixed(0)} km from trip start`}
                  />
                )}
              </div>
            </div>

            {/* ── WIKIPEDIA EXCERPT ────────────────────────── */}
            {extra.wikipedia && (
              <div>
                <SectionHeader title="More Information" />
                <div style={{
                  borderRadius: "var(--r-card)",
                  background: "var(--roam-surface-hover)",
                  padding: 14,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 12,
                }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: "var(--font-sm)", fontWeight: 700, color: "var(--roam-text)", marginBottom: 2 }}>
                      Wikipedia article
                    </div>
                    <div style={{ fontSize: "var(--font-xs)", color: "var(--roam-text-muted)", fontWeight: 500 }}>
                      {isOnline ? "Tap to read more on Wikipedia" : "Available when online"}
                    </div>
                  </div>
                  {isOnline
                    ? (
                      <button
                        type="button"
                        onClick={() => {
                          haptic.light();
                          const ref = String(extra.wikipedia);
                          const [lang, ...titleParts] = ref.split(":");
                          const title = titleParts.join(":").replace(/ /g, "_");
                          if (title) safeOpen(`https://${lang ?? "en"}.wikipedia.org/wiki/${title}`);
                        }}
                        style={{
                          display: "flex", alignItems: "center", gap: 4,
                          padding: "8px 12px", borderRadius: "var(--r-card)",
                          background: "var(--info-tint)",
                          color: "var(--brand-sky)",
                          border: "none", fontWeight: 700,
                          fontSize: "var(--font-sm)", cursor: "pointer",
                          WebkitTapHighlightColor: "transparent",
                          flexShrink: 0,
                        }}
                      >
                        Read <ChevronRight size={14} />
                      </button>
                    )
                    : (
                      <WifiOff size={18} style={{ color: "var(--roam-text-muted)", flexShrink: 0 }} />
                    )}
                </div>
              </div>
            )}

            {/* ── OSM attribution ─────────────────────────── */}
            <div style={{
              textAlign: "center",
              fontSize: "var(--font-xxs)",
              color: "var(--roam-text-muted)",
              opacity: 0.5,
              paddingTop: 4,
            }}>
              Data from OpenStreetMap
              {extra.osm_id && <> · OSM {extra.osm_type ?? "node"}/{String(extra.osm_id)}</>}
            </div>

          </div>{/* /padding wrapper */}
        </div>{/* /scroll body */}
      </div>{/* /sheet */}
    </div>
  );
}
