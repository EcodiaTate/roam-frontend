// src/lib/utils/env.ts
export function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env var: ${name}`);
  return v;
}

export function optionalEnv(name: string, fallback = ""): string {
  return process.env[name] ?? fallback;
}
