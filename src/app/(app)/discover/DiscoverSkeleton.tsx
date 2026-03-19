// src/app/(app)/discover/DiscoverSkeleton.tsx
// Loading shell for /discover - matches DiscoverClientPage header + feed grid layout.

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
        animation: `disc-skel-pulse 1.6s ease-in-out infinite ${delay}s`,
        flexShrink: 0,
        ...style,
      }}
    />
  );
}

export function DiscoverSkeleton() {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        background: "var(--roam-bg)",
        overflow: "hidden",
      }}
    >
      {/* ── Header skeleton ──────────────────────────────────────── */}
      <div
        style={{
          flexShrink: 0,
          padding: "20px 20px 0",
          background: "color-mix(in srgb, var(--roam-bg) 90%, transparent)",
          backdropFilter: "blur(24px) saturate(150%)",
          WebkitBackdropFilter: "blur(24px) saturate(150%)",
        }}
      >
        {/* Title row: title group + filter button */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: 12,
          }}
        >
          <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            <Skel w={120} h={28} r={8} />
            <Skel w={190} h={13} r={6} delay={0.08} />
          </div>
          {/* Filter pill */}
          <Skel w={80} h={32} r={999} delay={0.12} />
        </div>
      </div>

      {/* ── Feed grid skeleton ───────────────────────────────────── */}
      <div
        style={{
          flex: 1,
          overflowY: "auto",
          WebkitOverflowScrolling: "touch",
          padding: "8px 20px",
          paddingBottom: "calc(var(--bottom-nav-height, 80px) + 24px)",
        }}
      >
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: 12,
          }}
        >
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              style={{
                borderRadius: "var(--r-card, 16px)",
                background: "var(--roam-surface)",
                overflow: "hidden",
                animation: `disc-skel-pulse 1.6s ease-in-out infinite ${0.05 + i * 0.06}s`,
              }}
            >
              {/* Map preview area */}
              <div
                style={{
                  height: 110,
                  background: "var(--roam-surface-hover)",
                }}
              />
              {/* Card body */}
              <div style={{ padding: "10px 12px 12px" }}>
                <Skel w="80%" h={14} r={6} delay={0.1 + i * 0.06} />
                <div style={{ marginTop: 8, display: "flex", gap: 6 }}>
                  <Skel w={48} h={18} r={999} delay={0.15 + i * 0.06} />
                  <Skel w={48} h={18} r={999} delay={0.18 + i * 0.06} />
                </div>
                {/* Footer: start → end */}
                <div
                  style={{
                    marginTop: 8,
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                  }}
                >
                  <div
                    style={{
                      width: 6,
                      height: 6,
                      borderRadius: 3,
                      background: "var(--brand-eucalypt, #42b159)",
                      opacity: 0.4,
                      flexShrink: 0,
                    }}
                  />
                  <Skel w={50} h={10} r={4} delay={0.2 + i * 0.06} />
                  <span
                    style={{
                      color: "var(--roam-text-muted)",
                      opacity: 0.3,
                      fontSize: 10,
                    }}
                  >
                    ···
                  </span>
                  <div
                    style={{
                      width: 6,
                      height: 6,
                      borderRadius: 3,
                      background: "var(--brand-ochre, #b5452e)",
                      opacity: 0.4,
                      flexShrink: 0,
                    }}
                  />
                  <Skel w={50} h={10} r={4} delay={0.22 + i * 0.06} />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <style>{`
        @keyframes disc-skel-pulse {
          0%, 100% { opacity: 0.45; }
          50%       { opacity: 0.85; }
        }
      `}</style>
    </div>
  );
}
