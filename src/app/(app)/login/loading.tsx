// src/app/(app)/login/loading.tsx
// Skeleton for the login/signup page - centered card layout.

export default function LoginLoading() {
  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        bottom: "var(--bottom-nav-height, 80px)",
        overflowY: "auto",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: "12px 20px",
        background: "var(--roam-bg)",
      }}
    >
      <div
        className="trip-card"
        style={{
          width: "100%",
          maxWidth: 400,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 16,
          padding: 24,
        }}
      >
        {/* App icon */}
        <div
          style={{
            width: 56,
            height: 56,
            borderRadius: 14,
            background: "var(--roam-surface-hover)",
            animation: "login-skel-pulse 1.6s ease-in-out infinite",
          }}
        />

        {/* Heading */}
        <div
          style={{
            width: 140,
            height: 22,
            borderRadius: 8,
            background: "var(--roam-surface-hover)",
            animation: "login-skel-pulse 1.6s ease-in-out infinite 0.05s",
          }}
        />

        {/* Subheading */}
        <div
          style={{
            width: 220,
            height: 14,
            borderRadius: 6,
            background: "var(--roam-surface-hover)",
            animation: "login-skel-pulse 1.6s ease-in-out infinite 0.1s",
          }}
        />

        {/* Google button */}
        <div
          style={{
            width: "100%",
            height: 48,
            borderRadius: "var(--r-btn, 12px)",
            background: "var(--roam-surface-hover)",
            animation: "login-skel-pulse 1.6s ease-in-out infinite 0.12s",
          }}
        />

        {/* Divider */}
        <div style={{ display: "flex", alignItems: "center", gap: 12, width: "100%" }}>
          <div style={{ flex: 1, height: 1, background: "var(--roam-border)" }} />
          <div
            style={{
              width: 20,
              height: 12,
              borderRadius: 4,
              background: "var(--roam-surface-hover)",
              animation: "login-skel-pulse 1.6s ease-in-out infinite 0.15s",
            }}
          />
          <div style={{ flex: 1, height: 1, background: "var(--roam-border)" }} />
        </div>

        {/* Email input */}
        <div
          style={{
            width: "100%",
            height: 48,
            borderRadius: "var(--r-btn, 12px)",
            background: "var(--roam-surface-hover)",
            animation: "login-skel-pulse 1.6s ease-in-out infinite 0.18s",
          }}
        />

        {/* Password input */}
        <div
          style={{
            width: "100%",
            height: 48,
            borderRadius: "var(--r-btn, 12px)",
            background: "var(--roam-surface-hover)",
            animation: "login-skel-pulse 1.6s ease-in-out infinite 0.22s",
          }}
        />

        {/* Submit button */}
        <div
          style={{
            width: "100%",
            height: 48,
            borderRadius: "var(--r-btn, 12px)",
            background: "var(--roam-surface-hover)",
            animation: "login-skel-pulse 1.6s ease-in-out infinite 0.26s",
          }}
        />

        {/* Mode toggle */}
        <div
          style={{
            width: 200,
            height: 14,
            borderRadius: 6,
            background: "var(--roam-surface-hover)",
            animation: "login-skel-pulse 1.6s ease-in-out infinite 0.3s",
          }}
        />
      </div>

      <style>{`
        @keyframes login-skel-pulse {
          0%, 100% { opacity: 0.45; }
          50%       { opacity: 0.85; }
        }
      `}</style>
    </div>
  );
}
