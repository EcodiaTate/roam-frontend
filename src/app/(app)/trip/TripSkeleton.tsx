// src/app/(app)/trip/TripSkeleton.tsx
// Shared skeleton used by loading.tsx (route-level) and ClientPage.tsx (resolving/hydrating phases).

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
        animation: `trip-skel-pulse 1.6s ease-in-out infinite ${delay}s`,
        flexShrink: 0,
        ...style,
      }}
    />
  );
}

export function TripSkeleton() {
  return (
    <div className="trip-app-container">
      {/* ── Map placeholder ─────────────────────────────────────────── */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          zIndex: 1,
          background: "var(--surface-muted)",
          animation: "trip-skel-pulse 1.6s ease-in-out infinite",
        }}
      />

      {/* ── Bottom sheet ────────────────────────────────────────────── */}
      <div
        className="trip-bottom-sheet"
        style={{
          position: "absolute",
          bottom: 0,
          left: 0,
          right: 0,
          height: "calc(220px + var(--roam-safe-bottom, 0px))",
          zIndex: 20,
          display: "flex",
          flexDirection: "column",
        }}
      >
        {/* Drag handle area */}
        <div style={{ padding: "16px 20px 6px", display: "flex", justifyContent: "center" }}>
          <div className="trip-drag-handle" />
        </div>

        {/* Sheet header */}
        <div style={{ padding: "0 20px 12px", display: "flex", flexDirection: "column", gap: 12 }}>
          {/* Title row + icon buttons */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
            {/* Title */}
            <Skel w={160} h={20} r={8} delay={0.05} style={{ flex: "none" }} />

            {/* 3 icon buttons */}
            <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
              {[0, 1].map((i) => (
                <Skel key={i} w={40} h={40} r={999} delay={0.1 + i * 0.05} />
              ))}
              {/* Account button (ochre) */}
              <div
                style={{
                  width: 40,
                  height: 40,
                  borderRadius: 999,
                  background: "var(--brand-ochre, #b5452e)",
                  opacity: 0.35,
                  animation: "trip-skel-pulse 1.6s ease-in-out infinite 0.2s",
                  flexShrink: 0,
                }}
              />
            </div>
          </div>

          {/* Start navigation button */}
          <Skel w="100%" h={48} r={14} delay={0.15} />
        </div>

        {/* Stop list rows */}
        <div
          style={{
            flex: 1,
            padding: "0 20px",
            display: "flex",
            flexDirection: "column",
            gap: 10,
            overflow: "hidden",
          }}
        >
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              style={{
                borderRadius: "var(--r-card)",
                background: "var(--roam-surface-hover)",
                padding: "14px 16px",
                display: "flex",
                alignItems: "center",
                gap: 12,
                animation: `trip-skel-pulse 1.6s ease-in-out infinite ${0.1 + i * 0.08}s`,
              }}
            >
              {/* Stop number circle */}
              <div
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: 16,
                  background: "var(--roam-surface)",
                  flexShrink: 0,
                }}
              />
              <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 6 }}>
                <div
                  style={{
                    height: 16,
                    borderRadius: 6,
                    background: "var(--roam-surface)",
                    width: `${55 + (i % 3) * 12}%`,
                  }}
                />
                <div
                  style={{
                    height: 11,
                    borderRadius: 6,
                    background: "var(--roam-surface)",
                    width: `${35 + (i % 2) * 15}%`,
                  }}
                />
              </div>
            </div>
          ))}
        </div>
      </div>

      <style>{`
        @keyframes trip-skel-pulse {
          0%, 100% { opacity: 0.45; }
          50%       { opacity: 0.85; }
        }
      `}</style>
    </div>
  );
}
