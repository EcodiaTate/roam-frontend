"use client";

import type { User } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase/client";
import type { EmergencyContact } from "@/lib/types/emergency";

const TABLE = "emergency_contacts";

/**
 * IMPORTANT:
 * This assumes your table has an `owner_id` (uuid) column used for RLS like:
 *   owner_id = auth.uid()
 *
 * If your column is called `user_id` instead, rename owner_id -> user_id below.
 */

export async function cloudListEmergencyContacts(user: User): Promise<EmergencyContact[]> {
  const { data, error } = await supabase
    .from(TABLE)
    .select("*")
    .eq("owner_id", user.id)
    .order("updated_at", { ascending: false });

  if (error) throw new Error(error.message);
  return (data ?? []) as any;
}

export async function cloudUpsertEmergencyContact(user: User, c: EmergencyContact): Promise<void> {
  const payload = {
    id: c.id,
    owner_id: user.id,
    name: c.name,
    phone: c.phone,
    relationship: c.relationship ?? null,
    notes: c.notes ?? null,
    created_at: (c as any).created_at ?? null,
    updated_at: (c as any).updated_at ?? null,
  };

  const { error } = await supabase.from(TABLE).upsert(payload, { onConflict: "id" });
  if (error) throw new Error(error.message);
}

export async function cloudDeleteEmergencyContact(user: User, id: string): Promise<void> {
  const { error } = await supabase.from(TABLE).delete().eq("id", id).eq("owner_id", user.id);
  if (error) throw new Error(error.message);
}
