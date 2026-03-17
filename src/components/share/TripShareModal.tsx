// src/components/share/TripShareModal.tsx
"use client";

import { useCallback, useRef, useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { X, Download, Share2, Image as ImageIcon, Map as MapIcon, Loader2 } from "lucide-react";
import { TripShareCard, CARD_W, CARD_H, type ShareCardData } from "./TripShareCard";
import { haptic } from "@/lib/native/haptics";
import { toErrorMessage } from "@/lib/utils/errors";
import { isNative } from "@/lib/native/platform";
import { buildCardBlob, shareBlob, loadIconDataUrl } from "@/lib/share/buildCardBlob";

type Mode = "card" | "overlay";

type Props = {
  open: boolean;
  data: ShareCardData | null;
  onClose: () => void;
  /** JPEG data URL of the live MapLibre canvas snapshot */
  mapImageUrl?: string | null;
};

/* ── Photo picker ────────────────────────────────────────────────── */

function PhotoPicker({ onPick }: { onPick: (url: string) => void }) {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center",
      justifyContent: "center", gap: 14, height: "100%", padding: 32, textAlign: "center" }}>
      <div style={{ width: 60, height: 60, borderRadius: 18,
        background: "rgba(255,255,255,0.05)", border: "1.5px dashed rgba(255,255,255,0.15)",
        display: "flex", alignItems: "center", justifyContent: "center", color: "rgba(255,255,255,0.4)" }}>
        <ImageIcon size={26} />
      </div>
      <p style={{ margin: 0, fontSize: 13, fontWeight: 500, color: "rgba(255,255,255,0.5)", lineHeight: 1.5 }}>
        Pick a photo — your route will be overlaid on top
      </p>
      <button type="button" onClick={() => ref.current?.click()}
        style={{ all: "unset", cursor: "pointer", padding: "11px 28px", borderRadius: 14,
          background: "#4ade80", color: "#0a1f0e", fontSize: 14, fontWeight: 700,
          WebkitTapHighlightColor: "transparent" }}>
        Choose Photo
      </button>
      <input ref={ref} type="file" accept="image/*" style={{ display: "none" }}
        onChange={(e) => {
          const f = e.target.files?.[0]; if (!f) return;
          const reader = new FileReader();
          reader.onload = (ev) => { if (typeof ev.target?.result === "string") onPick(ev.target.result as string); };
          reader.readAsDataURL(f);
        }} />
    </div>
  );
}

/* ── Modal ───────────────────────────────────────────────────────── */

export function TripShareModal({ open, data, onClose, mapImageUrl }: Props) {
  const [mode, setMode] = useState<Mode>("card");
  const [photo, setPhoto] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [iconDataUrl, setIconDataUrl] = useState<string | null>(null);
  const [visible, setVisible] = useState(false);
  const [mounted, setMounted] = useState(false);

  const cardSvgRef    = useRef<SVGSVGElement | null>(null);
  const overlaySvgRef = useRef<SVGSVGElement | null>(null);

  useEffect(() => {
    if (open) {
      setMode("card"); setPhoto(null); setErr(null);
      if (!iconDataUrl) loadIconDataUrl().then(setIconDataUrl);
      setMounted(true);
      // Two RAFs: first lets React flush the mount paint, second triggers the transition
      let raf2: number;
      const raf1 = requestAnimationFrame(() => {
        raf2 = requestAnimationFrame(() => setVisible(true));
      });
      return () => { cancelAnimationFrame(raf1); cancelAnimationFrame(raf2); };
    } else {
      // Trigger exit transition, then unmount after it completes
      setVisible(false);
      const t = setTimeout(() => setMounted(false), 350);
      return () => clearTimeout(t);
    }
  }, [open]);

  const tripLabel = data
    ? (data.label?.trim() || (() => {
        const s = data.stops.find((x) => x.type === "start");
        const e = data.stops.find((x) => x.type === "end");
        return `${s?.name || "Start"} → ${e?.name || "End"}`;
      })())
    : "My Roam";

  const handleExport = useCallback(async (shareMode: "share" | "save") => {
    if (!data) return;
    haptic.medium();
    setExporting(true);
    setErr(null);
    try {
      if (mode === "overlay" && photo) {
        const svg = overlaySvgRef.current;
        if (!svg) throw new Error("SVG not ready");
        const blob = await buildCardBlob(svg, photo);
        await shareBlob(blob, tripLabel, shareMode);
      } else {
        const svg = cardSvgRef.current;
        if (!svg) throw new Error("SVG not ready");
        const blob = await buildCardBlob(svg, mapImageUrl);
        await shareBlob(blob, tripLabel, shareMode);
      }
      haptic.success();
    } catch (e) {
      setErr(toErrorMessage(e, "Export failed"));
      haptic.error();
    } finally {
      setExporting(false);
    }
  }, [data, mode, photo, mapImageUrl, tripLabel]);

  // Keep last known data alive during the exit transition
  const dataRef = useRef(data);
  if (data) dataRef.current = data;
  const activeData = dataRef.current;

  if (!mounted || !activeData) return null;

  const canExport = mode === "card" || !!photo;

  const content = (
    <div
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      style={{
        position: "fixed", inset: 0, zIndex: 60,
        display: "flex", flexDirection: "column", alignItems: "center",
        overflowY: "auto", WebkitOverflowScrolling: "touch" as React.CSSProperties["WebkitOverflowScrolling"],
        paddingTop: "max(20px, env(safe-area-inset-top, 0px) + 12px)",
        paddingBottom: "max(28px, env(safe-area-inset-bottom, 0px) + 20px)",
        // Backdrop fade
        background: `rgba(6,8,7,${visible ? 0.96 : 0})`,
        transition: "background 0.22s ease",
      }}
    >
      {/* Content pop+fade wrapper */}
      <div
        style={{
          display: "flex", flexDirection: "column", alignItems: "center", width: "100%",
          opacity: visible ? 1 : 0,
          transform: visible ? "translateY(0) scale(1)" : "translateY(20px) scale(0.96)",
          transition: "opacity 0.3s cubic-bezier(0.34,1.56,0.64,1), transform 0.35s cubic-bezier(0.34,1.56,0.64,1)",
        }}
      >
      {/* ── Header ── */}
      <div style={{ width: "100%", maxWidth: 420, display: "flex",
        alignItems: "center", justifyContent: "space-between",
        padding: "0 20px 14px", flexShrink: 0 }}>
        <p style={{ margin: 0, fontSize: 13, fontWeight: 600,
          color: "rgba(255,255,255,0.5)", letterSpacing: "0.01em" }}>
          Share trip
        </p>
        <button type="button" onClick={onClose}
          style={{ all: "unset", cursor: "pointer", display: "flex",
            alignItems: "center", justifyContent: "center",
            width: 36, height: 36, borderRadius: 10,
            background: "rgba(255,255,255,0.07)", color: "rgba(255,255,255,0.6)",
            WebkitTapHighlightColor: "transparent" }}>
          <X size={17} />
        </button>
      </div>

      {/* ── Mode tabs ── */}
      <div style={{ display: "flex", gap: 6, padding: "0 20px 14px",
        width: "100%", maxWidth: 420, boxSizing: "border-box", flexShrink: 0 }}>
        {(["card", "overlay"] as Mode[]).map((m) => (
          <button key={m} type="button"
            onClick={() => { haptic.light(); setMode(m); }}
            style={{ all: "unset", cursor: "pointer", flex: 1,
              display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
              height: 38, borderRadius: 11,
              background: mode === m ? "#4ade80" : "rgba(255,255,255,0.06)",
              color: mode === m ? "#0a1f0e" : "rgba(255,255,255,0.5)",
              fontSize: 12, fontWeight: 700,
              transition: "background 0.15s, color 0.15s",
              WebkitTapHighlightColor: "transparent" }}>
            {m === "card" ? <MapIcon size={13} /> : <ImageIcon size={13} />}
            {m === "card" ? "Route Card" : "Photo Overlay"}
          </button>
        ))}
      </div>

      {/* ── Card preview ── */}
      <div style={{ width: "100%", maxWidth: 420, padding: "0 20px",
        boxSizing: "border-box", flexShrink: 0 }}>

        {mode === "card" ? (
          /* Card mode: map JPEG as CSS background, SVG route on top */
          <div style={{ borderRadius: 28, overflow: "hidden",
            boxShadow: "0 24px 64px rgba(0,0,0,0.7)",
            width: "100%", aspectRatio: `${CARD_W} / ${CARD_H}`,
            position: "relative",
            background: mapImageUrl
              ? `url("${mapImageUrl}") center/cover no-repeat`
              : "linear-gradient(160deg,#0e1f14 0%,#060d08 100%)" }}>
            {/* Loading shimmer while map snapshot is being generated */}
            {!mapImageUrl && (
              <div style={{ position: "absolute", inset: 0,
                display: "flex", alignItems: "center", justifyContent: "center" }}>
                <Loader2 size={20} style={{ color: "rgba(255,255,255,0.2)",
                  animation: "roam-spin 0.75s linear infinite" }} />
              </div>
            )}
            {/* SVG overlay (no <image> tag — route + stats + branding only) */}
            <div style={{ position: "absolute", inset: 0 }}>
              <TripShareCard data={activeData} mode="card" svgRef={cardSvgRef} hasMap={!!mapImageUrl} iconDataUrl={iconDataUrl} />
            </div>
          </div>
        ) : (
          /* Overlay mode: user photo + SVG route */
          <div style={{ borderRadius: 28, overflow: "hidden",
            boxShadow: "0 24px 64px rgba(0,0,0,0.7)",
            width: "100%", aspectRatio: `${CARD_W} / ${CARD_H}`,
            background: "#0a1a0e", position: "relative" }}>
            {photo ? (
              <>
                <img src={photo} alt="" style={{ position: "absolute", inset: 0,
                  width: "100%", height: "100%", objectFit: "cover" }} />
                <div style={{ position: "absolute", inset: 0 }}>
                  <TripShareCard data={activeData} mode="overlay" svgRef={overlaySvgRef} iconDataUrl={iconDataUrl} />
                </div>
                <button type="button" onClick={() => setPhoto(null)}
                  style={{ all: "unset", cursor: "pointer", position: "absolute",
                    bottom: 10, right: 10, display: "flex", alignItems: "center", gap: 4,
                    padding: "6px 12px", borderRadius: 9,
                    background: "rgba(0,0,0,0.6)", color: "#fff",
                    fontSize: 11, fontWeight: 600,
                    backdropFilter: "blur(8px)", WebkitTapHighlightColor: "transparent" }}>
                  <ImageIcon size={11} /> Change
                </button>
              </>
            ) : (
              <PhotoPicker onPick={setPhoto} />
            )}
          </div>
        )}
      </div>

      {/* ── Error ── */}
      {err && (
        <div style={{ marginTop: 10, padding: "9px 16px", borderRadius: 10,
          background: "rgba(251,146,60,0.15)", border: "1px solid rgba(251,146,60,0.3)",
          color: "#fb923c", fontSize: 12, fontWeight: 600,
          maxWidth: 380, textAlign: "center", flexShrink: 0 }}>
          {err}
        </div>
      )}

      {/* ── Actions ── */}
      <div style={{ display: "flex", gap: 9, padding: "16px 20px 0",
        width: "100%", maxWidth: 420, boxSizing: "border-box", flexShrink: 0 }}>
        <button type="button" disabled={exporting || !canExport}
          onClick={() => handleExport("save")}
          style={{ all: "unset", cursor: !canExport || exporting ? "default" : "pointer",
            flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
            height: 50, borderRadius: 15,
            background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.1)",
            color: !canExport || exporting ? "rgba(255,255,255,0.25)" : "rgba(255,255,255,0.75)",
            fontSize: 14, fontWeight: 600, WebkitTapHighlightColor: "transparent" }}>
          {exporting ? <Loader2 size={15} style={{ animation: "roam-spin 0.75s linear infinite" }} /> : <Download size={15} />}
          Save
        </button>
        <button type="button" disabled={exporting || !canExport}
          onClick={() => handleExport("share")}
          style={{ all: "unset", cursor: !canExport || exporting ? "default" : "pointer",
            flex: 2, display: "flex", alignItems: "center", justifyContent: "center", gap: 7,
            height: 50, borderRadius: 15,
            background: !canExport || exporting ? "rgba(74,222,128,0.25)" : "#4ade80",
            color: !canExport || exporting ? "rgba(10,31,14,0.4)" : "#0a1f0e",
            fontSize: 14, fontWeight: 700,
            boxShadow: canExport && !exporting ? "0 4px 20px rgba(74,222,128,0.3)" : "none",
            WebkitTapHighlightColor: "transparent" }}>
          {exporting ? <Loader2 size={15} style={{ animation: "roam-spin 0.75s linear infinite" }} /> : <Share2 size={15} />}
          {isNative ? "Share" : "Download PNG"}
        </button>
      </div>

      <p style={{ marginTop: 10, fontSize: 11, color: "rgba(255,255,255,0.25)",
        textAlign: "center", padding: "0 24px", lineHeight: 1.5, flexShrink: 0 }}>
        {mode === "card"
          ? (mapImageUrl ? "Exports at 3× — ready for Instagram Stories" : "Loading map…")
          : photo ? "Route overlaid on your photo" : "Pick a photo to overlay your route"}
      </p>
      </div>{/* /content pop wrapper */}
    </div>
  );

  if (typeof document === "undefined") return null;

  return createPortal(content, document.body);
}
