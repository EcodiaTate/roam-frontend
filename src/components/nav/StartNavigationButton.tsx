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
    // Immediate visual + haptic feedback before async work
    setLoading(true);
    haptic.heavy();
    try {
      await onStart();
      // Keep loading=true — the caller navigates away on success
    } catch (e) {
      console.error("[StartNav] failed:", e);
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
        gap: 8,
        padding: "15px 24px",
        border: loading || disabled ? "1px solid transparent" : "1px solid rgba(45,110,64,0.4)",
        borderRadius: 16,
        cursor: loading || disabled ? "default" : "pointer",
        fontSize: 15,
        fontWeight: 950,
        letterSpacing: "-0.2px",
        color: "var(--on-color)",
        background: loading || disabled
          ? "rgba(45,110,64,0.35)"
          : "linear-gradient(160deg, var(--brand-eucalypt) 0%, var(--brand-eucalypt-dark) 100%)",
        boxShadow: loading || disabled
          ? "none"
          : "0 4px 20px rgba(45,110,64,0.35), 0 1px 4px rgba(0,0,0,0.15), inset 0 1px 0 rgba(255,255,255,0.12)",
        transition: "all 0.2s ease",
        opacity: disabled ? 0.55 : 1,
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