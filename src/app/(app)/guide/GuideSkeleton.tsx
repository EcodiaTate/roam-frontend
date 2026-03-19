// src/app/(app)/guide/GuideSkeleton.tsx
// Shared skeleton used by loading.tsx (route-level) and ClientPage.tsx (boot state).
// Matches the actual Guide page layout: sticky header (3-col grid with title,
// underline tabs, status pill) + content area with chat messages placeholder.

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
        animation: `guide-skel-pulse 1.6s ease-in-out infinite ${delay}s`,
        flexShrink: 0,
        ...style,
      }}
    />
  );
}

export function GuideSkeleton() {
  return (
    <div
      style={{
        height: "100%",
        background: "var(--roam-bg)",
        color: "var(--roam-text)",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
      }}
    >
      {/* ── Sticky header skeleton ─────────────────────────────────── */}
      <div
        style={{
          flexShrink: 0,
          zIndex: 50,
          padding: "calc(env(safe-area-inset-top, 0px) + 20px) 16px 0",
          background: "var(--roam-bg)",
          borderBottom: "1px solid var(--roam-border)",
        }}
      >
        {/* Title row: 3-column grid - title | tabs | status pill */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr auto 1fr", alignItems: "center", height: 44 }}>
          {/* Left: trip title */}
          <div style={{ minWidth: 0, justifySelf: "start" }}>
            <Skel w={120} h={28} r={8} />
          </div>

          {/* Center: underline tab switcher (Guide | Found) */}
          <div style={{ display: "flex", gap: 0, justifySelf: "center" }}>
            {[0, 1].map((i) => (
              <div
                key={i}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 6,
                  padding: "8px 14px",
                  height: 44,
                  borderBottom: i === 0 ? "3px solid var(--roam-surface-hover)" : "3px solid transparent",
                  marginBottom: "-1px",
                }}
              >
                <Skel w={13} h={13} r={4} delay={0.05 + i * 0.05} />
                <Skel w={i === 0 ? 40 : 38} h={13} r={6} delay={0.08 + i * 0.05} />
              </div>
            ))}
          </div>

          {/* Right: status pill */}
          <div style={{ justifySelf: "end" }}>
            <Skel w={72} h={28} r={999} delay={0.1} />
          </div>
        </div>

        {/* Progress bar */}
        <div style={{ marginTop: 10, marginBottom: 12 }}>
          <Skel w="100%" h={8} r={4} delay={0.15} />
        </div>
      </div>

      {/* ── Content area skeleton ─────────────────────────────────── */}
      <div
        style={{
          flex: 1,
          minHeight: 0,
          overflow: "hidden",
          padding: "16px 16px",
          display: "flex",
          flexDirection: "column",
          gap: 12,
        }}
      >
        {/* Chat message bubbles placeholder */}
        {/* Assistant welcome message */}
        <div
          style={{
            alignSelf: "flex-start",
            maxWidth: "85%",
            borderRadius: "var(--r-card, 16px)",
            background: "var(--roam-surface)",
            padding: "14px 16px",
            display: "flex",
            flexDirection: "column",
            gap: 8,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <Skel w={28} h={28} r={14} delay={0.1} />
            <Skel w={60} h={14} r={6} delay={0.12} />
          </div>
          <Skel w="95%" h={13} r={6} delay={0.16} />
          <Skel w="80%" h={13} r={6} delay={0.2} />
          <Skel w="60%" h={13} r={6} delay={0.24} />
        </div>

        {/* Suggestion chips */}
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <Skel w={110} h={34} r={999} delay={0.2} />
          <Skel w={130} h={34} r={999} delay={0.25} />
          <Skel w={100} h={34} r={999} delay={0.3} />
        </div>

        {/* Spacer to push input to bottom */}
        <div style={{ flex: 1 }} />

        {/* Chat input bar - pinned at bottom */}
        <div style={{ display: "flex", gap: 10, alignItems: "center", paddingBottom: "calc(var(--bottom-nav-height, 80px) + 8px)" }}>
          <Skel w="100%" h={52} r={14} delay={0.3} style={{ flex: 1 }} />
          <Skel w={52} h={52} r={14} delay={0.35} />
        </div>
      </div>

      <style>{`
        @keyframes guide-skel-pulse {
          0%, 100% { opacity: 0.45; }
          50%       { opacity: 0.85; }
        }
      `}</style>
    </div>
  );
}
