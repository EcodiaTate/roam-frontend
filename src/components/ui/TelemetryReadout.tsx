// src/components/ui/TelemetryReadout.tsx

import { memo } from "react";

type Severity = "emergency" | "potable" | "solar";

type ReadoutItem = {
  /** The numeric or string value to display large */
  value: string | number;
  /** Small uppercase label beneath the value */
  label: string;
  /** Optional unit appended to value (e.g. "km/h", "%") */
  unit?: string;
  /** Color severity - omit for default text color */
  severity?: Severity;
  /** Use smaller value size for secondary readings */
  secondary?: boolean;
};

type Props = {
  items: ReadoutItem[];
  /** Layout direction */
  direction?: "row" | "column";
  /** Gap between items in pixels */
  gap?: number;
};

/**
 * Vehicle/trip telemetry data display.
 *
 * Large semi-bold readings for critical values (speed, range, heading)
 * at the top of the visual hierarchy, with small uppercase labels beneath.
 *
 * All values use tabular-nums and are sized for arm's-length legibility
 * in a bouncing vehicle.
 */
export const TelemetryReadout = memo(function TelemetryReadout({
  items,
  direction = "row",
  gap = 20,
}: Props) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: direction,
        alignItems: direction === "row" ? "flex-end" : "stretch",
        gap,
      }}
    >
      {items.map((item, i) => {
        const valueCls = [
          "terra-readout-value",
          item.secondary && "terra-readout-value--sm",
          item.severity && `terra-readout-value--${item.severity}`,
        ]
          .filter(Boolean)
          .join(" ");

        return (
          <div key={i} className="terra-readout">
            <span className={valueCls}>
              {item.value}
              {item.unit && (
                <span
                  style={{
                    fontSize: "0.55em",
                    fontWeight: 800,
                    letterSpacing: "0.02em",
                    marginLeft: 2,
                    opacity: 0.7,
                  }}
                >
                  {item.unit}
                </span>
              )}
            </span>
            <span className="terra-readout-label">{item.label}</span>
          </div>
        );
      })}
    </div>
  );
});
