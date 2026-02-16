// src/components/basemap/BasemapDownloadCard.tsx
//
// Compact card/banner for basemap download status.
// Shows: not installed → downloading (progress) → installed → error
// Designed for the /trip or /new page, above or below the map.

"use client";

import { useCallback, useMemo } from "react";
import { useBasemapPack } from "@/lib/hooks/useBasemapPack";

function formatBytes(bytes: number): string {
  if (bytes <= 0) return "0 B";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

type Props = {
  /** Region identifier (default "australia") */
  region?: string;
  /** Compact mode — single line banner */
  compact?: boolean;
  /** Called when basemap becomes ready (server started) */
  onReady?: () => void;
  /** Custom className for the outer container */
  className?: string;
};

export function BasemapDownloadCard({ region = "australia", compact = false, onReady, className }: Props) {
  const { status, isNative, isOfflineReady, download, cancel, remove } = useBasemapPack(region);

  const handleDownload = useCallback(async () => {
    await download();
    onReady?.();
  }, [download, onReady]);

  // Don't render on web (dev mode) — basemap is loaded from Supabase
  if (!isNative) return null;

  const progressPct = useMemo(() => {
    if (status.downloadProgress <= 0) return 0;
    return Math.min(Math.round(status.downloadProgress * 100), 100);
  }, [status.downloadProgress]);

  const progressText = useMemo(() => {
    if (status.totalBytes <= 0) return "Preparing…";
    return `${formatBytes(status.downloadedBytes)} / ${formatBytes(status.totalBytes)}`;
  }, [status.downloadedBytes, status.totalBytes]);

  /* ── Installed ────────────────────────────────────────────────────── */

  if (status.state === "installed") {
    if (compact) {
      return (
        <div className={className} style={styles.compactBar}>
          <div style={styles.compactInner}>
            <span style={styles.compactIcon}>✓</span>
            <span style={styles.compactText}>
              Offline map ready ({formatBytes(status.sizeBytes)})
            </span>
            <button onClick={remove} style={styles.compactAction}>
              Remove
            </button>
          </div>
        </div>
      );
    }

    return (
      <div className={className} style={styles.card}>
        <div style={styles.row}>
          <div style={styles.iconCircleGreen}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M20 6 9 17l-5-5" />
            </svg>
          </div>
          <div style={{ flex: 1 }}>
            <div style={styles.title}>Offline map installed</div>
            <div style={styles.subtitle}>
              {formatBytes(status.sizeBytes)} · {region.charAt(0).toUpperCase() + region.slice(1)}
            </div>
          </div>
          <button onClick={remove} style={styles.removeBtn}>Remove</button>
        </div>
      </div>
    );
  }

  /* ── Downloading ──────────────────────────────────────────────────── */

  if (status.state === "downloading") {
    return (
      <div className={className} style={styles.card}>
        <div style={styles.row}>
          <div style={styles.iconCircleAmber}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 5v14M19 12l-7 7-7-7" />
            </svg>
          </div>
          <div style={{ flex: 1 }}>
            <div style={styles.title}>Downloading offline map…</div>
            <div style={styles.subtitle}>{progressText}</div>
          </div>
          <button onClick={cancel} style={styles.cancelBtn}>Cancel</button>
        </div>
        {/* Progress bar */}
        <div style={styles.progressTrack}>
          <div
            style={{
              ...styles.progressFill,
              width: `${progressPct}%`,
              transition: "width 0.3s ease-out",
            }}
          />
        </div>
        {progressPct > 0 && (
          <div style={styles.pctText}>{progressPct}%</div>
        )}
      </div>
    );
  }

  /* ── Error ────────────────────────────────────────────────────────── */

  if (status.state === "error") {
    return (
      <div className={className} style={styles.card}>
        <div style={styles.row}>
          <div style={styles.iconCircleRed}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </div>
          <div style={{ flex: 1 }}>
            <div style={styles.title}>Download failed</div>
            <div style={{ ...styles.subtitle, color: "rgba(239,68,68,0.9)" }}>
              {status.error ?? "Unknown error"}
            </div>
          </div>
          <button onClick={handleDownload} style={styles.retryBtn}>Retry</button>
        </div>
      </div>
    );
  }

  /* ── Not installed (prompt to download) ──────────────────────────── */

  if (compact) {
    return (
      <div className={className} style={styles.compactBar}>
        <div style={styles.compactInner}>
          <span style={styles.compactIcon}>↓</span>
          <span style={styles.compactText}>
            Offline map not installed
          </span>
          <button onClick={handleDownload} style={styles.compactDownloadBtn}>
            Download
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={className} style={styles.card}>
      <div style={styles.row}>
        <div style={styles.iconCircleBlue}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <path d="M7 10l5 5 5-5" />
            <path d="M12 15V3" />
          </svg>
        </div>
        <div style={{ flex: 1 }}>
          <div style={styles.title}>Download offline map</div>
          <div style={styles.subtitle}>
            Required for navigation without reception.
            <br />
            Approx. 1 GB · Wi-Fi recommended
          </div>
        </div>
      </div>
      <button onClick={handleDownload} style={styles.downloadBtn}>
        Download Australia Map
      </button>
    </div>
  );
}

/* ── Styles ────────────────────────────────────────────────────────── */

const styles: Record<string, React.CSSProperties> = {
  card: {
    borderRadius: 16,
    padding: "14px 16px",
    background: "rgba(0,0,0,0.55)",
    backdropFilter: "blur(12px)",
    WebkitBackdropFilter: "blur(12px)",
    color: "#fff",
    boxShadow: "0 4px 24px rgba(0,0,0,0.25)",
  },
  row: {
    display: "flex",
    alignItems: "center",
    gap: 12,
  },
  iconCircleGreen: {
    width: 36, height: 36, borderRadius: 10,
    background: "#16a34a",
    display: "grid", placeItems: "center", flexShrink: 0,
  },
  iconCircleAmber: {
    width: 36, height: 36, borderRadius: 10,
    background: "#d97706",
    display: "grid", placeItems: "center", flexShrink: 0,
  },
  iconCircleRed: {
    width: 36, height: 36, borderRadius: 10,
    background: "#dc2626",
    display: "grid", placeItems: "center", flexShrink: 0,
  },
  iconCircleBlue: {
    width: 36, height: 36, borderRadius: 10,
    background: "#2563eb",
    display: "grid", placeItems: "center", flexShrink: 0,
  },
  title: {
    fontSize: 14, fontWeight: 900, letterSpacing: "-0.2px",
  },
  subtitle: {
    fontSize: 12, fontWeight: 600, opacity: 0.7, lineHeight: 1.4, marginTop: 2,
  },
  downloadBtn: {
    display: "block",
    width: "100%",
    marginTop: 12,
    padding: "12px 0",
    border: "none",
    borderRadius: 12,
    cursor: "pointer",
    fontSize: 14,
    fontWeight: 950,
    letterSpacing: "0.2px",
    background: "var(--roam-accent, #4a6c53)",
    color: "#fff",
    boxShadow: "0 2px 12px rgba(74,108,83,0.4)",
  },
  cancelBtn: {
    background: "rgba(255,255,255,0.12)",
    border: "none",
    borderRadius: 8,
    padding: "6px 14px",
    color: "#fff",
    fontSize: 12,
    fontWeight: 800,
    cursor: "pointer",
    flexShrink: 0,
  },
  removeBtn: {
    background: "rgba(255,255,255,0.08)",
    border: "none",
    borderRadius: 8,
    padding: "6px 14px",
    color: "rgba(255,255,255,0.6)",
    fontSize: 12,
    fontWeight: 700,
    cursor: "pointer",
    flexShrink: 0,
  },
  retryBtn: {
    background: "rgba(239,68,68,0.2)",
    border: "none",
    borderRadius: 8,
    padding: "6px 14px",
    color: "#fca5a5",
    fontSize: 12,
    fontWeight: 800,
    cursor: "pointer",
    flexShrink: 0,
  },
  progressTrack: {
    marginTop: 10,
    height: 4,
    borderRadius: 2,
    background: "rgba(255,255,255,0.12)",
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    borderRadius: 2,
    background: "linear-gradient(90deg, #d97706, #f59e0b)",
  },
  pctText: {
    marginTop: 4,
    fontSize: 11,
    fontWeight: 800,
    opacity: 0.6,
    textAlign: "right" as const,
  },
  compactBar: {
    borderRadius: 10,
    padding: "8px 12px",
    background: "rgba(0,0,0,0.45)",
    backdropFilter: "blur(8px)",
    WebkitBackdropFilter: "blur(8px)",
    color: "#fff",
  },
  compactInner: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    fontSize: 12,
    fontWeight: 700,
  },
  compactIcon: {
    fontSize: 14,
    fontWeight: 900,
  },
  compactText: {
    flex: 1,
    opacity: 0.85,
  },
  compactAction: {
    background: "none",
    border: "none",
    color: "rgba(255,255,255,0.5)",
    fontSize: 11,
    fontWeight: 700,
    cursor: "pointer",
    padding: "2px 6px",
    flexShrink: 0,
  },
  compactDownloadBtn: {
    background: "var(--roam-accent, #4a6c53)",
    border: "none",
    borderRadius: 6,
    color: "#fff",
    fontSize: 11,
    fontWeight: 900,
    cursor: "pointer",
    padding: "4px 10px",
    flexShrink: 0,
  },
};