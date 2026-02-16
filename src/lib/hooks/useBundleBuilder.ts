// src/lib/hooks/useBundleBuilder.ts
//
// React hook wrapping buildPlanBundle with phase/error/progress state.
// Used by /new page and invite redemption flow.
//
"use client";

import { useCallback, useRef, useState } from "react";
import {
  buildPlanBundle,
  phaseLabel,
  type BuildPhase,
  type BuildPlanBundleArgs,
  type BuildPlanBundleResult,
} from "@/lib/offline/buildPlanBundle";
import { haptic } from "@/lib/native/haptics";

export function useBundleBuilder() {
  const [phase, setPhase] = useState<BuildPhase>("idle");
  const [error, setError] = useState<string | null>(null);
  const [building, setBuilding] = useState(false);
  const [result, setResult] = useState<BuildPlanBundleResult | null>(null);
  const abortRef = useRef(false);

  const statusText = phaseLabel(phase, error);
  const isReady = phase === "ready" && result !== null;

  /**
   * Reset all state back to idle.
   */
  const reset = useCallback(() => {
    setPhase("idle");
    setError(null);
    setBuilding(false);
    setResult(null);
    abortRef.current = false;
  }, []);

  /**
   * Run the full bundle build pipeline.
   * Returns the result on success, throws on failure.
   */
  const build = useCallback(
    async (args: Omit<BuildPlanBundleArgs, "onPhase">): Promise<BuildPlanBundleResult> => {
      abortRef.current = false;
      setError(null);
      setPhase("idle");
      setResult(null);
      setBuilding(true);

      try {
        const res = await buildPlanBundle({
          ...args,
          onPhase: (p) => {
            if (!abortRef.current) setPhase(p);
          },
        });

        if (abortRef.current) throw new Error("Build cancelled");

        setResult(res);
        setPhase("ready");
        haptic.success();
        return res;
      } catch (e: any) {
        const msg = e?.message ?? "Failed to build offline bundle";
        setError(msg);
        setPhase("error");
        haptic.error();
        throw e;
      } finally {
        setBuilding(false);
      }
    },
    [],
  );

  /**
   * Cancel a running build (best-effort — network requests in flight
   * will still complete, but state updates stop).
   */
  const cancel = useCallback(() => {
    abortRef.current = true;
    setBuilding(false);
    setPhase("idle");
    setError(null);
  }, []);

  return {
    /** Current build phase */
    phase,
    /** Human-readable status text */
    statusText,
    /** Error message if phase === "error" */
    error,
    /** True while pipeline is running */
    building,
    /** True when build completed successfully */
    isReady,
    /** Result from last successful build */
    result,
    /** Run the pipeline */
    build,
    /** Reset to idle */
    reset,
    /** Cancel a running build */
    cancel,
  };
}