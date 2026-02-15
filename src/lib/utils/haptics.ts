// src/lib/utils/haptics.ts
// Compatibility shim — delegates to the native Capacitor haptics module.
// Existing code that imports { haptics } from "@/lib/utils/haptics" keeps working.

import { haptic } from "@/lib/native/haptics";

export const haptics = {
  light: haptic.tap,
  medium: haptic.medium,
  heavy: haptic.heavy,
  success: haptic.success,
  warning: haptic.warning,
  error: haptic.error,
  selection: haptic.selection,
};

export { haptic };