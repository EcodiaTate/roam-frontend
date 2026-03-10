// src/lib/utils/guards.ts
export function assertNever(x: never, msg = "Unexpected value"): never {
  throw new Error(`${msg}: ${String(x)}`);
}

export function isRecord(v: unknown): v is Record<string, any> {
  return !!v && typeof v === "object" && !Array.isArray(v);
}
