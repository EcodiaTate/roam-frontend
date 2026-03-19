// src/lib/api/peerSync.ts
import { api } from "./client";
import type { PeerSyncRequest, PeerSyncDelta } from "@/lib/types/peer";

export const peerSyncApi = {
  /** POST /peer/sync - build overlay delta for peer exchange */
  sync: (req: PeerSyncRequest) =>
    api.post<PeerSyncDelta>("/peer/sync", req),
};
