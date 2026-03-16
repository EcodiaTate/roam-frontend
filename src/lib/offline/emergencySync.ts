"use client";

import type { User } from "@supabase/supabase-js";
import type { EmergencyContact } from "@/lib/types/emergency";

import {
  cloudDeleteEmergencyContact,
  cloudListEmergencyContacts,
  cloudUpsertEmergencyContact,
} from "@/lib/supabase/emergencyCloud";

import { mergeEmergencyFromCloud } from "@/lib/offline/emergencyStore";
import { peekEmergencyOps, removeEmergencyOp } from "@/lib/offline/emergencyQueue";

// Pull cloud -> merge into local
async function emergencyPull(user: User | null): Promise<void> {
  if (!user) return;
  const remote = await cloudListEmergencyContacts(user);
  await mergeEmergencyFromCloud(remote);
}

// Push queued local ops -> cloud (FIFO)
export async function emergencyPushQueue(user: User | null): Promise<void> {
  if (!user) return;

  const ops = await peekEmergencyOps(100);

  for (const op of ops) {
    try {
      if (op.type === "emergency_upsert") {
        await cloudUpsertEmergencyContact(user, op.payload as EmergencyContact);
      } else if (op.type === "emergency_delete") {
        await cloudDeleteEmergencyContact(user, (op.payload as { id: string }).id);
      }
      await removeEmergencyOp(op.id);
    } catch (e: unknown) {
      // Stop on first failure to preserve ordering, but DO surface the error.
      const msg = e instanceof Error ? e.message : String(e);
      throw new Error(`Emergency sync failed on ${op.type}: ${msg}`);
    }
  }
}

// One-shot: pull then push
export async function emergencySyncOnce(user: User | null): Promise<void> {
  if (!user) return;
  await emergencyPull(user);
  await emergencyPushQueue(user);
}
