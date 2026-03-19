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

      {/* ── Map layers button (top-right) - matches TripMap ── */}
      <div style={{
        position: "absolute",
        top: "calc(env(safe-area-inset-top, 0px) + 56px)",
        right: 12,
        zIndex: 25,
      }}>
        <Skel w={46} h={46} r={16} delay={0.1} style={{
          background: "linear-gradient(160deg, rgba(26,21,16,0.96) 0%, rgba(16,13,10,0.98) 100%)",
        }} />
      </div>

      {/* ── Side FAB stack (Exchange + Report) - matches ClientPage ── */}
      <div style={{
        position: "absolute",
        bottom: "calc(220px + var(--roam-safe-bottom, 0px) + 24px)",
        right: 12,
        zIndex: 18,
        display: "flex",
        flexDirection: "column",
        gap: 8,
        alignItems: "flex-end",
      }}>
        <Skel w={46} h={46} r={16} delay={0.25} style={{
          background: "linear-gradient(160deg, rgba(26,21,16,0.96) 0%, rgba(16,13,10,0.98) 100%)",
        }} />
        <Skel w={46} h={46} r={16} delay={0.3} style={{
          background: "linear-gradient(160deg, rgba(26,21,16,0.96) 0%, rgba(16,13,10,0.98) 100%)",
        }} />
      </div>

      {/* ── Bottom sheet - collapsed position matching ClientPage peek ── */}
      <div
        className="trip-bottom-sheet"
        style={{
          position: "absolute",
          bottom: -200, left: 0, right: 0,
          height: "calc(100% - 80px + 200px)",
          zIndex: 20,
          transform: "translateY(calc(100% - 420px - var(--roam-safe-bottom, 0px)))",
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
                <Skel key={i} w={40} h={40} r={10} delay={0.1 + i * 0.05} style={{
                  background: "var(--roam-text, #1a1613)",
                  opacity: 0.25,
                }} />
              ))}
              {/* Upgrade button - eucalypt green gradient */}
              <div
                style={{
                  width: 64,
                  height: 40,
                  borderRadius: 10,
                  background: "linear-gradient(135deg, #122d1e 0%, var(--brand-eucalypt-dark, #1f5236) 40%, var(--brand-eucalypt, #2d6e40) 80%, #3d8f54 100%)",
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
