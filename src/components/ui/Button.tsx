// src/components/ui/Button.tsx
// Core reusable button with Terra Nomad design tokens.
// Variants: primary (Burnt Ochre fill), secondary (Eucalypt), danger, ghost.
// All variants: thick borders, scale-down 95% + brightness shift on active, 200ms transitions.
// Min 52px height for in-vehicle tactility.

import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";
import { haptic } from "@/lib/native/haptics";

type ButtonVariant = "primary" | "secondary" | "danger" | "ghost";
type ButtonSize = "default" | "sm" | "icon";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: ReactNode;
  loading?: boolean;
}

const variantStyles: Record<ButtonVariant, React.CSSProperties> = {
  primary: {
    background: "var(--cta-gradient)",
    color: "var(--on-color)",
    border: "none",
  },
  secondary: {
    background: "var(--roam-accent)",
    color: "var(--on-color)",
    border: "none",
  },
  danger: {
    background: "var(--roam-surface-hover)",
    color: "var(--roam-danger)",
    border: "2.5px solid var(--roam-border-strong)",
  },
  ghost: {
    background: "transparent",
    color: "var(--roam-text)",
    border: "2.5px solid var(--roam-border-strong)",
  },
};

const sizeStyles: Record<ButtonSize, React.CSSProperties> = {
  default: {
    padding: "14px 20px",
    fontSize: "var(--font-body)",
    minHeight: 52,
    borderRadius: "var(--r-btn)",
    width: "100%",
  },
  sm: {
    padding: "10px 16px",
    fontSize: "var(--font-sm)",
    minHeight: 44,
    borderRadius: "var(--r-btn)",
  },
  icon: {
    padding: 0,
    fontSize: "1.1rem",
    minHeight: 48,
    minWidth: 48,
    width: 48,
    height: 48,
    borderRadius: "var(--r-btn)",
  },
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      variant = "primary",
      size = "default",
      icon,
      loading,
      disabled,
      children,
      style,
      onClick,
      ...props
    },
    ref,
  ) => {
    const isDisabled = disabled || loading;

    return (
      <button
        ref={ref}
        type="button"
        disabled={isDisabled}
        onClick={(e) => {
          if (!isDisabled) {
            haptic.selection();
            onClick?.(e);
          }
        }}
        style={{
          // Layout
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 8,
          fontWeight: 800,
          letterSpacing: "-0.1px",
          lineHeight: 1,
          cursor: isDisabled ? "default" : "pointer",
          userSelect: "none",
          boxShadow: "var(--shadow-button)",
          // Transitions — 200ms as specified
          transition: [
            "transform 200ms var(--ease-out)",
            "filter 200ms var(--ease-out)",
            "box-shadow 200ms var(--ease-out)",
            "opacity 200ms var(--ease-out)",
          ].join(", "),
          // Touch
          touchAction: "manipulation",
          WebkitTapHighlightColor: "transparent",
          // Disabled
          ...(isDisabled
            ? { opacity: 0.45, pointerEvents: "none" as const, boxShadow: "none" }
            : {}),
          // Variant + size
          ...variantStyles[variant],
          ...sizeStyles[size],
          // Overrides
          ...style,
        }}
        // Active state via CSS — scale-down 95% + brightness shift
        className="roam-btn-press"
        {...props}
      >
        {loading ? (
          <span
            style={{
              width: 18,
              height: 18,
              border: "2.5px solid currentColor",
              borderTopColor: "transparent",
              borderRadius: "50%",
              animation: "spin 0.6s linear infinite",
            }}
          />
        ) : icon ? (
          icon
        ) : null}
        {children}
      </button>
    );
  },
);

Button.displayName = "Button";
