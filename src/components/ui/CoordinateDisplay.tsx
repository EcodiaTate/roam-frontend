// src/components/ui/CoordinateDisplay.tsx

import { memo, useState, useCallback, useRef, type CSSProperties } from "react";
import { haptic } from "@/lib/native/haptics";

type Props = {
  lat: number;
  lng: number;
  /** Label text - defaults to "CURRENT COORDS" */
  label?: string;
  /** compact = single line inline, expanded = stacked with label */
  variant?: "compact" | "expanded";
  /** Use on dark backgrounds (e.g. inside WatermarkCard) */
  dark?: boolean;
  style?: CSSProperties;
};

/** Format a coordinate as degrees with hemisphere: "23.670° S" */
function fmtCoord(value: number, posLabel: string, negLabel: string): string {
  const abs = Math.abs(value);
  const deg = (Math.round(abs * 1000) / 1000).toFixed(3);
  return `${deg}° ${value >= 0 ? posLabel : negLabel}`;
}

export const CoordinateDisplay = memo(function CoordinateDisplay({
  lat,
  lng,
  label,
  variant = "expanded",
  dark = false,
  style,
}: Props) {
  const [copied, setCopied] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const coordText = `${fmtCoord(lat, "N", "S")}, ${fmtCoord(lng, "E", "W")}`;

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(coordText);
    } catch {
      // Fallback for older browsers / native webview
      const ta = document.createElement("textarea");
      ta.value = coordText;
      ta.style.position = "fixed";
      ta.style.left = "-9999px";
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
    }
    haptic.selection();
    setCopied(true);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setCopied(false), 1500);
  }, [coordText]);

  const isCompact = variant === "compact";

  return (
    <button
      type="button"
      onClick={handleCopy}
      aria-label="Copy coordinates to clipboard"
      style={{
        display: isCompact ? "inline-flex" : "flex",
        flexDirection: isCompact ? "row" : "column",
        alignItems: isCompact ? "center" : "flex-start",
        gap: isCompact ? 8 : 2,
        background: "var(--roam-surface, #fff)",
        borderRadius: "var(--r-card, 6px)",
        padding: isCompact ? "6px 10px" : "8px 12px",
        border: "none",
        cursor: "pointer",
        touchAction: "manipulation",
        WebkitTapHighlightColor: "transparent",
        transition: "transform 200ms var(--ease-out, cubic-bezier(0.25,0.46,0.45,0.94)), background 200ms",
        minHeight: 44,
        ...style,
      }}
      onPointerDown={(e) => { (e.currentTarget as HTMLElement).style.transform = "scale(0.97)"; }}
      onPointerUp={(e) => { (e.currentTarget as HTMLElement).style.transform = "scale(1)"; }}
      onPointerCancel={(e) => { (e.currentTarget as HTMLElement).style.transform = "scale(1)"; }}
    >
      {!isCompact && (
        <span
          style={{
            fontSize: 10,
            fontWeight: 800,
            textTransform: "uppercase",
            letterSpacing: "0.08em",
            color: dark ? "rgba(255, 255, 255, 0.5)" : "var(--roam-text-muted, #999)",
            lineHeight: 1,
          }}
        >
          {label ?? "CURRENT COORDS"}
        </span>
      )}
      <span
        style={{
          fontFamily: "var(--ff-mono, monospace)",
          fontSize: isCompact ? 13 : 15,
          fontWeight: 700,
          color: dark ? "rgba(255, 255, 255, 0.95)" : "var(--roam-accent, #B3541E)",
          lineHeight: 1.3,
          fontVariantNumeric: "tabular-nums",
          transition: "opacity 200ms",
          opacity: copied ? 0.5 : 1,
        }}
      >
        {copied ? "Copied" : coordText}
      </span>
    </button>
  );
});
