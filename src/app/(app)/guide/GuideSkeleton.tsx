// src/app/(app)/guide/GuideSkeleton.tsx
// Shared skeleton used by loading.tsx (route-level) and ClientPage.tsx (boot state).

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
        overflowY: "auto",
        WebkitOverflowScrolling: "touch",
        overscrollBehavior: "contain",
      }}
    >
      {/* ── Sticky header skeleton ─────────────────────────────────── */}
      <div
        style={{
          position: "sticky",
          top: 0,
          zIndex: 50,
          padding: "16px 16px 12px",
          background: "linear-gradient(to bottom, var(--roam-bg) 78%, transparent)",
          backdropFilter: "blur(10px)",
          WebkitBackdropFilter: "blur(10px)",
        }}
      >
        {/* Title row */}
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <Skel w={32} h={32} r={8} />
          <Skel w={140} h={18} r={8} style={{ flex: "none" }} />
          <div style={{ flex: 1 }} />
          <Skel w={72} h={28} r={999} delay={0.1} />
        </div>

        {/* Progress bar row */}
        <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 4 }}>
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <Skel w={90} h={11} r={6} delay={0.05} />
            <Skel w={90} h={11} r={6} delay={0.1} />
          </div>
          <Skel w="100%" h={8} r={4} delay={0.15} />
        </div>

        {/* GPS status line */}
        <div style={{ marginTop: 8, display: "flex", alignItems: "center", gap: 6 }}>
          <Skel w={14} h={14} r={4} delay={0.2} />
          <Skel w={110} h={11} r={6} delay={0.2} />
        </div>
      </div>

      {/* ── Content skeleton ───────────────────────────────────────── */}
      <div
        style={{
          padding: "0 16px",
          paddingBottom: "calc(var(--bottom-nav-height, 80px) + 24px)",
          display: "flex",
          flexDirection: "column",
          gap: 12,
        }}
      >
        {/* Tab switcher */}
        <div
          style={{
            display: "flex",
            gap: 8,
            padding: "4px",
            borderRadius: "var(--r-pill, 999px)",
            background: "var(--roam-surface)",
          }}
        >
          <Skel w="50%" h={36} r={999} delay={0.05} />
          <Skel w="50%" h={36} r={999} delay={0.1} />
        </div>

        {/* Welcome card */}
        <div
          style={{
            borderRadius: "var(--r-card)",
            background: "var(--roam-surface)",
            padding: 20,
            display: "flex",
            flexDirection: "column",
            gap: 12,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <Skel w={44} h={44} r={22} delay={0.1} />
            <div style={{ display: "flex", flexDirection: "column", gap: 6, flex: 1 }}>
              <Skel w="55%" h={16} r={6} delay={0.12} />
              <Skel w="35%" h={12} r={6} delay={0.16} />
            </div>
          </div>
          <Skel w="90%" h={13} r={6} delay={0.18} />
          <Skel w="75%" h={13} r={6} delay={0.2} />
        </div>

        {/* Quick suggestion grid */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              style={{
                borderRadius: "var(--r-card)",
                background: "var(--roam-surface)",
                padding: "14px 12px",
                display: "flex",
                alignItems: "center",
                gap: 10,
              }}
            >
              <Skel w={32} h={32} r={10} delay={0.1 + i * 0.05} />
              <Skel w="60%" h={13} r={6} delay={0.15 + i * 0.05} />
            </div>
          ))}
        </div>

        {/* Chat input bar */}
        <div style={{ display: "flex", gap: 10, alignItems: "center", marginTop: 4 }}>
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
