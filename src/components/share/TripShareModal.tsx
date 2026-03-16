// src/components/share/TripShareModal.tsx
"use client";

import { useCallback, useRef, useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { X, Download, Share2, Image as ImageIcon, Map as MapIcon, Loader2 } from "lucide-react";
import { TripShareCard, CARD_W, CARD_H, type ShareCardData } from "./TripShareCard";
import { haptic } from "@/lib/native/haptics";
import { isNative } from "@/lib/native/platform";

type Mode = "card" | "overlay";

type Props = {
  open: boolean;
  data: ShareCardData | null;
  onClose: () => void;
  /** JPEG data URL of the live MapLibre canvas snapshot */
  mapImageUrl?: string | null;
};

/* ── Helpers ─────────────────────────────────────────────────────── */

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((res, rej) => {
    const img = new window.Image();
    img.onload = () => res(img);
    img.onerror = rej;
    img.src = src;
  });
}

/** Draw an image into a canvas covering it (object-fit: cover). */
function drawCover(ctx: CanvasRenderingContext2D, img: HTMLImageElement, cw: number, ch: number) {
  const pr = img.width / img.height;
  const cr = cw / ch;
  let sx = 0, sy = 0, sw = img.width, sh = img.height;
  if (pr > cr) { sw = img.height * cr; sx = (img.width - sw) / 2; }
  else         { sh = img.width / cr;  sy = (img.height - sh) / 2; }
  ctx.drawImage(img, sx, sy, sw, sh, 0, 0, cw, ch);
}

/**
 * Composite: map JPEG → canvas, then SVG route layer on top.
 * The SVG contains no <image> elements so it serialises cleanly.
 */
// Cache fetched fonts as base64 so we only fetch once per session
let fontFaceCSS: string | null = null;
async function getFontFaceCSS(): Promise<string> {
  if (fontFaceCSS) return fontFaceCSS;
  try {
    const fontUrls = [
      // Plus Jakarta Sans 700
      "https://fonts.gstatic.com/s/plusjakartasans/v8/LDIbaomQNQcsA88c7O9yZ4KMCoOg4IA6-91aHEjcWuA_KU7NSg.woff2",
      // Plus Jakarta Sans 800
      "https://fonts.gstatic.com/s/plusjakartasans/v8/LDIbaomQNQcsA88c7O9yZ4KMCoOg4IA6-91aHEjcWuA_907NSg.woff2",
      // Syne 700
      "https://fonts.gstatic.com/s/syne/v22/8vIS7w4qzmVxsWxjBZRjr0FKM_04uQ.woff2",
    ];
    const [bold, extrabold, syne] = await Promise.all(
      fontUrls.map(async (url) => {
        const r = await fetch(url);
        const buf = await r.arrayBuffer();
        const b64 = btoa(String.fromCharCode(...new Uint8Array(buf)));
        return `data:font/woff2;base64,${b64}`;
      }),
    );
    fontFaceCSS = `
      @font-face { font-family: 'Plus Jakarta Sans'; font-weight: 700; src: url('${bold}') format('woff2'); }
      @font-face { font-family: 'Plus Jakarta Sans'; font-weight: 800; src: url('${extrabold}') format('woff2'); }
      @font-face { font-family: 'Plus Jakarta Sans'; font-weight: 500; src: url('${bold}') format('woff2'); }
      @font-face { font-family: 'Syne'; font-weight: 700; src: url('${syne}') format('woff2'); }
    `;
  } catch {
    fontFaceCSS = ""; // fall back silently
  }
  return fontFaceCSS;
}

async function buildCardBlob(
  svgEl: SVGSVGElement,
  mapDataUrl: string | null | undefined,
  scale = 3,
): Promise<Blob> {
  const cw = CARD_W * scale;
  const ch = CARD_H * scale;
  const canvas = document.createElement("canvas");
  canvas.width = cw;
  canvas.height = ch;
  const ctx = canvas.getContext("2d")!;

  // 1. Map layer
  if (mapDataUrl) {
    const mapImg = await loadImage(mapDataUrl);
    drawCover(ctx, mapImg, cw, ch);
  }

  // 2. SVG overlay — inject embedded font so it renders in the blob URL context
  const embeddedFont = await getFontFaceCSS();
  const svgClone = svgEl.cloneNode(true) as SVGSVGElement;
  const styleEl = svgClone.querySelector("style");
  if (styleEl && embeddedFont) {
    styleEl.textContent = embeddedFont;
  }

  const svgData = new XMLSerializer().serializeToString(svgClone);
  const svgBlob = new Blob([svgData], { type: "image/svg+xml;charset=utf-8" });
  const svgUrl  = URL.createObjectURL(svgBlob);
  try {
    const svgImg = await loadImage(svgUrl);
    ctx.drawImage(svgImg, 0, 0, cw, ch);
  } finally {
    URL.revokeObjectURL(svgUrl);
  }

  return new Promise<Blob>((res, rej) =>
    canvas.toBlob((b) => (b ? res(b) : rej(new Error("toBlob null"))), "image/png", 1),
  );
}

async function shareBlob(blob: Blob, label: string, mode: "share" | "save") {
  if (mode === "share") {
    if (isNative) {
      const { Filesystem, Directory } = await import("@capacitor/filesystem");
      const { Share } = await import("@capacitor/share");
      const reader = new FileReader();
      const du: string = await new Promise((res, rej) => {
        reader.onload = () => res(reader.result as string);
        reader.onerror = rej;
        reader.readAsDataURL(blob);
      });
      const fname = `roam-trip-${Date.now()}.png`;
      await Filesystem.writeFile({ path: fname, data: du.split(",")[1], directory: Directory.Cache });
      const { uri } = await Filesystem.getUri({ path: fname, directory: Directory.Cache });
      await Share.share({ title: label, url: uri, dialogTitle: "Share your trip" });
      return;
    }
    const file = new File([blob], "roam-trip.png", { type: "image/png" });
    if (navigator.canShare?.({ files: [file] })) {
      await navigator.share({ files: [file], title: label });
      return;
    }
  }
  // Fallback: download
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = `roam-trip-${Date.now()}.png`; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

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

// Fetch app icon once and cache as data URL (small resized version)
let cachedIconUrl: string | null = null;
async function loadIconDataUrl(): Promise<string | null> {
  if (cachedIconUrl) return cachedIconUrl;
  try {
    const res = await fetch("/img/roam-app-icon.png");
    const blob = await res.blob();
    // Resize to 64x64 via canvas to keep SVG lean
    const img = await loadImage(URL.createObjectURL(blob));
    const c = document.createElement("canvas"); c.width = 64; c.height = 64;
    const ctx = c.getContext("2d")!;
    ctx.drawImage(img, 0, 0, 64, 64);
    cachedIconUrl = c.toDataURL("image/png");
    return cachedIconUrl;
  } catch { return null; }
}

export function TripShareModal({ open, data, onClose, mapImageUrl }: Props) {
  const [mode, setMode] = useState<Mode>("card");
  const [photo, setPhoto] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [iconDataUrl, setIconDataUrl] = useState<string | null>(cachedIconUrl);

  const cardSvgRef    = useRef<SVGSVGElement | null>(null);
  const overlaySvgRef = useRef<SVGSVGElement | null>(null);

  useEffect(() => {
    if (open) {
      setMode("card"); setPhoto(null); setErr(null);
      if (!iconDataUrl) loadIconDataUrl().then(setIconDataUrl);
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
      setErr(e instanceof Error ? e.message : "Export failed");
      haptic.error();
    } finally {
      setExporting(false);
    }
  }, [data, mode, photo, mapImageUrl, tripLabel]);

  if (!open || !data) return null;

  const canExport = mode === "card" || !!photo;

  const content = (
    <div
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      style={{
        position: "fixed", inset: 0, zIndex: 60,
        display: "flex", flexDirection: "column", alignItems: "center",
        background: "rgba(6,8,7,0.96)",
        overflowY: "auto", WebkitOverflowScrolling: "touch",
        paddingTop: "max(20px, env(safe-area-inset-top, 0px) + 12px)",
        paddingBottom: "max(28px, env(safe-area-inset-bottom, 0px) + 20px)",
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
              <TripShareCard data={data} mode="card" svgRef={cardSvgRef} hasMap={!!mapImageUrl} iconDataUrl={iconDataUrl} />
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
                  <TripShareCard data={data} mode="overlay" svgRef={overlaySvgRef} iconDataUrl={iconDataUrl} />
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
    </div>
  );

  if (typeof document === "undefined") return null;
  return createPortal(content, document.body);
}
