import { useEffect } from "react";
import { haptic } from "@/lib/native/haptics";

export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[Roam] App error:", error);
  }, [error]);

  return (
    <div className="trip-wrap-center">
      <div className="trip-card" style={{ gap: 16, textAlign: "center" }}>
        <div style={{ fontSize: 40, fontWeight: 800, color: "var(--roam-danger)" }}>!</div>
        <h2 style={{ fontSize: 18, fontWeight: 800, margin: 0 }}>
          Something went wrong
        </h2>
        <p className="trip-muted" style={{ fontSize: 13, lineHeight: 1.5, margin: 0 }}>
          {error.message || "An unexpected error occurred."}
        </p>
        <button
          onClick={() => { haptic.tap(); reset(); }}
          type="button"
          className="trip-btn trip-btn-primary"
        >
          Try again
        </button>
      </div>
    </div>
  );
}
