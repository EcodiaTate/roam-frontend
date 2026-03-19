// src/app/(app)/places/loading.tsx
// Skeleton shell matching the Places split map/list layout.

export default function PlacesLoading() {
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
      {/* ── Map area (45% in split mode) ───────────────────────── */}
      <div
        style={{
          flex: "0 0 45%",
          minHeight: 0,
          overflow: "hidden",
          position: "relative",
          background: "var(--surface-muted)",
          animation: "places-skel-pulse 1.6s ease-in-out infinite",
        }}
      />

      {/* ── List area ──────────────────────────────────────────── */}
      <div
        style={{
          flex: 1,
          minHeight: 0,
          overflow: "hidden",
          borderTop: "1px solid var(--roam-border)",
          padding: "12px 16px",
          display: "flex",
          flexDirection: "column",
          gap: 10,
        }}
      >
        {/* Place rows */}
        {[0, 1, 2, 3].map((i) => (
          <div
            key={i}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              padding: "10px 12px",
              borderRadius: "var(--r-card, 16px)",
              background: "var(--roam-surface)",
              animation: `places-skel-pulse 1.6s ease-in-out infinite ${0.05 + i * 0.08}s`,
            }}
          >
            {/* Map pin icon placeholder */}
            <div
              style={{
                width: 36,
                height: 36,
                borderRadius: 12,
                background: "var(--roam-surface-hover)",
                flexShrink: 0,
              }}
            />
            <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 6 }}>
              <div
                style={{
                  height: 14,
                  borderRadius: 6,
                  background: "var(--roam-surface-hover)",
                  width: i % 2 === 0 ? "55%" : "70%",
                }}
              />
              <div
                style={{
                  height: 11,
                  borderRadius: 6,
                  background: "var(--roam-surface-hover)",
                  width: "40%",
                }}
              />
            </div>
          </div>
        ))}
      </div>

      <style>{`
        @keyframes places-skel-pulse {
          0%, 100% { opacity: 0.45; }
          50%       { opacity: 0.85; }
        }
      `}</style>
    </div>
  );
}
