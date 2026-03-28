// src/components/ui/FAB.tsx
// Contextual floating action button with haptic feedback.
// Sits above the bottom tab bar, accounts for safe-area-inset-bottom.

import { forwardRef, type ButtonHTMLAttributes } from "react";
import { haptic } from "@/lib/native/haptics";

type FABVariant = "primary" | "danger" | "eucalypt";

interface FABProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children"> {
  /** Material Symbols Outlined icon name */
  icon: string;
  variant?: FABVariant;
  /** Optional tooltip/label text below the icon */
  label?: string;
}

const variantBg: Record<FABVariant, string> = {
  primary: "var(--cta-gradient)",
  danger: "linear-gradient(135deg, var(--roam-danger), var(--roam-danger))",
  eucalypt: "linear-gradient(135deg, var(--brand-eucalypt-dark), var(--brand-eucalypt))",
};

export const FAB = forwardRef<HTMLButtonElement, FABProps>(
  ({ icon, variant = "primary", label, onClick, style, ...props }, ref) => {
    return (
      <div
        style={{
          position: "fixed",
          bottom: "calc(var(--bottom-nav-height) + 16px)",
          right: 24,
          zIndex: 100,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 6,
          // Shift right slightly so it doesn't overlap center trip tab
          pointerEvents: "none",
        }}
      >
        <button
          ref={ref}
          type="button"
          onClick={(e) => {
            haptic.medium();
            onClick?.(e);
          }}
          style={{
            width: 64,
            height: 64,
            borderRadius: 20,
            background: variantBg[variant],
            border: "4px solid var(--roam-bg)",
            boxShadow: "var(--shadow-heavy)",
            color: "var(--on-color)",
            display: "grid",
            placeItems: "center",
            cursor: "pointer",
            touchAction: "manipulation",
            WebkitTapHighlightColor: "transparent",
            transition: "transform 150ms var(--ease-out), box-shadow 150ms var(--ease-out)",
            pointerEvents: "auto",
            ...style,
          }}
          className="roam-fab-press"
          {...props}
        >
          <span
            className="material-symbols-outlined"
            style={{ fontSize: 30, lineHeight: 1 }}
          >
            {icon}
          </span>
        </button>

        {label && (
          <span
            style={{
              fontSize: 10,
              fontWeight: 800,
              textTransform: "uppercase",
              letterSpacing: "0.05em",
              color: "var(--roam-text-muted)",
              textAlign: "center",
              whiteSpace: "nowrap",
              pointerEvents: "none",
            }}
          >
            {label}
          </span>
        )}
      </div>
    );
  },
);

FAB.displayName = "FAB";
