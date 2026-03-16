// src/lib/types/memories.ts

/** A single photo attached to a stop memory */
export type StopPhoto = {
  /** Storage path in Supabase (e.g. "userId/planId/stopId/1.jpg") */
  path: string;
  /** Signed or public URL — populated at read time, not persisted */
  url?: string;
  /** Local blob URL for offline/unsaved photos */
  localUrl?: string;
  /** Original file blob (kept in IDB for offline-first upload) */
  blob?: Blob;
};

/** Per-stop journal entry: note + photos */
export type StopMemory = {
  /** UUID (matches Supabase row id, or local UUID before sync) */
  id: string;
  plan_id: string;
  stop_id: string;
  stop_name: string | null;
  stop_index: number;

  /** Free-text journal note */
  note: string | null;

  /** Up to 5 photos */
  photos: StopPhoto[];

  /** GPS-triggered arrival timestamp (ms epoch) */
  arrived_at: number | null;

  /** Denormalized stop coordinates */
  lat: number;
  lng: number;

  created_at: string; // ISO
  updated_at: string; // ISO

  /** True if this memory has local changes not yet synced to cloud */
  dirty?: boolean;
};

/** Lightweight summary for timeline rendering */
export type MemoryTimelineEntry = {
  stop_index: number;
  stop_name: string | null;
  note: string | null;
  photo_urls: string[];
  arrived_at: number | null;
  lat: number;
  lng: number;
  /** Polyline6 geometry of the route segment leading TO this stop */
  segment_geometry?: string;
};
