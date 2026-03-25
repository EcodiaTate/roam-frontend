// src/components/basemap/BasemapDownloadCard.tsx

import { useCallback, useEffect, useRef } from "react";
import { useBasemapPack } from "@/lib/hooks/useBasemapPack";
import { haptic } from "@/lib/native/haptics";
import { Loader2, AlertTriangle } from "lucide-react";

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

  // Auto-download: kick off download as soon as we detect "not_installed" on native
  const autoTriggered = useRef(false);
  useEffect(() => {
    if (isNative && status.state === "not_installed" && !autoTriggered.current) {
      autoTriggered.current = true;
      handleDownload();
    }
  }, [isNative, status.state, handleDownload]);

  // 1. Web users: Map streams from cloud, no offline pack needed. Show nothing.
  if (!isNative) return null;

  // 2. Installed: It just works. Get out of the user's way.
  if (status.state === "installed") return null;

  return (
    <div className={className} style={styles.wrapper}>
      {/* 3. Downloading state */}
      {status.state === "downloading" && (
        <div style={styles.container}>
          <button onClick={() => { haptic.tap(); cancel(); }} style={styles.pill} title="Tap to cancel">
            <Loader2 size={16} className="roam-spin" style={{ opacity: 0.7 }} />
            <span>Saving offline map…</span>
          </button>
        </div>
      )}

      {/* 4. Error state */}
      {status.state === "error" && (
        <div style={styles.container}>
          <button onClick={() => { haptic.tap(); handleDownload(); }} style={{ ...styles.pill, color: "var(--roam-danger, #ef4444)" }}>
            <AlertTriangle size={16} />
            <span>Map download failed. Tap to retry.</span>
          </button>
        </div>
      )}

      {/* 5. Not installed - auto-download kicks in, show preparing state */}
      {(status.state === "not_installed" || !status.state) && (
        <div style={styles.container}>
          <div style={styles.pill}>
            <Loader2 size={16} className="roam-spin" style={{ opacity: 0.7 }} />
            <span>Preparing offline map…</span>
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Styles ────────────────────────────────────────────────────────── */

const styles: Record<string, React.CSSProperties> = {
  wrapper: {
    display: "flex",
    justifyContent: "center",
  },
  container: {
    position: "relative",
    display: "inline-flex",
    overflow: "hidden",
    borderRadius: 999,
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
    padding: "12px 16px",
    minHeight: 44,
    background: "transparent",
    border: "none",
    color: "#fff",
    fontSize: 13,
    fontWeight: 700,
    letterSpacing: "0.2px",
    cursor: "pointer",
    outline: "none",
    touchAction: "manipulation",
    WebkitTapHighlightColor: "transparent",
  },
};
