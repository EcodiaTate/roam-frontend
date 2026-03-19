// src/components/nav/NavModeOverlay.tsx
// Cinematic "nav mode activated" wrapper.
// Rising edge → full-screen ochre/eucalypt flash + warm vignette fade-in.
// Individual child components carry their own staggered entry classes.
"use client";

import { useEffect, useRef, useState } from "react";

type Props = {
  active: boolean;
  children: React.ReactNode;
};

export function NavModeOverlay({ active, children }: Props) {
  const prevActiveRef = useRef(false);
  const [flash, setFlash] = useState(false);
  const [vignette, setVignette] = useState(false);

  useEffect(() => {
    const wasActive = prevActiveRef.current;
    prevActiveRef.current = active;

    if (active && !wasActive) {
      setFlash(true);
      setVignette(false);
      const t1 = setTimeout(() => setFlash(false), 280);
      const t2 = setTimeout(() => setVignette(true), 60);
      return () => { clearTimeout(t1); clearTimeout(t2); };
    }

    if (!active && wasActive) {
      setVignette(false);
      setFlash(false);
    }
  }, [active]);

  return (
    <>
      {/* ── Full-screen flash — warm ochre/eucalypt burst ── */}
      {flash && (
        <div
          aria-hidden="true"
          style={{
            position: "absolute",
            inset: 0,
            zIndex: 60,
            pointerEvents: "none",
            background:
              "radial-gradient(ellipse 80% 80% at 50% 50%, rgba(45,110,64,0.20) 0%, rgba(184,135,42,0.10) 40%, transparent 75%)",
            animation: "nav-mode-flash 280ms cubic-bezier(0.4,0,1,1) forwards",
          }}
        />
      )}

      {/* ── Persistent warm vignette ── */}
      <div
        aria-hidden="true"
        style={{
          position: "absolute",
          inset: 0,
          zIndex: 20,
          pointerEvents: "none",
          background:
            "radial-gradient(ellipse 115% 115% at 50% 50%, transparent 48%, rgba(8,6,4,0.40) 100%)",
          opacity: vignette ? 1 : 0,
          transition: "opacity 0.65s cubic-bezier(0.25,0.46,0.45,0.94)",
        }}
      />

      {children}

      <style>{`
        @keyframes nav-mode-flash {
          0%   { opacity: 0; }
          25%  { opacity: 1; }
          100% { opacity: 0; }
        }
      `}</style>
    </>
  );
}
