// src/lib/hooks/useEnrichment.ts

import { useCallback, useEffect, useRef, useState } from "react";
import type { NavPack } from "@/lib/types/navigation";
import type { TripPreferences } from "@/lib/types/trip";
import type { PackKind } from "@/lib/offline/packsStore";
import {
  startEnrichment,
  type EnrichProgress,
  type EnrichCallbacks,
} from "@/lib/offline/backgroundEnrich";

export type { EnrichProgress };

export function useEnrichment(onPack: (kind: PackKind, data: unknown) => void) {
  const [progress, setProgress] = useState<EnrichProgress | null>(null);
  const cancelRef = useRef<(() => void) | null>(null);
  const onPackRef = useRef(onPack);
  useEffect(() => { onPackRef.current = onPack; });

  const isEnriching = progress !== null && progress.phase !== "done" && progress.phase !== "error" && progress.phase !== "cancelled";
  const isDone = progress?.phase === "done";
  const isError = progress?.phase === "error";

  const start = useCallback(
    (args: { planId: string; navPack: NavPack; departAt?: string | null; tripPrefs?: TripPreferences | null }) => {
      // Cancel any running enrichment
      cancelRef.current?.();

      const callbacks: EnrichCallbacks = {
        onPack: (kind, data) => onPackRef.current(kind, data),
        onProgress: setProgress,
        onDone: () => {},
      };

      const { cancel } = startEnrichment({
        planId: args.planId,
        navPack: args.navPack,
        departAt: args.departAt,
        tripPrefs: args.tripPrefs,
        callbacks,
      });

      cancelRef.current = cancel;
    },
    [],
  );

  const cancel = useCallback(() => {
    cancelRef.current?.();
    cancelRef.current = null;
    setProgress((prev) =>
      prev ? { ...prev, phase: "cancelled" } : null,
    );
  }, []);

  return { progress, start, cancel, isEnriching, isDone, isError };
}
