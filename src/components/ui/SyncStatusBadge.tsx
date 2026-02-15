"use client";

import { usePlanSync } from "@/lib/hooks/usePlanSync";

/**
 * Tiny badge showing sync status. Drop this into headers, plan list rows, etc.
 *
 * States:
 * - Online + no pending  → green dot (synced)
 * - Online + syncing     → blue pulse (syncing)
 * - Online + pending > 0 → amber dot + count
 * - Offline              → grey dot + "Offline"
 */
export function SyncStatusBadge() {
  const { online, syncing, pendingCount } = usePlanSync();

  if (!online) {
    return (
      <span style={styles.badge}>
        <span style={{ ...styles.dot, background: "var(--roam-text-muted)" }} />
        <span className="trip-muted-small">Offline</span>
      </span>
    );
  }

  if (syncing) {
    return (
      <span style={styles.badge}>
        <span style={{ ...styles.dot, background: "var(--brand-sky)", animation: "fadeIn 1s ease-in-out infinite alternate" }} />
        <span className="trip-muted-small" style={{ color: "var(--brand-sky)" }}>Syncing…</span>
      </span>
    );
  }

  if (pendingCount > 0) {
    return (
      <span style={styles.badge}>
        <span style={{ ...styles.dot, background: "var(--brand-ochre)" }} />
        <span className="trip-muted-small" style={{ color: "var(--brand-ochre)" }}>{pendingCount} pending</span>
      </span>
    );
  }

  return (
    <span style={styles.badge}>
      <span style={{ ...styles.dot, background: "var(--roam-success)" }} />
      <span className="trip-muted-small" style={{ color: "var(--roam-success)" }}>Synced</span>
    </span>
  );
}

const styles: Record<string, React.CSSProperties> = {
  badge: {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    padding: "4px 8px",
    background: "var(--roam-surface-hover)",
    borderRadius: "var(--r-pill)",
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: "50%",
    flexShrink: 0,
  },
};