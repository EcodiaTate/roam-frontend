// src/components/ui/Select.tsx
// Themed select dropdown with large touch target for in-vehicle use.
// Styled to match Input component with the same container pattern.

import { forwardRef, type SelectHTMLAttributes, type ReactNode } from "react";

interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  /** Leading icon */
  icon?: ReactNode;
  /** Error state — adds danger border */
  error?: boolean;
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(
  ({ icon, error, children, style, className, ...props }, ref) => (
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
        position: "relative",
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
      <select
        ref={ref}
        style={{
          flex: 1,
          background: "transparent",
          border: "none",
          outline: "none",
          fontSize: "var(--font-body)",
          fontWeight: 800,
          color: "var(--roam-text)",
          padding: "14px 0",
          cursor: "pointer",
          appearance: "none",
          minWidth: 0,
        }}
        {...props}
      >
        {children}
      </select>
      {/* Chevron indicator */}
      <svg
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="var(--roam-text-muted)"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        style={{ flexShrink: 0 }}
      >
        <path d="m6 9 6 6 6-6" />
      </svg>
    </div>
  ),
);

Select.displayName = "Select";
