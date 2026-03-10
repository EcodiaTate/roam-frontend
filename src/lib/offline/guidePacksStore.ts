// src/lib/offline/guidePacksStore.ts
"use client";

import { idbDel, idbGet, idbGetAll, idbPut, idbStores } from "./idb";
import type { GuidePack } from "@/lib/types/guide";

export type StoredGuidePack = {
  k: string;
  plan_id: string | null;     // keep null for global sessions
  kind: "guide";
  saved_at: number;
  payload: GuidePack;
};

function makeKey(planId: string | null, guideKey: string) {
  return `${planId ?? "global"}:guide:${guideKey}`;
}

export async function putGuidePack(planId: string | null, guideKey: string, pack: GuidePack): Promise<void> {
  const row: StoredGuidePack = {
    k: makeKey(planId, guideKey),
    plan_id: planId ?? null,
    kind: "guide",
    saved_at: Date.now(),
    payload: pack,
  };
  await idbPut(idbStores.packs, row as any);
}

export async function getGuidePack(planId: string | null, guideKey: string): Promise<GuidePack | undefined> {
  const row = await idbGet<StoredGuidePack>(idbStores.packs, makeKey(planId, guideKey));
  return row?.payload;
}

export async function deleteGuidePack(planId: string | null, guideKey: string): Promise<void> {
  await idbDel(idbStores.packs, makeKey(planId, guideKey));
}

export async function listGuidePacks(planId: string | null): Promise<{ guideKey: string; pack: GuidePack; saved_at: number }[]> {
  const all = await idbGetAll<any>(idbStores.packs);
  const prefix = `${planId ?? "global"}:guide:`;
  return (all as any[])
    .filter((r) => r?.kind === "guide" && typeof r?.k === "string" && r.k.startsWith(prefix))
    .map((r) => ({ guideKey: String(r.k).slice(prefix.length), pack: r.payload as GuidePack, saved_at: r.saved_at as number }))
    .sort((a, b) => b.saved_at - a.saved_at);
}
