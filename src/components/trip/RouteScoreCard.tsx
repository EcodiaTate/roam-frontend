// src/components/trip/RouteScoreCard.tsx
"use client";

import { Shield, CloudSun, Wrench, Cloud } from "lucide-react";
import type { RouteIntelligenceScore, RouteScoreCategory } from "@/lib/types/overlays";
import { cardBase, cardHeaderRow, cardTitle, cardSubtitle } from "@/components/ui/cardStyles";

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

/* ── Color helpers ────────────────────────────────────────────────────── */

function scoreColor(score: number): string {
  if (score >= 8) return "#22c55e";
  if (score >= 6) return "#3b82f6";
  if (score >= 4) return "#f59e0b";
  if (score >= 2) return "#f97316";
  return "#ef4444";
}

function overallBg(score: number): string {
  if (score >= 8) return "rgba(34,197,94,0.12)";
  if (score >= 6) return "rgba(59,130,246,0.12)";
  if (score >= 4) return "rgba(245,158,11,0.12)";
  if (score >= 2) return "rgba(249,115,22,0.12)";
  return "rgba(239,68,68,0.12)";
}

const CATEGORY_META: Record<string, { icon: React.ReactNode; label: string }> = {
  safety: { icon: <Shield size={13} strokeWidth={2.2} />, label: "Safety" },
  conditions: { icon: <CloudSun size={13} strokeWidth={2.2} />, label: "Conditions" },
  services: { icon: <Wrench size={13} strokeWidth={2.2} />, label: "Services" },
  weather: { icon: <Cloud size={13} strokeWidth={2.2} />, label: "Weather" },
};

/* ── Component ────────────────────────────────────────────────────────── */

function CategoryCell({ name, cat }: { name: string; cat: RouteScoreCategory }) {
  const color = scoreColor(cat.score);
  const meta = CATEGORY_META[name] ?? { icon: null, label: name };

  return (
    <div style={{ ...catCard, background: `${color}0D` }}>
      <div style={{
        width: 28, height: 28, borderRadius: 8,
        display: "flex", alignItems: "center", justifyContent: "center",
        background: `${color}1A`, color, flexShrink: 0,
      }}>
        {meta.icon}
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

export function RouteScoreCard({ score }: { score: RouteIntelligenceScore | null }) {
  if (!score) return null;

  const color = scoreColor(score.overall);

  return (
    <div style={cardBase}>
      {/* Header */}
      <div style={cardHeaderRow}>
        <div style={{
          width: 40, height: 40, borderRadius: 12,
          display: "flex", alignItems: "center", justifyContent: "center",
          background: overallBg(score.overall),
          flexShrink: 0,
        }}>
          <span style={{ fontSize: 18, fontWeight: 900, color, lineHeight: 1 }}>
            {score.overall.toFixed(0)}
          </span>
        </div>
        <div style={{ minWidth: 0 }}>
          <div style={cardTitle}>
            Route Score — {score.overall_label}
          </div>
          <div style={cardSubtitle}>
            {score.summary.length > 100 ? score.summary.slice(0, 100) + "…" : score.summary}
          </div>
        </div>
      </div>

      {/* Category grid */}
      <div style={gridRow}>
        <CategoryCell name="safety" cat={score.safety} />
        <CategoryCell name="conditions" cat={score.conditions} />
        <CategoryCell name="services" cat={score.services} />
        <CategoryCell name="weather" cat={score.weather} />
      </div>

      {/* Factors from worst category */}
      {(() => {
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
