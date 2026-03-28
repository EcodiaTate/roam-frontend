// src/components/ui/TerraAlert.tsx

import { memo, type ReactNode } from "react";
import { AlertTriangle, AlertCircle, CheckCircle } from "lucide-react";

type Severity = "emergency" | "advisory" | "nominal";

type Props = {
  /** Alert tier - "emergency" (Red #C62828) reserved for SOS/critical only */
  severity: Severity;
  /** Bold title line */
  title: string;
  /** Optional description beneath the title */
  description?: string;
  /** Override the default severity icon */
  icon?: ReactNode;
};

const ICON_MAP: Record<Severity, ReactNode> = {
  emergency: <AlertTriangle size={20} />,
  advisory: <AlertCircle size={20} />,
  nominal: <CheckCircle size={20} />,
};

/**
 * Alert/warning banner following Terra Nomad severity tiers.
 *
 * - Emergency Red (#C62828) - SOS and critical vehicle warnings ONLY
 * - Solar Amber - non-critical advisories (low signal, slow charge, etc.)
 * - Potable Green (#6D7E4E) - water supply, nominal status confirmations
 */
export const TerraAlert = memo(function TerraAlert({
  severity,
  title,
  description,
  icon,
}: Props) {
  return (
    <div
      className={`terra-alert terra-alert--${severity}`}
      role={severity === "emergency" ? "alert" : "status"}
      aria-live={severity === "emergency" ? "assertive" : "polite"}
    >
      <span className="terra-alert-icon" aria-hidden="true">
        {icon ?? ICON_MAP[severity]}
      </span>
      <div className="terra-alert-body">
        <div className="terra-alert-title">{title}</div>
        {description && (
          <div className="terra-alert-desc">{description}</div>
        )}
      </div>
    </div>
  );
});
