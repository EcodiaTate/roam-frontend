// src/app/(app)/live/loading.tsx
// Skeleton shell for the Live "Go Now" page - matches map + bottom sheet layout.

export default function LiveLoading() {
  return (
    <div className="trip-app-container">
      {/* Map placeholder */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          zIndex: 1,
          background: "var(--surface-muted)",
          animation: "live-skel-pulse 1.6s ease-in-out infinite",
        }}
      />

      {/* Bottom sheet - peek position */}
      <div
        className="trip-bottom-sheet"
        style={{
          position: "absolute",
          bottom: -200,
          left: 0,
          right: 0,
          height: "calc(100% - 80px + 200px)",
          zIndex: 20,
          transform: "translateY(calc(100% - 420px - var(--roam-safe-bottom, 0px)))",
        }}
      >
        {/* Drag handle */}
        <div style={{ padding: "16px 20px 6px", touchAction: "none" }}>
          <div className="trip-drag-handle" />
        </div>

        {/* Header: "Live Trip" title + green badge */}
        <div style={{ padding: "0 20px 14px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div
              style={{
                height: 22,
                width: 100,
                borderRadius: 8,
                background: "var(--roam-surface-hover)",
                animation: "live-skel-pulse 1.6s ease-in-out infinite 0.05s",
              }}
            />
            <div
              style={{
                height: 20,
                width: 44,
                borderRadius: 999,
                background: "var(--brand-eucalypt, #2d6e40)",
                opacity: 0.35,
                animation: "live-skel-pulse 1.6s ease-in-out infinite 0.1s",
              }}
            />
          </div>
          <div
            style={{
              marginTop: 4,
              height: 12,
              width: 200,
              borderRadius: 6,
              background: "var(--roam-surface-hover)",
              animation: "live-skel-pulse 1.6s ease-in-out infinite 0.12s",
            }}
          />
        </div>

        {/* Start navigation button placeholder */}
        <div style={{ padding: "0 20px" }}>
          <div
            style={{
              width: "100%",
              height: 48,
              borderRadius: 14,
              background: "var(--roam-surface-hover)",
              animation: "live-skel-pulse 1.6s ease-in-out infinite 0.15s",
            }}
          />
        </div>
      </div>

      <style>{`
        @keyframes live-skel-pulse {
          0%, 100% { opacity: 0.45; }
          50%       { opacity: 0.85; }
        }
      `}</style>
    </div>
  );
}
