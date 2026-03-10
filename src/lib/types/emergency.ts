export type EmergencyContact = {
  id: string;            // uuid
  owner_id?: string;     // set by server; optional client-side
  name: string;
  phone: string;
  relationship?: string | null;
  notes?: string | null;
  created_at?: string;   // ISO
  updated_at?: string;   // ISO
};

// What we store locally (include local-only metadata)
export type EmergencyContactLocal = EmergencyContact & {
  _local_updated_at: string; // ISO - for local conflict decisions
};

export type EmergencyOpType = "emergency_upsert" | "emergency_delete";

export type EmergencySyncOp = {
  id?: number;             // autoIncrement in IDB sync_queue
  type: EmergencyOpType;
  payload: any;
  created_at: string;      // ISO
};
