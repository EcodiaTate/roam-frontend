// src/app/(app)/untethered/loading.tsx
// Skeleton for the Roam Untethered paywall/marketing page.

export default function UntetheredLoading() {
  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        bottom: "var(--bottom-nav-height, 80px)",
        overflowY: "auto",
        WebkitOverflowScrolling: "touch",
        background: "var(--roam-bg)",
      }}
    >
      {/* Hero gradient section */}
      <div
        style={{
          position: "relative",
          minHeight: 320,
          background: "linear-gradient(165deg, #7a2e1a 0%, #b5452e 35%, #d98a5c 70%, #e8b67a 100%)",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          padding: "60px 24px 48px",
          gap: 16,
          overflow: "hidden",
        }}
      >
        {/* Badge placeholder */}
        <div
          style={{
            width: 180,
            height: 28,
            borderRadius: 999,
            background: "rgba(255,255,255,0.15)",
            animation: "unt-skel-pulse 1.6s ease-in-out infinite 0.05s",
          }}
        />
        {/* Headline placeholder */}
        <div
          style={{
            width: 260,
            height: 34,
            borderRadius: 10,
            background: "rgba(255,255,255,0.15)",
            animation: "unt-skel-pulse 1.6s ease-in-out infinite 0.1s",
          }}
        />
        {/* Subheadline */}
        <div
          style={{
            width: 220,
            height: 14,
            borderRadius: 6,
            background: "rgba(255,255,255,0.12)",
            animation: "unt-skel-pulse 1.6s ease-in-out infinite 0.15s",
          }}
        />
      </div>

      {/* Feature cards */}
      <div style={{ padding: "24px 20px", display: "flex", flexDirection: "column", gap: 12 }}>
        {[0, 1, 2, 3, 4].map((i) => (
          <div
            key={i}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 14,
              padding: "14px 16px",
              borderRadius: "var(--r-card, 16px)",
              background: "var(--roam-surface)",
              animation: `unt-skel-pulse 1.6s ease-in-out infinite ${0.1 + i * 0.06}s`,
            }}
          >
            <div
              style={{
                width: 44,
                height: 44,
                borderRadius: 12,
                background: "var(--roam-surface-hover)",
                flexShrink: 0,
              }}
            />
            <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 6 }}>
              <div style={{ height: 14, borderRadius: 6, background: "var(--roam-surface-hover)", width: "50%" }} />
              <div style={{ height: 11, borderRadius: 6, background: "var(--roam-surface-hover)", width: "80%" }} />
            </div>
          </div>
        ))}

        {/* CTA button placeholder */}
        <div
          style={{
            marginTop: 8,
            width: "100%",
            height: 56,
            borderRadius: 16,
            background: "linear-gradient(135deg, #b5452e 0%, #d98a5c 100%)",
            opacity: 0.3,
            animation: "unt-skel-pulse 1.6s ease-in-out infinite 0.3s",
          }}
        />
      </div>

      <style>{`
        @keyframes unt-skel-pulse {
          0%, 100% { opacity: 0.45; }
          50%       { opacity: 0.85; }
        }
      `}</style>
    </div>
  );
}
