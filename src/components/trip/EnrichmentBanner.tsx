// src/components/trip/EnrichmentBanner.tsx

import { useEffect, useRef, useState } from "react";
import { AlertTriangle, Loader2, CheckCircle2, WifiOff } from "lucide-react";
import type { EnrichProgress } from "@/lib/hooks/useEnrichment";

/* Real completed count, no creep. Previously this animated toward the
 * next integer over ~8s to look like progress was always moving - the
 * effect felt laggy on fast trips and never-quite-done on slow ones.
 * The progress-bar fill transition in CSS still smooths width jumps. */
function useSmoothedProgress(progress: EnrichProgress | null): number {
  if (!progress) return 0;
  if (progress.phase === "idle" || progress.phase === "cancelled") return 0;
  if (progress.phase === "done") return progress.total;
  return progress.completed;
}

export function EnrichmentBanner({ progress }: { progress: EnrichProgress | null }) {
  const [dismissed, setDismissed] = useState(false);
  const [exiting, setExiting] = useState(false);
  // Delay first render so fast enrichment runs finish before the banner
  // ever appears - avoids a 300ms flash of "Setting up your trip…".
  const [showReady, setShowReady] = useState(false);
  const isActive =
    progress !== null &&
    progress.phase !== "idle" &&
    progress.phase !== "cancelled" &&
    progress.phase !== "done";
  useEffect(() => {
    if (!isActive) { setShowReady(false); return; }
    const t = setTimeout(() => setShowReady(true), 3000);
    return () => clearTimeout(t);
  }, [isActive]);
  const isDone = progress?.phase === "done";
  const isError = progress?.phase === "error";
  const prevDoneRef = useRef(false);
  const smoothed = useSmoothedProgress(progress);

  // Auto-dismiss 3s after transitioning to done - triggers exit animation
  useEffect(() => {
    if (!isDone) {
      prevDoneRef.current = false;
      return;
    }
    if (prevDoneRef.current) return;
    prevDoneRef.current = true;
    const t = setTimeout(() => setExiting(true), 3000);
    return () => clearTimeout(t);
  }, [isDone]);

  if (dismissed || !progress) return null;
  if (progress.phase === "idle" || progress.phase === "cancelled") return null;
  // If a fast run finishes before the 3s reveal timer, skip the whole
  // banner - the user doesn't need a "done" chip for something they
  // never saw start. Errors still show (they demand attention).
  if (isDone && !showReady) return null;
  // Hide the in-progress state until the reveal timer fires.
  if (isActive && !showReady) return null;

  const total = progress.total;
  const displayInt = Math.floor(smoothed);
  const pct = total > 0 ? Math.min((smoothed / total) * 100, 100) : 0;

  const animClass = exiting ? "enrich-fade-out" : "enrich-fade-in";
  const handleAnimEnd = () => { if (exiting) setDismissed(true); };

  if (isDone) {
    return (
      <div className={`trip-enrichment-banner pointer-events-auto absolute left-4 top-[env(safe-area-inset-top,0px)] z-50 mt-2 ${animClass}`} onAnimationEnd={handleAnimEnd}>
        <div style={S.doneChip}>
          <CheckCircle2 style={{ width: 16, height: 16, flexShrink: 0 }} />
          <span>Trip fully loaded</span>
        </div>
        <style>{KEYFRAMES}</style>
      </div>
    );
  }

  if (isError) {
    return (
      <div className={`trip-enrichment-banner pointer-events-auto absolute left-4 top-[env(safe-area-inset-top,0px)] z-50 mt-2 ${animClass}`}>
        <div style={S.chipOuter}>
          <div style={S.chipInner}>
            <AlertTriangle style={{ width: 16, height: 16, flexShrink: 0, color: "var(--roam-warn)" }} />
            <span style={S.chipLabel}>
              Trip setup incomplete
            </span>
            <span style={S.chipCounter}>
              {progress.completed}/{total}
            </span>
          </div>
          <div style={S.barTrack}>
            <div
              style={{ ...S.barFillWarn, width: `${Math.round((progress.completed / total) * 100)}%` }}
            />
          </div>
        </div>
        <style>{KEYFRAMES}</style>
      </div>
    );
  }

  return (
    <div className={`trip-enrichment-banner pointer-events-auto absolute left-4 top-[env(safe-area-inset-top,0px)] z-50 mt-2 ${animClass}`}>
      <div style={S.chipOuter}>
        <div style={S.chipInner}>
          <Loader2 className="enrich-spin" style={{ width: 16, height: 16, flexShrink: 0, color: "var(--roam-info)" }} />
          <span style={S.chipLabel}>
            Setting up your trip&hellip;
          </span>
          <span style={S.chipCounter}>
            {displayInt}/{total}
          </span>
        </div>
        {/* Progress bar - smooth continuous animation */}
        <div style={S.barTrack}>
          <div
            style={{
              ...S.barFillInfo,
              width: `${pct}%`,
              transition: "width 400ms cubic-bezier(0.4, 0, 0.2, 1)",
            }}
          />
        </div>
        {progress.corridorReady && (
          <div style={S.corridorReady}>
            <WifiOff style={{ width: 12, height: 12 }} />
            Offline rerouting ready
          </div>
        )}
      </div>
      <style>{KEYFRAMES}</style>
    </div>
  );
}

const S: Record<string, React.CSSProperties> = {
  doneChip: {
    display: "flex",
    width: "fit-content",
    alignItems: "center",
    gap: 8,
    borderRadius: "var(--r-card)",
    background: "var(--roam-success)",
    padding: "10px 16px",
    fontSize: 14,
    fontWeight: 500,
    color: "var(--on-color)",
    boxShadow: "var(--shadow-medium)",
    backdropFilter: "blur(12px)",
    WebkitBackdropFilter: "blur(12px)",
  },
  chipOuter: {
    width: "fit-content",
    overflow: "hidden",
    borderRadius: "var(--r-card)",
    background: "var(--surface-raised)",
    boxShadow: "var(--shadow-medium)",
    backdropFilter: "blur(12px)",
    WebkitBackdropFilter: "blur(12px)",
  },
  chipInner: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "10px 16px",
  },
  chipLabel: {
    fontSize: 14,
    fontWeight: 500,
    color: "var(--roam-text)",
  },
  chipCounter: {
    marginLeft: 12,
    fontSize: 12,
    fontVariantNumeric: "tabular-nums",
    color: "var(--roam-text-muted)",
  },
  barTrack: {
    height: 2,
    background: "var(--roam-border-strong)",
  },
  barFillWarn: {
    height: "100%",
    background: "var(--roam-warn)",
    transition: "width 300ms ease-out",
  },
  barFillInfo: {
    height: "100%",
    background: "var(--roam-info)",
  },
  corridorReady: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    padding: "6px 16px",
    fontSize: 12,
    color: "var(--roam-success)",
  },
};

const KEYFRAMES = `
  .enrich-fade-in {
    animation: enrich-enter 350ms cubic-bezier(0.4, 0, 0.2, 1) both;
  }
  .enrich-fade-out {
    animation: enrich-exit 400ms cubic-bezier(0.4, 0, 0.2, 1) both;
  }
  @keyframes enrich-enter {
    from { opacity: 0; transform: translateY(-8px); }
    to   { opacity: 1; transform: translateY(0); }
  }
  @keyframes enrich-exit {
    from { opacity: 1; transform: translateY(0); }
    to   { opacity: 0; transform: translateY(-8px); }
  }
  .enrich-spin {
    animation: enrich-rotate 2.4s linear infinite;
  }
  @keyframes enrich-rotate {
    from { transform: rotate(0deg); }
    to   { transform: rotate(360deg); }
  }
`;
