// src/components/ui/Input.tsx
// Themed text input with large touch target for in-vehicle use.
// Wraps in a container with icon slot, matching the existing trip-search-box pattern.

import { forwardRef, type InputHTMLAttributes, type ReactNode } from "react";

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  /** Leading icon (e.g., Search, MapPin) */
  icon?: ReactNode;
  /** Trailing action element (e.g., clear button) */
  trailing?: ReactNode;
  /** Error state — adds danger border */
  error?: boolean;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ icon, trailing, error, style, className, ...props }, ref) => (
    <div
      className={className}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        background: "var(--surface-muted)",
        borderRadius: "var(--r-btn)",
        border: error
          ? "2px solid var(--roam-danger)"
          : "2px solid var(--roam-border)",
        padding: "0 var(--space-lg)",
        minHeight: 52,
        transition: "border-color 200ms var(--ease-out)",
        ...style,
      }}
    >
      {icon && (
        <span
          style={{
            color: "var(--roam-text-muted)",
            display: "flex",
            flexShrink: 0,
          }}
        >
          {icon}
        </span>
      )}
      <input
        ref={ref}
        style={{
          flex: 1,
          background: "transparent",
          border: "none",
          outline: "none",
          fontSize: "var(--font-body)",
          fontWeight: 700,
          color: "var(--roam-text)",
          padding: "14px 0",
          minWidth: 0,
        }}
        {...props}
      />
      {trailing && (
        <span style={{ display: "flex", flexShrink: 0 }}>{trailing}</span>
      )}
    </div>
  ),
);

Input.displayName = "Input";
