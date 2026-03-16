// src/lib/hooks/useToggle.ts
// Shared boolean toggle hook with optional haptic feedback.
// Replaces the repeated useState(false) + useCallback + haptic.selection() pattern
// found across 9+ components.
import { useState, useCallback } from "react";
import { haptic } from "@/lib/native/haptics";

/**
 * @param initial  Starting value (default false)
 * @param withHaptic  Fire haptic.selection() on every toggle (default true)
 */
export function useToggle(
  initial = false,
  withHaptic = true,
): [boolean, () => void, (v: boolean) => void] {
  const [value, setValue] = useState(initial);

  const toggle = useCallback(() => {
    if (withHaptic) haptic.selection();
    setValue((v) => !v);
  }, [withHaptic]);

  return [value, toggle, setValue];
}
