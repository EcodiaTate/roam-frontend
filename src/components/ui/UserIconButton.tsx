"use client";

import { useRouter } from "next/navigation";
import { UserRound } from "lucide-react";
import { haptic } from "@/lib/native/haptics";

export function UserIconButton() {
  const router = useRouter();

  return (
    <button
      type="button"
      className="trip-interactive trip-btn-icon"
      aria-label="Account"
      title="Account"
      onClick={() => {
        haptic.selection();
        router.push("/login");
      }}
      style={{
        width: 42,
        height: 42,
        borderRadius: 999,
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        background: "var(--roam-surface)",
        color: "var(--roam-text)",
        border: "1px solid var(--roam-border)",
        boxShadow: "var(--shadow-soft)",
      }}
    >
      <UserRound size={18} />
    </button>
  );
}
