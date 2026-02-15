// src/lib/native/keepAwake.ts
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { isNative } from "./platform";

/**
 * Keeps the screen awake during active navigation.
 *
 * Uses @capacitor-community/keep-awake on native,
 * and the Screen Wake Lock API on modern browsers.
 *
 * Usage:
 *   const { isAwake, enable, disable } = useKeepAwake();
 *   // or auto-enable:
 *   const { isAwake } = useKeepAwake({ auto: true });
 */
export function useKeepAwake(opts?: { auto?: boolean }) {
  const [isAwake, setIsAwake] = useState(false);
  const wakeLockRef = useRef<any>(null);

  const enable = useCallback(async () => {
    if (isAwake) return;

    try {
      if (isNative) {
        const { KeepAwake } = await import("@capacitor-community/keep-awake");
        await KeepAwake.keepAwake();
      } else if ("wakeLock" in navigator) {
        wakeLockRef.current = await (navigator as any).wakeLock.request("screen");
      }
      setIsAwake(true);
    } catch (e) {
      console.warn("[KeepAwake] failed to enable", e);
    }
  }, [isAwake]);

  const disable = useCallback(async () => {
    if (!isAwake) return;

    try {
      if (isNative) {
        const { KeepAwake } = await import("@capacitor-community/keep-awake");
        await KeepAwake.allowSleep();
      } else if (wakeLockRef.current) {
        await wakeLockRef.current.release();
        wakeLockRef.current = null;
      }
      setIsAwake(false);
    } catch (e) {
      console.warn("[KeepAwake] failed to disable", e);
    }
  }, [isAwake]);

  useEffect(() => {
    if (opts?.auto) enable();
    return () => {
      disable();
    };
  }, []);

  return { isAwake, enable, disable };
}
