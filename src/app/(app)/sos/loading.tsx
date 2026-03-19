// src/app/(app)/sos/loading.tsx
// Skeleton shell that mirrors the real SOS page layout while ClientPage hydrates.

export default function SosLoading() {
  return (
    <div className="sos-page roam-scroll">
      {/* CALL 000 button skeleton */}
      <div
        style={{
          width: "100%",
          height: 120,
          borderRadius: "var(--r-btn)",
          background: "var(--roam-danger)",
          opacity: 0.35,
          animation: "sos-skel-pulse 1.6s ease-in-out infinite",
        }}
      />

      {/* Location block skeleton */}
      <div
        className="sos-location-block"
        style={{ minHeight: 100, justifyContent: "center", gap: 10 }}
      >
        {/* Label line */}
        <div
          style={{
            width: 160,
            height: 13,
            borderRadius: 6,
            background: "var(--roam-surface-hover)",
            animation: "sos-skel-pulse 1.6s ease-in-out infinite",
          }}
        />
        {/* Value line */}
        <div
          style={{
            width: 240,
            height: 22,
            borderRadius: 8,
            background: "var(--roam-surface-hover)",
            animation: "sos-skel-pulse 1.6s ease-in-out infinite 0.15s",
          }}
        />
      </div>

      {/* MESSAGE CONTACTS button skeleton */}
      <div
        style={{
          width: "100%",
          height: 88,
          borderRadius: "var(--r-btn)",
          background: "var(--roam-info)",
          opacity: 0.3,
          animation: "sos-skel-pulse 1.6s ease-in-out infinite 0.1s",
        }}
      />

      {/* "Contacts" section title */}
      <div
        style={{
          width: 110,
          height: 22,
          borderRadius: 8,
          background: "var(--roam-surface-hover)",
          animation: "sos-skel-pulse 1.6s ease-in-out infinite 0.2s",
        }}
      />

      {/* Add Contact button skeleton */}
      <div
        style={{
          width: "100%",
          height: 64,
          borderRadius: "var(--r-btn)",
          background: "var(--roam-surface-hover)",
          animation: "sos-skel-pulse 1.6s ease-in-out infinite 0.25s",
        }}
      />

      {/* Placeholder contact cards */}
      {[0, 1].map((i) => (
        <div
          key={i}
          style={{
            padding: 16,
            borderRadius: "var(--r-card)",
            background: "var(--roam-surface)",
            display: "flex",
            flexDirection: "column",
            gap: 12,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            {/* Avatar circle */}
            <div
              style={{
                width: 48,
                height: 48,
                borderRadius: "50%",
                background: "var(--roam-surface-hover)",
                flexShrink: 0,
                animation: `sos-skel-pulse 1.6s ease-in-out infinite ${i * 0.12}s`,
              }}
            />
            <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 8 }}>
              <div
                style={{
                  height: 20,
                  borderRadius: 8,
                  background: "var(--roam-surface-hover)",
                  width: "60%",
                  animation: `sos-skel-pulse 1.6s ease-in-out infinite ${0.1 + i * 0.12}s`,
                }}
              />
              <div
                style={{
                  height: 14,
                  borderRadius: 6,
                  background: "var(--roam-surface-hover)",
                  width: "80%",
                  animation: `sos-skel-pulse 1.6s ease-in-out infinite ${0.2 + i * 0.12}s`,
                }}
              />
            </div>
          </div>

          {/* Action grid (2×2: Call, Text, Edit, Delete) */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            {[
              { bg: "var(--roam-accent)", delay: 0.3 },
              { bg: "var(--roam-info)", delay: 0.34 },
              { bg: "var(--roam-surface-hover)", delay: 0.38 },
              { bg: "var(--roam-surface-hover)", delay: 0.42 },
            ].map((btn, j) => (
              <div
                key={j}
                style={{
                  height: 52,
                  borderRadius: "var(--r-btn)",
                  background: btn.bg,
                  opacity: 0.35,
                  animation: `sos-skel-pulse 1.6s ease-in-out infinite ${btn.delay + i * 0.08}s`,
                }}
              />
            ))}
          </div>
        </div>
      ))}

      <style>{`
        @keyframes sos-skel-pulse {
          0%, 100% { opacity: 0.5; }
          50%       { opacity: 1; }
        }
      `}</style>
    </div>
  );
}
