// src/components/ui/UnstyledButton.tsx
import React from "react";

const resetStyle: React.CSSProperties = {
  all: "unset",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  cursor: "pointer",
  WebkitTapHighlightColor: "transparent",
};

/**
 * A fully unstyled `<button>` with sensible resets.
 * Replaces the repeated inline `{ all: "unset", display: "flex", ... }` pattern.
 */
export const UnstyledButton = React.forwardRef<
  HTMLButtonElement,
  React.ButtonHTMLAttributes<HTMLButtonElement>
>(({ style, type = "button", ...props }, ref) => (
  <button ref={ref} type={type} style={{ ...resetStyle, ...style }} {...props} />
));

UnstyledButton.displayName = "UnstyledButton";
