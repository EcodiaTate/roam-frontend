// src/components/share/NativeShareRenderer.tsx
// Headless component that renders a TripShareCard off-screen, captures it as a PNG,
// invokes the OS share sheet (native or Web Share API), then calls onDone.
"use client";

import { useEffect, useRef } from "react";
import { TripShareCard, type ShareCardData } from "./TripShareCard";
import { buildCardBlob, shareBlob, loadIconDataUrl } from "@/lib/share/buildCardBlob";
import { haptic } from "@/lib/native/haptics";

type Props = {
  data: ShareCardData;
  mapImageUrl?: string | null;
  tripLabel: string;
  onDone: () => void;
  onError: (msg: string) => void;
};

export function NativeShareRenderer({ data, mapImageUrl, tripLabel, onDone, onError }: Props) {
  const svgRef = useRef<SVGSVGElement | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function run() {
      const svg = svgRef.current;
      if (!svg) { onError("SVG not ready"); return; }

      try {
        const iconDataUrl = await loadIconDataUrl();
        // Re-check ref after async gap (component may have unmounted)
        if (cancelled) return;
        const liveSvg = svgRef.current;
        if (!liveSvg) { onError("SVG not ready"); return; }

        const blob = await buildCardBlob(liveSvg, mapImageUrl);
        if (cancelled) return;

        await shareBlob(blob, tripLabel, "share");
        haptic.success();
        onDone();
      } catch (e) {
        if (cancelled) return;
        haptic.error();
        onError(e instanceof Error ? e.message : "Share failed");
      }
    }

    // Give React one frame to paint the hidden SVG before capturing
    const raf = requestAnimationFrame(() => run());
    return () => { cancelled = true; cancelAnimationFrame(raf); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div
      aria-hidden="true"
      style={{
        position: "fixed",
        // Place far off-screen but still painted (visibility:hidden breaks canvas capture)
        top: 0,
        left: "-9999px",
        width: 390,
        height: 693,
        pointerEvents: "none",
        zIndex: -1,
      }}
    >
      <TripShareCard data={data} mode="card" svgRef={svgRef} hasMap={!!mapImageUrl} iconDataUrl={null} />
    </div>
  );
}
