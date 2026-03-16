// src/lib/utils/errors.ts
//
// Utilities for extracting user-friendly messages from caught errors.

/**
 * Extract a string message from an unknown caught value.
 *
 * @example
 *   } catch (e) {
 *     setError(toErrorMessage(e, "Failed to save"));
 *   }
 */
export function toErrorMessage(err: unknown, fallback = "Something went wrong"): string {
  return err instanceof Error ? err.message : fallback;
}
