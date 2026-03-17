// src/components/nav/NavModeOverlay.tsx
// Cinematic "nav mode activated" wrapper.
// When `active` flips true → plays a full-screen flash + vignette-in animation
// that frames the entire nav UI as it appears. Individual child components
// carry their own staggered entry classes (nav-hud-enter, nav-bar-enter, etc.).
"use client";

import { useEffect, useRef, useState } from "react";

type Props = {
  active: boolean;
  children: React.ReactNode;
};

export function NavModeOverlay({ active, children }: Props) {
  // Track the previous active value to detect rising edge
  const prevActiveRef = useRef(false);

  // Phase: idle → flash → vignette → done
  const [flash, setFlash] = useState(false);
  const [vignette, setVignette] = useState(false);

  useEffect(() => {
    const wasActive = prevActiveRef.current;
    prevActiveRef.current = active;

    if (active && !wasActive) {
      // Rising edge — start the cinematic sequence
      setFlash(true);
      setVignette(false);

      // Flash on → off (brief)
      const t1 = setTimeout(() => setFlash(false), 220);
      // Then vignette fades in and persists while nav is active
      const t2 = setTimeout(() => setVignette(true), 80);
      return () => {
        clearTimeout(t1);
        clearTimeout(t2);
      };
    }

    if (!active && wasActive) {
      // Falling edge — fade vignette out
      setVignette(false);
      setFlash(false);
    }
  }, [active]);

  return (
    <>
      {/* ── Full-screen flash on nav mode entry ── */}
      {flash && (
        <div
          aria-hidden="true"
          style={{
            position: "absolute",
            inset: 0,
            zIndex: 60,
            pointerEvents: "none",
            background: "radial-gradient(ellipse at center, rgba(45,110,64,0.22) 0%, rgba(26,111,166,0.12) 50%, transparent 80%)",
            animation: "nav-mode-flash 220ms cubic-bezier(0.4,0,1,1) forwards",
          }}
        />
      )}

      {/* ── Persistent edge vignette (map-nav feel) ── */}
      <div
        aria-hidden="true"
        style={{
          position: "absolute",
          inset: 0,
          zIndex: 20,
          pointerEvents: "none",
          // Warm dark vignette on all edges so UI cards pop
          background:
            "radial-gradient(ellipse 120% 120% at 50% 50%, transparent 52%, rgba(8,6,4,0.35) 100%)",
          opacity: vignette ? 1 : 0,
          transition: "opacity 0.55s cubic-bezier(0.25,0.46,0.45,0.94)",
        }}
      />

      {/* ── Nav UI children ── */}
      {children}

      {/* ── Keyframes (scoped inline so they don't pollute globals) ── */}
      <style>{`
        @keyframes nav-mode-flash {
          0%   { opacity: 0; }
          30%  { opacity: 1; }
          100% { opacity: 0; }
        }
      `}</style>
    </>
  );
}
