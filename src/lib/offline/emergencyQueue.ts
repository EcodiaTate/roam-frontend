"use client";

import { idbWithTx, idbStores } from "./idb";
import type { EmergencySyncOp } from "@/lib/types/emergency";

function nowIso() {
  return new Date().toISOString();
}

export async function enqueueEmergencyUpsert(payload: any): Promise<void> {
  const op: EmergencySyncOp = { type: "emergency_upsert", payload, created_at: nowIso() };

  await idbWithTx([idbStores.syncQueue], async (os) => {
    os.get(idbStores.syncQueue)!.add(op);
  });
}

export async function enqueueEmergencyDelete(payload: any): Promise<void> {
  const op: EmergencySyncOp = { type: "emergency_delete", payload, created_at: nowIso() };

  await idbWithTx([idbStores.syncQueue], async (os) => {
    os.get(idbStores.syncQueue)!.add(op);
  });
}

export async function peekEmergencyOps(limit = 50): Promise<(EmergencySyncOp & { id: number })[]> {
  const dbOps: (EmergencySyncOp & { id: number })[] = [];

  await idbWithTx([idbStores.syncQueue], async (os) => {
    const store = os.get(idbStores.syncQueue)!;
    const idx = store.index("created_at");

    await new Promise<void>((resolve, reject) => {
      let count = 0;
      const req = idx.openCursor();
      req.onerror = () => reject(req.error ?? new Error("cursor failed"));
      req.onsuccess = () => {
        const cursor = req.result;
        if (!cursor || count >= limit) return resolve();

        const val = cursor.value as any;
        if (val?.type === "emergency_upsert" || val?.type === "emergency_delete") {
          dbOps.push({ ...(val as EmergencySyncOp), id: (val.id ?? cursor.primaryKey) as number });
          count++;
        }
        cursor.continue();
      };
    });
  });

  return dbOps;
}

export async function removeEmergencyOp(id: number): Promise<void> {
  await idbWithTx([idbStores.syncQueue], async (os) => {
    os.get(idbStores.syncQueue)!.delete(id);
  });
}
