// src/components/basemap/BasemapDownloadCard.tsx
"use client";

import { useCallback, useMemo } from "react";
import { useBasemapPack } from "@/lib/hooks/useBasemapPack";
import { CloudDownload, Loader2, AlertTriangle } from "lucide-react";

type Props = {
  /** Region identifier (default "australia") */
  region?: string;
  /** Called when basemap becomes ready (server started) */
  onReady?: () => void;
  /** Custom className for the outer container */
  className?: string;
};

export function BasemapDownloadCard({ region = "australia", onReady, className }: Props) {
  const { status, isNative, download, cancel } = useBasemapPack(region);

  const handleDownload = useCallback(async () => {
    await download();
    onReady?.();
  }, [download, onReady]);

  const progressPct = useMemo(() => {
    if (status.downloadProgress <= 0) return 0;
    return Math.min(Math.round(status.downloadProgress * 100), 100);
  }, [status.downloadProgress]);

  // 1. Web users: Map streams from cloud, no offline pack needed. Show nothing.
  if (!isNative) return null;

  // 2. Installed: It just works. Get out of the user's way.
  if (status.state === "installed") return null;

  return (
    <div className={className} style={styles.wrapper}>
      <style>{`
        @keyframes roam-spin { 100% { transform: rotate(360deg); } }
        .roam-spin { animation: roam-spin 1s linear infinite; }
      `}</style>

      {/* 3. Downloading state */}
      {status.state === "downloading" && (
        <div style={styles.container}>
          <button onClick={cancel} style={styles.pill} title="Tap to cancel">
            <Loader2 size={16} className="roam-spin" style={{ opacity: 0.7 }} />
            <span>Saving offline map... {progressPct}%</span>
          </button>
          <div style={{ ...styles.progressBg, width: `${progressPct}%` }} />
        </div>
      )}

      {/* 4. Error state */}
      {status.state === "error" && (
        <div style={styles.container}>
          <button onClick={handleDownload} style={{ ...styles.pill, color: "var(--roam-danger, #ef4444)" }}>
            <AlertTriangle size={16} />
            <span>Map download failed. Tap to retry.</span>
          </button>
        </div>
      )}

      {/* 5. Not Installed state */}
      {(status.state === "none" || !status.state) && (
        <div style={styles.container}>
          <button onClick={handleDownload} style={styles.pill}>
            <CloudDownload size={16} style={{ opacity: 0.7 }} />
            <span>Download offline map</span>
          </button>
        </div>
      )}
    </div>
  );
}

/* ── Styles ────────────────────────────────────────────────────────── */

const styles: Record<string, React.CSSProperties> = {
  wrapper: {
    // Allows the pill to size itself to its content without stretching
    display: "flex",
    justifyContent: "center",
  },
  container: {
    position: "relative",
    display: "inline-flex",
    overflow: "hidden",
    borderRadius: 999, // Perfect pill shape
    background: "rgba(0, 0, 0, 0.65)",
    backdropFilter: "blur(12px)",
    WebkitBackdropFilter: "blur(12px)",
    boxShadow: "0 4px 16px rgba(0, 0, 0, 0.15)",
    border: "1px solid rgba(255, 255, 255, 0.1)",
  },
  pill: {
    position: "relative",
    zIndex: 2,
    display: "flex",
    alignItems: "center",
    gap: 8,
    padding: "8px 16px",
    background: "transparent",
    border: "none",
    color: "#fff",
    fontSize: 13,
    fontWeight: 700,
    letterSpacing: "0.2px",
    cursor: "pointer",
    outline: "none",
    WebkitTapHighlightColor: "transparent",
  },
  progressBg: {
    position: "absolute",
    top: 0,
    left: 0,
    bottom: 0,
    background: "rgba(255, 255, 255, 0.15)",
    zIndex: 1,
    transition: "width 0.3s ease-out",
  },
};
