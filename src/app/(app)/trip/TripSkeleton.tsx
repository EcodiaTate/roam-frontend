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

      {/* ── Bottom sheet — collapsed position matching ClientPage peek ── */}
      <div
        className="trip-bottom-sheet"
        style={{
          position: "absolute",
          bottom: 0,
          left: 0,
          right: 0,
          height: "calc(100% - 80px)",
          zIndex: 20,
          transform: "translateY(calc(100% - 220px - var(--roam-safe-bottom, 0px)))",
        }}
      >
        {/* Drag handle */}
        <div style={{ padding: "16px 20px 6px", touchAction: "none" }}>
          <div className="trip-drag-handle" />
        </div>

        {/* Header: title + icon buttons */}
        <div style={{ padding: "0 20px 14px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
            <Skel w={160} h={18} r={8} delay={0.05} />

            <div style={{ display: "flex", gap: 4, flexShrink: 0 }}>
              {[0, 1, 2].map((i) => (
                <Skel key={i} w={32} h={32} r={10} delay={0.1 + i * 0.05} />
              ))}
              {/* Ochre account/upgrade button */}
              <div
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: 10,
                  background: "var(--brand-ochre, #b5452e)",
                  opacity: 0.35,
                  animation: "trip-skel-pulse 1.6s ease-in-out infinite 0.2s",
                  flexShrink: 0,
                }}
              />
            </div>
          </div>
        </div>

        {/* Start navigation button placeholder */}
        <div style={{ padding: "0 20px" }}>
          <Skel w="100%" h={48} r={14} delay={0.15} />
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
