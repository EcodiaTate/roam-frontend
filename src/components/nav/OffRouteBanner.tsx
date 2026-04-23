// src/components/nav/OffRouteBanner.tsx

import { AlertTriangle, RotateCcw } from "lucide-react";
import { formatDistance } from "@/lib/nav/instructions";
import { haptic } from "@/lib/native/haptics";

type Props = {
  visible: boolean;
  distFromRoute_m: number;
  hasCorridorGraph: boolean;
  onReroute?: () => void;
};

export function OffRouteBanner({ visible, distFromRoute_m, hasCorridorGraph, onReroute }: Props) {
  if (!visible) return null;

  return (
    <div
      className="roam-nav-offroute"
      style={{
        position: "absolute",
        top: "calc(env(safe-area-inset-top, 0px) + 12px)",
        left: 12,
        right: 68,
        zIndex: 35, // above HUD
        pointerEvents: "none",
        animation: "offroute-slide-in 0.3s ease-out",
      }}
    >
      <div
        style={{
          background: "linear-gradient(135deg, #dc2626, #b91c1c)",
          borderRadius: "var(--r-card)",
          padding: "14px 16px",
          boxShadow: "0 8px 32px rgba(220,38,38,0.4), 0 2px 8px rgba(0,0,0,0.2)",
          pointerEvents: "auto",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <AlertTriangle
            size={24}
            color="white"
            style={{ flexShrink: 0, animation: "offroute-pulse 1.5s ease-in-out infinite" }}
          />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div
              style={{
                fontSize: 15,
                fontWeight: 950,
                color: "white",
                lineHeight: 1.2,
              }}
            >
              Off route
            </div>
            <div
              style={{
                fontSize: 12,
                fontWeight: 700,
                color: "rgba(255,255,255,0.75)",
                marginTop: 2,
              }}
            >
              {formatDistance(distFromRoute_m)} from planned route
            </div>
          </div>

          {hasCorridorGraph && onReroute && (
            <button
              type="button"
              onClick={() => {
                haptic.medium();
                onReroute();
              }}
              style={{
                flexShrink: 0,
                display: "flex",
                alignItems: "center",
                gap: 6,
                padding: "10px 14px",
                minHeight: 44,
                border: "none",
                borderRadius: "var(--r-card)",
                touchAction: "manipulation" as const,
                cursor: "pointer",
                fontSize: 12,
                fontWeight: 950,
                color: "var(--roam-danger)",
                background: "var(--roam-surface)",
                boxShadow: "var(--shadow-soft)",
              }}
              onPointerDown={(e) => {
                (e.currentTarget as HTMLElement).style.transform = "scale(0.95)";
              }}
              onPointerUp={(e) => {
                (e.currentTarget as HTMLElement).style.transform = "scale(1)";
              }}
              onPointerCancel={(e) => {
                (e.currentTarget as HTMLElement).style.transform = "scale(1)";
              }}
            >
              <RotateCcw size={14} />
              Reroute
            </button>
          )}
        </div>

        {!hasCorridorGraph && (
          <div
            style={{
              marginTop: 8,
              fontSize: 11,
              fontWeight: 700,
              color: "rgba(255,255,255,0.65)",
            }}
          >
            No corridor data available for rerouting. Return to your planned route.
          </div>
        )}
      </div>

      <style>{`
        @keyframes offroute-slide-in {
          from { transform: translateY(-120%); opacity: 0; }
          to { transform: translateY(0); opacity: 1; }
        }
        @keyframes offroute-pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }
      `}</style>
    </div>
  );
}