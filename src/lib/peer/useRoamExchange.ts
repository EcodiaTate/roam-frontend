// src/lib/peer/useRoamExchange.ts
"use client";

/**
 * useRoamExchange
 *
 * Orchestrates the full peer-to-peer data exchange flow:
 *
 * 1. User A taps "Share" → phone A transmits via ultrasonic
 * 2. User B taps "Listen" → phone B receives via ultrasonic
 * 3. After A finishes sending, it auto-switches to Listen
 * 4. After B finishes receiving, it auto-switches to Share
 * 5. Both phones now have each other's data
 *
 * The exchange is route-aware: we only send data that's
 * relevant to the OTHER person's route. Since we don't know
 * their route beforehand, we encode OUR route geometry in the
 * first few bytes of the preamble data, then the receiver
 * filters their own data to send back.
 *
 * Frame layout:
 *   [ROUTE_GEOMETRY_HASH:4][ROUTE_BBOX:16][ITEMS...]
 *
 * For simplicity in v1: we send everything the sender has
 * that's within the sender's own route corridor. The receiver
 * merges what's useful. In v2, the second pass (auto-switch)
 * can use the received bbox to filter.
 */

import { useCallback, useRef, useState } from "react";
import { encodeFrame, decodeFrame, type EncodableItem } from "./roamCodec";
import { collectRelevantData, getMyRouteGeometry } from "./filterRelevantData";
import { transmit, receive, estimateTransferSeconds, type TransmitProgress, type ReceiveProgress } from "./ultrasonicTransfer";
import { haptic } from "@/lib/native/haptics";
import { roamNotify } from "@/lib/native/notifications";

// ── State types ──────────────────────────────────────────────

export type ExchangePhase =
  | "idle"
  | "preparing"      // collecting + encoding data
  | "sending"         // transmitting ultrasonic
  | "listening"       // waiting for preamble
  | "receiving"       // receiving data symbols
  | "processing"      // decoding + merging received data
  | "switching"       // brief pause before auto-switch
  | "complete"        // exchange done
  | "error";

export type ExchangeState = {
  phase: ExchangePhase;
  role: "give" | "listen" | null;
  progress: number;            // 0-100
  message: string;
  itemsSent: number;
  itemsReceived: number;
  bytesSent: number;
  bytesReceived: number;
  estimatedSeconds: number;
  error: string | null;
  /** How many rounds completed (0, 1, or 2 for full exchange) */
  roundsComplete: number;
};

const INITIAL_STATE: ExchangeState = {
  phase: "idle",
  role: null,
  progress: 0,
  message: "Ready to exchange",
  itemsSent: 0,
  itemsReceived: 0,
  bytesSent: 0,
  bytesReceived: 0,
  estimatedSeconds: 0,
  error: null,
  roundsComplete: 0,
};

// ── Hook ─────────────────────────────────────────────────────

export function useRoamExchange() {
  const [state, setState] = useState<ExchangeState>(INITIAL_STATE);
  const abortRef = useRef<AbortController | null>(null);
  const receivedItemsRef = useRef<EncodableItem[]>([]);

  /** Start as the GIVER — transmit first, then auto-listen */
  const startGive = useCallback(async () => {
    abortRef.current = new AbortController();

    try {
      // ── Phase 1: Prepare data ──────────────────────────
      setState((s) => ({ ...s, phase: "preparing", role: "give", progress: 0, message: "Collecting your road intel...", error: null }));
      haptic.light();

      const myGeometry = await getMyRouteGeometry();
      if (!myGeometry) {
        setState((s) => ({ ...s, phase: "error", error: "No active route — build a trip first" }));
        return;
      }

      // Collect data relevant to our own route (the other person
      // will be on a similar/intersecting route if they're nearby)
      const items = await collectRelevantData(myGeometry);

      if (items.length === 0) {
        setState((s) => ({ ...s, phase: "error", error: "No overlay data to share — try building your bundle first" }));
        return;
      }

      const frame = encodeFrame(items);
      const estSeconds = estimateTransferSeconds(frame.length);

      setState((s) => ({
        ...s, phase: "sending", progress: 0,
        message: `Sending ${items.length} items (${frame.length} bytes, ~${Math.ceil(estSeconds)}s)...`,
        itemsSent: items.length, bytesSent: frame.length, estimatedSeconds: estSeconds,
      }));

      // ── Phase 2: Transmit ──────────────────────────────
      haptic.medium();
      await transmit(frame, (p: TransmitProgress) => {
        setState((s) => ({
          ...s,
          progress: Math.round(p.percent),
          message: p.phase === "preamble" ? "Syncing..." :
            p.phase === "data" ? `Sending... ${p.bytesSent}/${p.totalBytes} bytes` :
              p.phase === "postamble" ? "Finishing..." : "Sent!",
        }));
      });

      haptic.success();
      setState((s) => ({ ...s, phase: "switching", progress: 100, message: "Sent! Switching to listen...", roundsComplete: 1 }));

      // ── Phase 3: Auto-switch to listen ─────────────────
      await _sleep(1500);
      if (abortRef.current?.signal.aborted) return;

      await _doListen(abortRef.current.signal, setState, receivedItemsRef, 2);
    } catch (e) {
      if (!abortRef.current?.signal.aborted) {
        setState((s) => ({ ...s, phase: "error", error: e instanceof Error ? e.message : "Exchange failed" }));
      }
    }
  }, []);

  /** Start as the LISTENER — receive first, then auto-send */
  const startListen = useCallback(async () => {
    abortRef.current = new AbortController();

    try {
      setState((s) => ({ ...s, phase: "listening", role: "listen", progress: 0, message: "Listening for ultrasonic signal...", error: null }));
      haptic.light();

      await _doListen(abortRef.current.signal, setState, receivedItemsRef, 1);

      // ── Auto-switch to send ────────────────────────────
      if (abortRef.current?.signal.aborted) return;

      setState((s) => ({ ...s, phase: "switching", message: "Received! Now sending your data back...", roundsComplete: 1 }));
      await _sleep(1500);
      if (abortRef.current?.signal.aborted) return;

      await _doSend(abortRef.current.signal, setState, 2);
    } catch (e) {
      if (!abortRef.current?.signal.aborted) {
        setState((s) => ({ ...s, phase: "error", error: e instanceof Error ? e.message : "Exchange failed" }));
      }
    }
  }, []);

  /** Cancel the exchange */
  const cancel = useCallback(() => {
    abortRef.current?.abort();
    setState(INITIAL_STATE);
  }, []);

  /** Reset to idle */
  const reset = useCallback(() => {
    abortRef.current?.abort();
    setState(INITIAL_STATE);
    receivedItemsRef.current = [];
  }, []);

  return {
    state,
    startGive,
    startListen,
    cancel,
    reset,
    receivedItems: receivedItemsRef.current,
  };
}

// ── Internal helpers ─────────────────────────────────────────

async function _doListen(
  signal: AbortSignal,
  setState: React.Dispatch<React.SetStateAction<ExchangeState>>,
  receivedItemsRef: React.MutableRefObject<EncodableItem[]>,
  targetRound: number,
) {
  setState((s) => ({ ...s, phase: "listening", progress: 0, message: "Listening for ultrasonic signal... Hold phones close" }));

  const rawData = await receive(120_000, (p: ReceiveProgress) => {
    setState((s) => ({
      ...s,
      phase: p.phase === "done" ? "processing" : "receiving",
      progress: p.percent >= 0 ? Math.round(p.percent) : s.progress,
      message: p.message ?? "Receiving...",
      bytesReceived: p.bytesReceived,
    }));
  }, signal);

  // Decode
  setState((s) => ({ ...s, phase: "processing", message: "Decoding received data..." }));
  haptic.medium();

  try {
    const items = decodeFrame(rawData);
    receivedItemsRef.current = [...receivedItemsRef.current, ...items];

    // Merge into IDB via the existing peer sync merge pipeline
    const { idbGet, idbPut } = await import("@/lib/offline/idb");

    // Store received items as peer observations in IDB
    const existing = ((await idbGet("meta", "peer:ultrasonic_received")) ?? []) as EncodableItem[];
    const merged = [...existing, ...items];
    await idbPut("meta", merged.slice(-500), "peer:ultrasonic_received");

    haptic.success();
    roamNotify.peerSyncComplete(items.length);

    setState((s) => ({
      ...s,
      phase: targetRound >= 2 ? "complete" : "switching",
      progress: 100,
      message: `Received ${items.length} items!`,
      itemsReceived: s.itemsReceived + items.length,
      roundsComplete: targetRound,
    }));
  } catch (e) {
    setState((s) => ({
      ...s, phase: "error",
      error: `Decode failed: ${e instanceof Error ? e.message : "corrupted data"}. Try again — hold phones closer.`,
    }));
  }
}

async function _doSend(
  signal: AbortSignal,
  setState: React.Dispatch<React.SetStateAction<ExchangeState>>,
  targetRound: number,
) {
  setState((s) => ({ ...s, phase: "preparing", message: "Collecting your data to send back..." }));

  const myGeometry = await getMyRouteGeometry();
  if (!myGeometry) {
    setState((s) => ({ ...s, phase: "error", error: "No active route" }));
    return;
  }

  const items = await collectRelevantData(myGeometry);
  if (items.length === 0) {
    setState((s) => ({ ...s, phase: "complete", message: "No data to send back", roundsComplete: targetRound }));
    return;
  }

  const frame = encodeFrame(items);
  const estSeconds = estimateTransferSeconds(frame.length);

  setState((s) => ({
    ...s, phase: "sending", progress: 0,
    message: `Sending ${items.length} items back (~${Math.ceil(estSeconds)}s)...`,
    itemsSent: s.itemsSent + items.length, bytesSent: s.bytesSent + frame.length,
    estimatedSeconds: estSeconds,
  }));

  haptic.medium();
  await transmit(frame, (p: TransmitProgress) => {
    setState((s) => ({
      ...s,
      progress: Math.round(p.percent),
      message: p.phase === "data" ? `Sending... ${p.bytesSent}/${p.totalBytes} bytes` : s.message,
    }));
  });

  haptic.success();
  setState((s) => ({
    ...s, phase: "complete", progress: 100,
    message: "Exchange complete! Both phones now have fresh road intel.",
    roundsComplete: targetRound,
  }));
}

function _sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}
