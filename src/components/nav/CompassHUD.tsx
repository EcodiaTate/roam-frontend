// src/components/nav/CompassHUD.tsx

import { memo } from "react";

type Props = {
  /** Heading in degrees from north (0-360) */
  heading: number;
  /** Size variant */
  size?: "sm" | "md";
};

/** Cardinal label for a heading in degrees */
function cardinalText(deg: number): string {
  const dirs = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
  return dirs[Math.round(((deg % 360) + 360) % 360 / 45) % 8];
}

export const CompassHUD = memo(function CompassHUD({ heading, size = "sm" }: Props) {
  const isMd = size === "md";
  const outer = isMd ? 96 : 48;
  const inner = isMd ? 80 : 40;
  const cx = outer / 2;

  // Needle dimensions scale with size
  const needleLen = isMd ? 34 : 17;
  const diamondSize = isMd ? 4 : 3;

  // Cardinal label offsets from center
  const cardinalR = isMd ? 32 : 16;
  const cardinalFontSize = isMd ? 10 : 8;

  // Center text sizing
  const degFontSize = isMd ? 18 : 11;
  const cardFontSize = isMd ? 12 : 10;

  const normalHeading = ((heading % 360) + 360) % 360;

  const cardinals: { label: string; angle: number; primary: boolean }[] = [
    { label: "N", angle: 0, primary: true },
    { label: "E", angle: 90, primary: false },
    { label: "S", angle: 180, primary: false },
    { label: "W", angle: 270, primary: false },
  ];

  return (
    <div
      style={{
        width: outer,
        height: outer,
        position: "relative",
        borderRadius: "50%",
        border: "2px solid color-mix(in srgb, var(--roam-accent) 20%, transparent)",
        background: "color-mix(in srgb, var(--roam-surface) 70%, transparent)",
        backdropFilter: "blur(8px)",
        WebkitBackdropFilter: "blur(8px)",
      }}
    >
      {/* Inner ring */}
      <div
        style={{
          position: "absolute",
          inset: (outer - inner) / 2 - 2, // account for outer border
          borderRadius: "50%",
          border: "1px solid color-mix(in srgb, var(--roam-accent) 10%, transparent)",
        }}
      />

      {/* SVG overlay for cardinal labels (static - don't rotate with heading) */}
      <svg
        width={outer}
        height={outer}
        viewBox={`0 0 ${outer} ${outer}`}
        style={{ position: "absolute", inset: 0 }}
      >
        {cardinals.map(({ label, angle, primary }) => {
          const rad = ((angle - 90) * Math.PI) / 180;
          const lx = cx + Math.cos(rad) * cardinalR;
          const ly = cx + Math.sin(rad) * cardinalR;
          return (
            <text
              key={label}
              x={lx}
              y={ly}
              textAnchor="middle"
              dominantBaseline="central"
              fill={primary ? "var(--roam-accent, #B3541E)" : "var(--roam-text-muted, #999)"}
              fontSize={cardinalFontSize}
              fontWeight={primary ? 700 : 500}
              style={{ userSelect: "none" }}
            >
              {label}
            </text>
          );
        })}
      </svg>

      {/* Needle - rotates with heading */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          transition: "transform 200ms var(--ease-out, cubic-bezier(0.25,0.46,0.45,0.94))",
          transform: `rotate(${normalHeading}deg)`,
          pointerEvents: "none",
        }}
      >
        {/* Needle line - gradient from transparent at bottom to primary at top */}
        <div
          style={{
            position: "absolute",
            left: cx - 0.5,
            top: cx - needleLen,
            width: 1,
            height: needleLen,
            background: "linear-gradient(to top, transparent, var(--roam-accent, #B3541E))",
            filter: "drop-shadow(0 0 8px rgba(179,84,30,0.4))",
          }}
        />
        {/* Diamond tip */}
        <div
          style={{
            position: "absolute",
            left: cx - diamondSize / 2,
            top: cx - needleLen - diamondSize / 2,
            width: diamondSize,
            height: diamondSize,
            background: "var(--roam-accent, #B3541E)",
            transform: "rotate(45deg)",
            filter: "drop-shadow(0 0 8px rgba(179,84,30,0.4))",
          }}
        />
      </div>

      {/* Center text - heading degrees + cardinal */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          pointerEvents: "none",
        }}
      >
        <span
          style={{
            fontSize: degFontSize,
            fontWeight: 900,
            color: "var(--roam-text, #1a1613)",
            lineHeight: 1,
            fontVariantNumeric: "tabular-nums",
          }}
        >
          {Math.round(normalHeading)}°
        </span>
        <span
          style={{
            fontSize: cardFontSize,
            fontWeight: 700,
            color: "var(--roam-accent, #B3541E)",
            lineHeight: 1,
            letterSpacing: "0.1em",
            marginTop: 1,
          }}
        >
          {cardinalText(normalHeading)}
        </span>
      </div>
    </div>
  );
});
