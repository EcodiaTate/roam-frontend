"use client";

import type { User } from "@supabase/supabase-js";
import type { EmergencyContact } from "@/lib/types/emergency";

import { upsertEmergencyContact, deleteEmergencyContact } from "@/lib/offline/emergencyStore";
import { enqueueEmergencyUpsert, enqueueEmergencyDelete } from "@/lib/offline/emergencyQueue";
import { emergencyPushQueue } from "@/lib/offline/emergencySync";

export async function saveEmergencyContactLocalFirst(args: {
  user: User | null;
  isOnline: boolean;
  contact: EmergencyContact;
}) {
  const saved = await upsertEmergencyContact(args.contact);

  // Queue the FULL contact so cloud gets timestamps too
  await enqueueEmergencyUpsert(saved);

  // Try immediate push, but do not fail the UX if it errors.
  if (args.user && args.isOnline) {
    try {
      await emergencyPushQueue(args.user);
    } catch (e) {
      // keep queued; autosync will surface the error in the page banner
      console.warn("[emergency] push failed, queued for retry:", e);
    }
  }

  return saved;
}

export async function deleteEmergencyContactLocalFirst(args: {
  user: User | null;
  isOnline: boolean;
  id: string;
}) {
  await deleteEmergencyContact(args.id);
  await enqueueEmergencyDelete({ id: args.id });

  if (args.user && args.isOnline) {
    try {
      await emergencyPushQueue(args.user);
    } catch (e) {
      console.warn("[emergency] delete push failed, queued for retry:", e);
    }
  }
}
