// src/lib/utils/ids.ts
export function shortId(len = 10): string {
  // not crypto-strong; fine for UI keys/caches
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  let out = "";
  for (let i = 0; i < len; i++) out += chars[(Math.random() * chars.length) | 0];
  return out;
}
