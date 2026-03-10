// src/components/nav/StartNavigationButton.tsx
"use client";

import { useState } from "react";
import { Navigation, Loader2 } from "lucide-react";
import { haptic } from "@/lib/native/haptics";

type Props = {
  onStart: () => Promise<void>;
  disabled?: boolean;
};

export function StartNavigationButton({ onStart, disabled }: Props) {
  const [loading, setLoading] = useState(false);

  const handlePress = async () => {
    if (loading || disabled) return;
    haptic.heavy();
    setLoading(true);
    try {
      await onStart();
    } catch (e) {
      console.error("[StartNav] failed:", e);
    } finally {
      setLoading(false);
    }
  };

  return (
    <button
      type="button"
      onClick={handlePress}
      disabled={loading || disabled}
      style={{
        width: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 10,
        padding: "14px 24px",
        border: "none",
        borderRadius: 16,
        cursor: loading || disabled ? "default" : "pointer",
        fontSize: 16,
        fontWeight: 950,
        letterSpacing: "-0.3px",
        color: "white",
        background: loading || disabled
          ? "var(--accent-tint)"
          : "linear-gradient(135deg, var(--brand-eucalypt), var(--brand-eucalypt-dark))",
        boxShadow: loading || disabled
          ? "none"
          : "0 4px 16px rgba(51,120,74,0.35), 0 1px 4px rgba(0,0,0,0.1)",
        transition: "all 0.2s ease",
        opacity: disabled ? 0.5 : 1,
      }}
      onPointerDown={(e) => {
        if (!loading && !disabled) {
          (e.currentTarget as HTMLElement).style.transform = "scale(0.97)";
        }
      }}
      onPointerUp={(e) => {
        (e.currentTarget as HTMLElement).style.transform = "scale(1)";
      }}
      onPointerCancel={(e) => {
        (e.currentTarget as HTMLElement).style.transform = "scale(1)";
      }}
    >
      {loading ? (
        <Loader2 size={20} style={{ animation: "roam-spin 0.6s linear infinite" }} />
      ) : (
        <Navigation size={20} />
      )}
      {loading ? "Starting…" : "Start Navigation"}
    </button>
  );
}