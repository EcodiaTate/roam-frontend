// src/components/trip/EnrichmentBanner.tsx
"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2, CheckCircle2, WifiOff } from "lucide-react";
import type { EnrichProgress } from "@/lib/hooks/useEnrichment";

export function EnrichmentBanner({ progress }: { progress: EnrichProgress | null }) {
  const [dismissed, setDismissed] = useState(false);
  const isDone = progress?.phase === "done";
  const prevDoneRef = useRef(false);

  // Auto-dismiss 3s after transitioning to done
  useEffect(() => {
    if (!isDone) {
      prevDoneRef.current = false;
      return;
    }
    if (prevDoneRef.current) return;
    prevDoneRef.current = true;
    const t = setTimeout(() => setDismissed(true), 3000);
    return () => clearTimeout(t);
  }, [isDone]);

  if (dismissed || !progress) return null;
  if (progress.phase === "idle" || progress.phase === "cancelled") return null;

  const pct = progress.total > 0
    ? Math.round((progress.completed / progress.total) * 100)
    : 0;

  if (isDone) {
    return (
      <div className="pointer-events-auto absolute left-4 right-4 top-[env(safe-area-inset-top,0px)] z-50 mt-2">
        <div className="flex items-center gap-2 rounded-xl bg-emerald-600/90 px-4 py-2.5 text-sm font-medium text-white shadow-lg backdrop-blur-md">
          <CheckCircle2 className="h-4 w-4 flex-shrink-0" />
          <span>Trip fully loaded</span>
        </div>
      </div>
    );
  }

  return (
    <div className="pointer-events-auto absolute left-4 right-4 top-[env(safe-area-inset-top,0px)] z-50 mt-2">
      <div className="overflow-hidden rounded-xl bg-zinc-900/90 shadow-lg backdrop-blur-md">
        <div className="flex items-center gap-2.5 px-4 py-2.5">
          <Loader2 className="h-4 w-4 flex-shrink-0 animate-spin text-blue-400" />
          <span className="text-sm font-medium text-white">
            Setting up your trip&hellip;
          </span>
          <span className="ml-auto text-xs tabular-nums text-zinc-400">
            {progress.completed}/{progress.total}
          </span>
        </div>
        {/* Progress bar */}
        <div className="h-0.5 bg-zinc-800">
          <div
            className="h-full bg-blue-500 transition-all duration-300 ease-out"
            style={{ width: `${pct}%` }}
          />
        </div>
        {progress.corridorReady && (
          <div className="flex items-center gap-1.5 px-4 py-1.5 text-xs text-emerald-400">
            <WifiOff className="h-3 w-3" />
            Offline rerouting ready
          </div>
        )}
      </div>
    </div>
  );
}
