// src/lib/utils/cx.ts
//
// Minimal className joiner - filters falsy values and joins with a space.
// Intentionally tiny; use clsx/classnames if conditional object syntax is needed.

export function cx(...names: (string | false | null | undefined)[]): string {
  return names.filter(Boolean).join(" ");
}
