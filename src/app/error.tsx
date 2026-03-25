import { useEffect } from "react";
import { haptic } from "@/lib/native/haptics";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[Roam] Unhandled error:", error);
  }, [error]);

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        minHeight: "100dvh",
        padding: 24,
        background: "var(--bg-sand, #f4efe6)",
        color: "var(--roam-text, #1a1612)",
        fontFamily:
          '-apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif',
        textAlign: "center",
        gap: 16,
      }}
    >
      <div style={{ fontSize: 48 }}>!</div>
      <h1 style={{ fontSize: 20, fontWeight: 800, margin: 0 }}>
        Something went wrong
      </h1>
      <p
        style={{
          fontSize: 14,
          fontWeight: 600,
          color: "var(--roam-text-muted, #6b5a4e)",
          maxWidth: 320,
          lineHeight: 1.5,
          margin: 0,
        }}
      >
        Roam hit an unexpected error. Try again, or restart the app if it
        persists.
      </p>
      <button
        onClick={() => { haptic.tap(); reset(); }}
        type="button"
        style={{
          marginTop: 8,
          padding: "14px 32px",
          borderRadius: 14,
          border: "none",
          background: "var(--roam-accent, #42b159)",
          color: "#fff",
          fontSize: 14,
          fontWeight: 800,
          cursor: "pointer",
          WebkitTapHighlightColor: "transparent",
        }}
      >
        Try again
      </button>
    </div>
  );
}
