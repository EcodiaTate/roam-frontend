// src/components/trip/RouteScoreCard.tsx
"use client";

import { Shield, CloudSun, Wrench, Cloud } from "lucide-react";
import type { RouteIntelligenceScore, RouteScoreCategory } from "@/lib/types/overlays";
import { cardBase, cardHeaderRow, cardTitle, cardSubtitle, iconBox28, iconBox40 } from "@/components/ui/cardStyles";
import { scoreColor, scoreBg } from "@/lib/ui/colorHelpers";

const gridRow: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "1fr 1fr",
  gap: 6,
  marginTop: 12,
};

const catCard: React.CSSProperties = {
  borderRadius: 10,
  padding: "10px 12px",
  display: "flex",
  alignItems: "center",
  gap: 8,
};

const catLabel: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 700,
  color: "var(--roam-text-muted)",
  textTransform: "uppercase" as const,
  letterSpacing: "0.03em",
};

const catScore: React.CSSProperties = {
  fontSize: 13,
  fontWeight: 800,
  lineHeight: 1,
};

const summaryText: React.CSSProperties = {
  marginTop: 10,
  fontSize: 12,
  fontWeight: 600,
  color: "var(--roam-text-muted)",
  lineHeight: 1.4,
};


import type { LucideIcon } from "lucide-react";

const CATEGORY_META: Record<string, { Icon: LucideIcon; label: string }> = {
  safety: { Icon: Shield, label: "Safety" },
  conditions: { Icon: CloudSun, label: "Conditions" },
  services: { Icon: Wrench, label: "Services" },
  weather: { Icon: Cloud, label: "Weather" },
};

/* ── Component ────────────────────────────────────────────────────────── */

function CategoryCell({ name, cat }: { name: string; cat: RouteScoreCategory }) {
  const color = scoreColor(cat.score);
  const meta = CATEGORY_META[name] ?? { Icon: null, label: name };

  return (
    <div style={{ ...catCard, background: `${color}0D` }}>
      <div style={{ ...iconBox28, background: `${color}1A`, color }}>
        {meta.Icon && <meta.Icon size={13} strokeWidth={2.2} />}
      </div>
      <div>
        <div style={catLabel}>{meta.label}</div>
        <div style={{ ...catScore, color }}>
          {cat.score.toFixed(1)} <span style={{ fontSize: 10, fontWeight: 600, color: "var(--roam-text-muted)" }}>{cat.label}</span>
        </div>
      </div>
    </div>
  );
}

export function RouteScoreCard({ score, simple }: { score: RouteIntelligenceScore | null; simple?: boolean }) {
  if (!score) return null;

  const color = scoreColor(score.overall);

  return (
    <div style={cardBase}>
      {/* Header */}
      <div style={cardHeaderRow}>
        <div style={{ ...iconBox40, background: scoreBg(score.overall), ...(simple ? { width: 48, height: 48, borderRadius: 14 } : {}) }}>
          <span style={{ fontSize: simple ? 22 : 18, fontWeight: 900, color, lineHeight: 1 }}>
            {score.overall.toFixed(0)}
          </span>
        </div>
        <div style={{ minWidth: 0 }}>
          <div style={{ ...cardTitle, ...(simple ? { fontSize: 17 } : {}) }}>
            Route Score - {score.overall_label}
          </div>
          <div style={{ ...cardSubtitle, ...(simple ? { fontSize: 14 } : {}) }}>
            {score.summary.length > 100 ? score.summary.slice(0, 100) + "…" : score.summary}
          </div>
        </div>
      </div>

      {/* Category grid - hidden in simple mode */}
      {!simple && (
        <div style={gridRow}>
          <CategoryCell name="safety" cat={score.safety} />
          <CategoryCell name="conditions" cat={score.conditions} />
          <CategoryCell name="services" cat={score.services} />
          <CategoryCell name="weather" cat={score.weather} />
        </div>
      )}

      {/* Factors from worst category - hidden in simple mode */}
      {!simple && (() => {
        const worst = [
          { name: "safety", cat: score.safety },
          { name: "conditions", cat: score.conditions },
          { name: "services", cat: score.services },
          { name: "weather", cat: score.weather },
        ].sort((a, b) => a.cat.score - b.cat.score)[0];

        if (worst.cat.score >= 7 || worst.cat.factors.length === 0) return null;
        const meta = CATEGORY_META[worst.name];
        return (
          <div style={summaryText}>
            <span style={{ fontWeight: 800, color: scoreColor(worst.cat.score) }}>
              {meta?.label ?? worst.name}:
            </span>{" "}
            {worst.cat.factors.slice(0, 2).join(". ")}
          </div>
        );
      })()}
    </div>
  );
}
