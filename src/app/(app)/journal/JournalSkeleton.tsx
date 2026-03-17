// src/app/(app)/journal/JournalSkeleton.tsx
// Loading shell for /journal — matches MemoriesClientPage header + timeline layout.

import type { CSSProperties } from "react";

function Skel({
  w,
  h,
  r = 8,
  delay = 0,
  style,
}: {
  w: number | string;
  h: number;
  r?: number;
  delay?: number;
  style?: CSSProperties;
}) {
  return (
    <div
      style={{
        width: w,
        height: h,
        borderRadius: r,
        background: "var(--roam-surface-hover)",
        animation: `journal-skel-pulse 1.6s ease-in-out infinite ${delay}s`,
        flexShrink: 0,
        ...style,
      }}
    />
  );
}

export function JournalSkeleton() {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        overflowY: "auto",
        WebkitOverflowScrolling: "touch",
        paddingBottom: "calc(var(--bottom-nav-height, 80px) + 24px)",
        background: "var(--roam-bg)",
      }}
    >
      {/* ── Sticky header skeleton ───────────────────────────────── */}
      <div
        style={{
          position: "sticky",
          top: 0,
          zIndex: 10,
          padding: "20px 20px 12px",
          background: "color-mix(in srgb, var(--roam-bg) 90%, transparent)",
          backdropFilter: "blur(24px) saturate(150%)",
          WebkitBackdropFilter: "blur(24px) saturate(150%)",
        }}
      >
        {/* Title row */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            height: 36,
            marginBottom: 12,
          }}
        >
          <Skel w={100} h={24} r={8} />
        </div>

        {/* Inner tab bar (Memories | Places) */}
        <div
          style={{
            display: "flex",
            gap: 4,
            background: "var(--roam-bg)",
            borderRadius: 12,
            padding: 3,
          }}
        >
          <Skel w="50%" h={40} r={9} delay={0.05} />
          <Skel w="50%" h={40} r={9} delay={0.1} />
        </div>
      </div>

      {/* ── Content area skeleton ────────────────────────────────── */}
      <div style={{ padding: "0 20px", display: "flex", flexDirection: "column", gap: 12 }}>
        {/* Trip selector chips */}
        <div style={{ display: "flex", gap: 8, overflow: "hidden" }}>
          <Skel w={120} h={34} r={999} delay={0.08} />
          <Skel w={140} h={34} r={999} delay={0.12} />
          <Skel w={100} h={34} r={999} delay={0.16} />
        </div>

        {/* Trip summary bar */}
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <Skel w={70} h={14} r={6} delay={0.1} />
          <span style={{ color: "var(--roam-text-muted)", opacity: 0.3 }}>&middot;</span>
          <Skel w={60} h={14} r={6} delay={0.14} />
          <span style={{ color: "var(--roam-text-muted)", opacity: 0.3 }}>&middot;</span>
          <Skel w={55} h={14} r={6} delay={0.18} />
        </div>

        {/* Map area */}
        <div
          style={{
            height: 180,
            borderRadius: "var(--r-card, 16px)",
            background: "var(--roam-surface-hover)",
            animation: "journal-skel-pulse 1.6s ease-in-out infinite 0.1s",
          }}
        />

        {/* Timeline entries */}
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} style={{ display: "flex", flexDirection: "column", gap: 0 }}>
            {/* Connector line */}
            {i > 0 && (
              <div
                style={{
                  width: 2,
                  height: 20,
                  background: "var(--roam-surface-hover)",
                  marginLeft: 18,
                  opacity: 0.5,
                }}
              />
            )}

            {/* Stop card */}
            <div
              style={{
                borderRadius: "var(--r-card, 16px)",
                background: "var(--roam-surface)",
                padding: "14px 16px",
                display: "flex",
                flexDirection: "column",
                gap: 10,
              }}
            >
              {/* Header row: marker + name + time */}
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <div
                  style={{
                    width: 28,
                    height: 28,
                    borderRadius: 14,
                    background: "var(--roam-surface-hover)",
                    flexShrink: 0,
                    animation: `journal-skel-pulse 1.6s ease-in-out infinite ${0.05 + i * 0.1}s`,
                  }}
                />
                <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 5 }}>
                  <Skel w="55%" h={14} r={6} delay={0.1 + i * 0.1} />
                  <Skel w="35%" h={10} r={4} delay={0.15 + i * 0.1} />
                </div>
                <Skel w={28} h={28} r={8} delay={0.12 + i * 0.1} />
              </div>

              {/* Photo strip placeholder */}
              <div style={{ display: "flex", gap: 8 }}>
                <Skel w={80} h={64} r={10} delay={0.18 + i * 0.1} />
                <Skel w={80} h={64} r={10} delay={0.22 + i * 0.1} />
                {i === 0 && <Skel w={80} h={64} r={10} delay={0.26} />}
              </div>
            </div>
          </div>
        ))}
      </div>

      <style>{`
        @keyframes journal-skel-pulse {
          0%, 100% { opacity: 0.45; }
          50%       { opacity: 0.85; }
        }
      `}</style>
    </div>
  );
}
