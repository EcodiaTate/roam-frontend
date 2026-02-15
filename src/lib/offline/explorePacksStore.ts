// src/lib/offline/explorePacksStore.ts
"use client";

import { idbDel, idbGet, idbGetAll, idbPut, idbStores } from "./idb";
import type { ExplorePack } from "@/lib/types/explore";

export type StoredExplorePack = {
  k: string;
  plan_id: string | null;     // keep null for global sessions
  kind: "explore";
  saved_at: number;
  payload: ExplorePack;
};

function makeKey(planId: string | null, exploreKey: string) {
  return `${planId ?? "global"}:explore:${exploreKey}`;
}

export async function putExplorePack(planId: string | null, exploreKey: string, pack: ExplorePack): Promise<void> {
  const row: StoredExplorePack = {
    k: makeKey(planId, exploreKey),
    plan_id: planId ?? null,
    kind: "explore",
    saved_at: Date.now(),
    payload: pack,
  };
  await idbPut(idbStores.packs, row as any);
}

export async function getExplorePack(planId: string | null, exploreKey: string): Promise<ExplorePack | undefined> {
  const row = await idbGet<StoredExplorePack>(idbStores.packs, makeKey(planId, exploreKey));
  return row?.payload;
}

export async function deleteExplorePack(planId: string | null, exploreKey: string): Promise<void> {
  await idbDel(idbStores.packs, makeKey(planId, exploreKey));
}

export async function listExplorePacks(planId: string | null): Promise<{ exploreKey: string; pack: ExplorePack; saved_at: number }[]> {
  const all = await idbGetAll<any>(idbStores.packs);
  const prefix = `${planId ?? "global"}:explore:`;
  return (all as any[])
    .filter((r) => r?.kind === "explore" && typeof r?.k === "string" && r.k.startsWith(prefix))
    .map((r) => ({ exploreKey: String(r.k).slice(prefix.length), pack: r.payload as ExplorePack, saved_at: r.saved_at as number }))
    .sort((a, b) => b.saved_at - a.saved_at);
}
