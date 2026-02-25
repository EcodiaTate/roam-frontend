import type { Metadata } from "next";
import { CodeEnquiryForm } from "@/components/domain/code/code-enquiry-form";

export const metadata: Metadata = {
  title: "Ecodia Code — Custom Software for Circular Systems",
  description:
    "Ecodia Code builds high-end web apps, community marketplaces, and climate-aligned platforms. Stable in production, easy to extend, built to last.",
  keywords: [
    "custom software",
    "circular economy platform",
    "sustainability technology",
    "community marketplace",
    "Next.js studio",
    "bespoke web application",
    "climate tech",
    "Supabase",
    "ecodia code",
    "software studio australia",
  ],
};

const jsonLd = {
  "@context": "https://schema.org",
  "@type": "ProfessionalService",
  name: "Ecodia Code",
  description:
    "Custom software studio building circular economy platforms, community marketplaces, and climate-aligned technology.",
  areaServed: "AU",
  serviceType: "Software Development",
};

/* ─── DATA ──────────────────────────────────────────────────────────────────── */

const CAPABILITIES = [
  {
    id: "01",
    title: "Circular Economy Platforms",
    description:
      "End-to-end systems for product lifecycle tracking, upcycling marketplaces, and verified impact reporting. We've shipped Ecodia Studio — we know this space.",
    tags: ["Marketplace", "Impact ledger", "Verification"],
    accent: "mint",
  },
  {
    id: "02",
    title: "Community Marketplaces",
    description:
      "P2P and B2C platforms with payments, listings, messaging, and trust systems. Designed for local — scaled to regional.",
    tags: ["Payments", "Listings", "Real-time"],
    accent: "gold",
  },
  {
    id: "03",
    title: "Climate & Sustainability Tools",
    description:
      "Carbon tracking, ecological metrics, gamified action systems, and audit-ready data pipelines. Numbers you can report on.",
    tags: ["Carbon data", "Verification", "AI insights"],
    accent: "mint",
  },
  {
    id: "04",
    title: "Internal Operations Platforms",
    description:
      "Custom admin dashboards, workflow automation, and reporting tools. No spreadsheet chaos — clean systems your team actually uses.",
    tags: ["Admin UI", "Automation", "Reporting"],
    accent: "gold",
  },
  {
    id: "05",
    title: "Design Systems",
    description:
      "Token-based design systems with component libraries, accessibility baked in, and documentation your team can maintain without us.",
    tags: ["Tokens", "Components", "Docs"],
    accent: "mint",
  },
  {
    id: "06",
    title: "API & Data Integration",
    description:
      "Connect disparate systems with clean APIs, webhooks, and real-time pipelines. Third-party integrations done properly — typed, tested, monitored.",
    tags: ["REST / GraphQL", "Webhooks", "Realtime"],
    accent: "gold",
  },
] as const;

const PROCESS = [
  {
    phase: "01",
    name: "Scope",
    duration: "Week 1",
    description:
      "We map your problem space, user journeys, and technical constraints. You get a clear spec — no bloat, no ambiguity.",
  },
  {
    phase: "02",
    name: "Blueprint",
    duration: "Week 2",
    description:
      "Architecture decisions, data models, and component hierarchy. We design for longevity, not just launch.",
  },
  {
    phase: "03",
    name: "Build",
    duration: "Weeks 3–10",
    description:
      "Iterative delivery in tight cycles. Real feedback on working software — not Figma mockups. Ship early, refine constantly.",
  },
  {
    phase: "04",
    name: "Ship",
    duration: "Final week",
    description:
      "Production hardening, performance audit, documentation handover, and deployment. We stay on call for 30 days post-launch.",
  },
] as const;

const STACK = [
  "Next.js 16",
  "TypeScript 5",
  "Supabase",
  "React 19",
  "Tailwind CSS 4",
  "Framer Motion",
  "Stripe",
  "Resend",
  "Capacitor",
  "OpenAI",
  "PostGIS",
  "pgvector",
] as const;

const PRINCIPLES = [
  {
    label: "Typed end-to-end",
    detail: "Zero runtime surprises. Generated Supabase types, strict TS, Zod at every boundary.",
  },
  {
    label: "Ship in steps",
    detail: "Working software every two weeks. You see progress, you steer the ship.",
  },
  {
    label: "Minimal surface area",
    detail: "We build exactly what the problem needs. Over-engineering is a liability.",
  },
  {
    label: "Production-ready",
    detail: "RLS enforced, mobile-first, edge-deployed, monitored from day one.",
  },
] as const;

/* ─── COMPONENTS ─────────────────────────────────────────────────────────────── */

function SectionMarker({ label }: { label: string }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: "0.75rem",
        marginBottom: "3rem",
      }}
    >
      <div
        style={{
          width: "28px",
          height: "2px",
          background: "var(--ec-mint-500)",
          flexShrink: 0,
        }}
      />
      <span
        style={{
          fontFamily: "var(--ec-font-mono)",
          fontSize: "0.6rem",
          fontWeight: 700,
          letterSpacing: "0.3em",
          textTransform: "uppercase",
          color: "var(--ec-mint-500)",
        }}
      >
        {label}
      </span>
    </div>
  );
}

function CapabilityCard({
  id,
  title,
  description,
  tags,
  accent,
}: {
  id: string;
  title: string;
  description: string;
  tags: readonly string[];
  accent: "mint" | "gold";
}) {
  const accentColor =
    accent === "mint" ? "var(--ec-mint-500)" : "var(--ec-gold-500)";
  const accentDim =
    accent === "mint"
      ? "rgba(127,208,105,0.12)"
      : "rgba(244,211,94,0.12)";

  return (
    <div
      className="group"
      style={{
        position: "relative",
        padding: "2rem",
        border: "1px solid rgba(255,255,255,0.06)",
        borderTop: `2px solid ${accentColor}`,
        background: "rgba(255,255,255,0.03)",
        transition: "background 200ms ease, border-color 200ms ease",
      }}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLElement).style.background = accentDim;
        (e.currentTarget as HTMLElement).style.borderColor = accentColor;
        (e.currentTarget as HTMLElement).style.borderTopColor = accentColor;
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLElement).style.background =
          "rgba(255,255,255,0.03)";
        (e.currentTarget as HTMLElement).style.borderColor =
          "rgba(255,255,255,0.06)";
        (e.currentTarget as HTMLElement).style.borderTopColor = accentColor;
      }}
    >
      {/* ID marker */}
      <div
        style={{
          fontFamily: "var(--ec-font-mono)",
          fontSize: "0.6rem",
          fontWeight: 700,
          letterSpacing: "0.25em",
          color: accentColor,
          marginBottom: "1.25rem",
          opacity: 0.7,
        }}
      >
        {id}
      </div>

      <h3
        style={{
          fontFamily: "var(--ec-font-head)",
          fontSize: "clamp(1.1rem, 2vw, 1.35rem)",
          fontWeight: 700,
          color: "var(--ec-forest-100)",
          textTransform: "uppercase",
          letterSpacing: "0.03em",
          lineHeight: 1.2,
          marginBottom: "0.9rem",
        }}
      >
        {title}
      </h3>

      <p
        style={{
          fontSize: "0.875rem",
          color: "var(--ec-forest-400)",
          lineHeight: 1.65,
          marginBottom: "1.5rem",
        }}
      >
        {description}
      </p>

      <div style={{ display: "flex", flexWrap: "wrap", gap: "0.4rem" }}>
        {tags.map((tag) => (
          <span
            key={tag}
            style={{
              fontFamily: "var(--ec-font-mono)",
              fontSize: "0.6rem",
              fontWeight: 600,
              letterSpacing: "0.1em",
              textTransform: "uppercase",
              padding: "0.2rem 0.6rem",
              border: `1px solid ${accentColor}`,
              borderRadius: "1px",
              color: accentColor,
              opacity: 0.75,
            }}
          >
            {tag}
          </span>
        ))}
      </div>
    </div>
  );
}

/* ─── PAGE ───────────────────────────────────────────────────────────────────── */

export default function CodePage() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      {/* ── GLOBAL PAGE STYLES ── */}
      <style>{`
        .code-page {
          background: var(--ec-forest-950);
          color: var(--ec-forest-200);
          min-height: 100vh;
        }
        .code-grid-bg {
          background-image:
            linear-gradient(rgba(127,208,105,0.04) 1px, transparent 1px),
            linear-gradient(90deg, rgba(127,208,105,0.04) 1px, transparent 1px);
          background-size: 48px 48px;
        }
        .code-section {
          padding: clamp(4rem, 8vw, 7rem) clamp(1.25rem, 4vw, 2rem);
          max-width: 1160px;
          margin: 0 auto;
        }
        .code-divider {
          width: 100%;
          height: 1px;
          background: linear-gradient(90deg, transparent, rgba(127,208,105,0.2) 30%, rgba(127,208,105,0.2) 70%, transparent);
        }
        @keyframes marquee-slide {
          from { transform: translateX(0); }
          to { transform: translateX(-50%); }
        }
        .marquee-track {
          display: flex;
          width: max-content;
          animation: marquee-slide 28s linear infinite;
          will-change: transform;
        }
        .marquee-track:hover { animation-play-state: paused; }
        @keyframes cursor-blink {
          0%, 100% { opacity: 1; }
          50% { opacity: 0; }
        }
        .cursor-blink {
          animation: cursor-blink 1s step-end infinite;
        }
      `}</style>

      <div className="code-page code-grid-bg">

        {/* ══════════════════════════════════════════════════════════════════
            HERO
        ══════════════════════════════════════════════════════════════════ */}
        <section
          style={{
            position: "relative",
            overflow: "hidden",
            paddingTop: "clamp(5rem, 12vw, 9rem)",
            paddingBottom: "clamp(4rem, 8vw, 7rem)",
          }}
        >
          {/* Radial glow */}
          <div
            style={{
              position: "absolute",
              inset: 0,
              background:
                "radial-gradient(ellipse 80% 60% at 50% 0%, rgba(127,208,105,0.08) 0%, transparent 60%)",
              pointerEvents: "none",
            }}
          />

          <div className="code-section" style={{ padding: "0 clamp(1.25rem, 4vw, 2rem)", maxWidth: "1160px", margin: "0 auto" }}>
            {/* Eyebrow */}
            <div
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "0.6rem",
                marginBottom: "2.5rem",
                padding: "0.35rem 0.9rem",
                border: "1px solid rgba(127,208,105,0.25)",
                borderRadius: "2px",
                background: "rgba(127,208,105,0.06)",
              }}
            >
              <div
                style={{
                  width: "6px",
                  height: "6px",
                  borderRadius: "50%",
                  background: "var(--ec-mint-500)",
                  boxShadow: "0 0 8px var(--ec-mint-500)",
                }}
              />
              <span
                style={{
                  fontFamily: "var(--ec-font-mono)",
                  fontSize: "0.6rem",
                  fontWeight: 700,
                  letterSpacing: "0.25em",
                  textTransform: "uppercase",
                  color: "var(--ec-mint-400)",
                }}
              >
                Software Studio · Est. 2024 · Sydney, AU
              </span>
            </div>

            {/* Headline */}
            <h1
              style={{
                fontFamily: "var(--ec-font-head)",
                fontSize: "clamp(2.8rem, 8vw, 6.5rem)",
                fontWeight: 700,
                lineHeight: 0.95,
                letterSpacing: "-0.01em",
                textTransform: "uppercase",
                maxWidth: "820px",
                marginBottom: "2.5rem",
              }}
            >
              <span style={{ color: "var(--ec-forest-100)" }}>Code</span>
              <br />
              <span
                style={{
                  background:
                    "linear-gradient(90deg, var(--ec-mint-400) 0%, var(--ec-gold-400) 100%)",
                  WebkitBackgroundClip: "text",
                  WebkitTextFillColor: "transparent",
                  backgroundClip: "text",
                }}
              >
                the next
              </span>
              <br />
              <span style={{ color: "var(--ec-forest-100)" }}>world.</span>
            </h1>

            {/* Subhead + terminal line */}
            <div
              style={{
                maxWidth: "560px",
                marginBottom: "3.5rem",
              }}
            >
              <p
                style={{
                  fontSize: "clamp(1rem, 1.8vw, 1.2rem)",
                  color: "var(--ec-forest-400)",
                  lineHeight: 1.65,
                  marginBottom: "1.5rem",
                }}
              >
                We build high-end platforms for circular systems, community
                marketplaces, and climate-aligned organisations. Stable in
                production. Easy to extend. Built to last.
              </p>

              <div
                style={{
                  fontFamily: "var(--ec-font-mono)",
                  fontSize: "0.78rem",
                  color: "var(--ec-mint-500)",
                  opacity: 0.7,
                  display: "flex",
                  alignItems: "center",
                  gap: "0.4rem",
                }}
              >
                <span>$</span>
                <span>npx create-ecodia-app --mission=climate</span>
                <span className="cursor-blink" style={{ color: "var(--ec-gold-400)" }}>▌</span>
              </div>
            </div>

            {/* CTAs */}
            <div style={{ display: "flex", flexWrap: "wrap", gap: "1rem" }}>
              <a
                href="#enquire"
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "0.5rem",
                  padding: "0.9rem 2rem",
                  background: "var(--ec-mint-500)",
                  color: "var(--ec-forest-950)",
                  fontFamily: "var(--ec-font-mono)",
                  fontSize: "0.75rem",
                  fontWeight: 700,
                  letterSpacing: "0.15em",
                  textTransform: "uppercase",
                  textDecoration: "none",
                  borderRadius: "2px",
                  boxShadow: "4px 4px 0 var(--ec-mint-800)",
                  transition: "transform 80ms ease, box-shadow 80ms ease",
                }}
                onMouseEnter={(e) => {
                  (e.currentTarget as HTMLElement).style.transform = "translate(-2px, -2px)";
                  (e.currentTarget as HTMLElement).style.boxShadow = "6px 6px 0 var(--ec-mint-800)";
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLElement).style.transform = "";
                  (e.currentTarget as HTMLElement).style.boxShadow = "4px 4px 0 var(--ec-mint-800)";
                }}
              >
                Start a project →
              </a>
              <a
                href="#process"
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "0.5rem",
                  padding: "0.9rem 2rem",
                  background: "transparent",
                  color: "var(--ec-forest-300)",
                  fontFamily: "var(--ec-font-mono)",
                  fontSize: "0.75rem",
                  fontWeight: 700,
                  letterSpacing: "0.15em",
                  textTransform: "uppercase",
                  textDecoration: "none",
                  border: "1px solid rgba(255,255,255,0.12)",
                  borderRadius: "2px",
                  transition: "border-color 120ms ease, color 120ms ease",
                }}
                onMouseEnter={(e) => {
                  (e.currentTarget as HTMLElement).style.borderColor = "var(--ec-mint-600)";
                  (e.currentTarget as HTMLElement).style.color = "var(--ec-mint-400)";
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLElement).style.borderColor = "rgba(255,255,255,0.12)";
                  (e.currentTarget as HTMLElement).style.color = "var(--ec-forest-300)";
                }}
              >
                See our process
              </a>
            </div>
          </div>
        </section>

        {/* ══════════════════════════════════════════════════════════════════
            STACK MARQUEE
        ══════════════════════════════════════════════════════════════════ */}
        <div
          style={{
            borderTop: "1px solid rgba(127,208,105,0.1)",
            borderBottom: "1px solid rgba(127,208,105,0.1)",
            padding: "0.9rem 0",
            overflow: "hidden",
            background: "rgba(0,0,0,0.2)",
          }}
        >
          <div className="marquee-track">
            {[...STACK, ...STACK].map((tech, i) => (
              <span
                key={`${tech}-${i}`}
                style={{
                  fontFamily: "var(--ec-font-mono)",
                  fontSize: "0.65rem",
                  fontWeight: 600,
                  letterSpacing: "0.2em",
                  textTransform: "uppercase",
                  color: "var(--ec-forest-500)",
                  padding: "0 2rem",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "2rem",
                  whiteSpace: "nowrap",
                }}
              >
                {tech}
                <span
                  style={{
                    width: "3px",
                    height: "3px",
                    borderRadius: "50%",
                    background: "var(--ec-mint-700)",
                    display: "inline-block",
                  }}
                />
              </span>
            ))}
          </div>
        </div>

        <div className="code-divider" />

        {/* ══════════════════════════════════════════════════════════════════
            ABOUT / PRINCIPLES
        ══════════════════════════════════════════════════════════════════ */}
        <section className="code-section">
          <div
            style={{
              display: "grid",
              gap: "clamp(2.5rem, 5vw, 5rem)",
              gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))",
              alignItems: "start",
            }}
          >
            {/* Left: text */}
            <div>
              <SectionMarker label="About Ecodia Code" />
              <h2
                style={{
                  fontFamily: "var(--ec-font-head)",
                  fontSize: "clamp(1.8rem, 4vw, 2.8rem)",
                  fontWeight: 700,
                  textTransform: "uppercase",
                  lineHeight: 1.1,
                  color: "var(--ec-forest-100)",
                  marginBottom: "1.5rem",
                  letterSpacing: "0.01em",
                }}
              >
                We build what
                <br />
                <span
                  style={{
                    background:
                      "linear-gradient(90deg, var(--ec-gold-400), var(--ec-mint-400))",
                    WebkitBackgroundClip: "text",
                    WebkitTextFillColor: "transparent",
                    backgroundClip: "text",
                  }}
                >
                  the planet needs.
                </span>
              </h2>
              <p
                style={{
                  fontSize: "0.95rem",
                  color: "var(--ec-forest-400)",
                  lineHeight: 1.7,
                  marginBottom: "1.25rem",
                }}
              >
                Ecodia Code is the studio behind the Ecodia platform — a
                production system processing real eco-actions, real payments,
                and real impact data for thousands of users across Australia.
              </p>
              <p
                style={{
                  fontSize: "0.95rem",
                  color: "var(--ec-forest-400)",
                  lineHeight: 1.7,
                }}
              >
                We take on a small number of client projects each quarter —
                organisations where technology can meaningfully accelerate
                their mission. If that's you, we'd like to talk.
              </p>
            </div>

            {/* Right: principles */}
            <div style={{ display: "flex", flexDirection: "column", gap: "0" }}>
              {PRINCIPLES.map((p, i) => (
                <div
                  key={p.label}
                  style={{
                    padding: "1.5rem 0",
                    borderBottom:
                      i < PRINCIPLES.length - 1
                        ? "1px solid rgba(255,255,255,0.05)"
                        : "none",
                    display: "flex",
                    flexDirection: "column",
                    gap: "0.4rem",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "0.6rem",
                    }}
                  >
                    <div
                      style={{
                        width: "6px",
                        height: "6px",
                        background: "var(--ec-mint-500)",
                        borderRadius: "1px",
                        flexShrink: 0,
                      }}
                    />
                    <span
                      style={{
                        fontFamily: "var(--ec-font-head)",
                        fontSize: "0.95rem",
                        textTransform: "uppercase",
                        letterSpacing: "0.04em",
                        color: "var(--ec-forest-100)",
                      }}
                    >
                      {p.label}
                    </span>
                  </div>
                  <p
                    style={{
                      fontSize: "0.82rem",
                      color: "var(--ec-forest-500)",
                      lineHeight: 1.55,
                      paddingLeft: "1.1rem",
                    }}
                  >
                    {p.detail}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <div className="code-divider" />

        {/* ══════════════════════════════════════════════════════════════════
            CAPABILITIES GRID
        ══════════════════════════════════════════════════════════════════ */}
        <section className="code-section">
          <SectionMarker label="Capabilities" />

          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "flex-end",
              flexWrap: "wrap",
              gap: "1.5rem",
              marginBottom: "3rem",
            }}
          >
            <h2
              style={{
                fontFamily: "var(--ec-font-head)",
                fontSize: "clamp(1.8rem, 4vw, 2.8rem)",
                fontWeight: 700,
                textTransform: "uppercase",
                lineHeight: 1.1,
                color: "var(--ec-forest-100)",
                maxWidth: "600px",
                letterSpacing: "0.01em",
              }}
            >
              What we build
            </h2>
            <p
              style={{
                fontFamily: "var(--ec-font-mono)",
                fontSize: "0.7rem",
                color: "var(--ec-forest-600)",
                letterSpacing: "0.1em",
                maxWidth: "200px",
                textAlign: "right",
                lineHeight: 1.5,
              }}
            >
              {CAPABILITIES.length} service categories
            </p>
          </div>

          <div
            style={{
              display: "grid",
              gap: "1px",
              gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))",
              background: "rgba(255,255,255,0.04)",
              border: "1px solid rgba(255,255,255,0.04)",
            }}
          >
            {CAPABILITIES.map((cap) => (
              <CapabilityCard key={cap.id} {...cap} />
            ))}
          </div>
        </section>

        <div className="code-divider" />

        {/* ══════════════════════════════════════════════════════════════════
            PROCESS
        ══════════════════════════════════════════════════════════════════ */}
        <section id="process" className="code-section">
          <SectionMarker label="Our process" />

          <h2
            style={{
              fontFamily: "var(--ec-font-head)",
              fontSize: "clamp(1.8rem, 4vw, 2.8rem)",
              fontWeight: 700,
              textTransform: "uppercase",
              lineHeight: 1.1,
              color: "var(--ec-forest-100)",
              marginBottom: "3.5rem",
              letterSpacing: "0.01em",
              maxWidth: "520px",
            }}
          >
            Clear scope.
            <br />
            <span
              style={{
                background:
                  "linear-gradient(90deg, var(--ec-mint-400), var(--ec-gold-400))",
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
                backgroundClip: "text",
              }}
            >
              Fast feedback.
            </span>
            <br />
            Ship in steps.
          </h2>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
              gap: "0",
              position: "relative",
            }}
          >
            {/* Connector line — desktop only */}
            <div
              style={{
                position: "absolute",
                top: "2.75rem",
                left: "4rem",
                right: "4rem",
                height: "1px",
                background:
                  "linear-gradient(90deg, transparent, rgba(127,208,105,0.25) 20%, rgba(127,208,105,0.25) 80%, transparent)",
                pointerEvents: "none",
              }}
            />

            {PROCESS.map((step, i) => (
              <div
                key={step.phase}
                style={{
                  padding: "2rem 1.75rem",
                  borderRight:
                    i < PROCESS.length - 1
                      ? "1px solid rgba(255,255,255,0.05)"
                      : "none",
                  position: "relative",
                }}
              >
                {/* Phase number */}
                <div
                  style={{
                    width: "44px",
                    height: "44px",
                    border: "2px solid var(--ec-mint-600)",
                    borderRadius: "2px",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    background: "var(--ec-forest-950)",
                    marginBottom: "1.5rem",
                    position: "relative",
                    zIndex: 1,
                  }}
                >
                  <span
                    style={{
                      fontFamily: "var(--ec-font-mono)",
                      fontSize: "0.7rem",
                      fontWeight: 700,
                      letterSpacing: "0.1em",
                      color: "var(--ec-mint-400)",
                    }}
                  >
                    {step.phase}
                  </span>
                </div>

                <div
                  style={{
                    fontFamily: "var(--ec-font-mono)",
                    fontSize: "0.55rem",
                    fontWeight: 600,
                    letterSpacing: "0.2em",
                    textTransform: "uppercase",
                    color: "var(--ec-forest-600)",
                    marginBottom: "0.5rem",
                  }}
                >
                  {step.duration}
                </div>

                <h3
                  style={{
                    fontFamily: "var(--ec-font-head)",
                    fontSize: "1.1rem",
                    textTransform: "uppercase",
                    letterSpacing: "0.04em",
                    color: "var(--ec-forest-100)",
                    marginBottom: "0.75rem",
                  }}
                >
                  {step.name}
                </h3>

                <p
                  style={{
                    fontSize: "0.82rem",
                    color: "var(--ec-forest-500)",
                    lineHeight: 1.65,
                  }}
                >
                  {step.description}
                </p>
              </div>
            ))}
          </div>
        </section>

        <div className="code-divider" />

        {/* ══════════════════════════════════════════════════════════════════
            BUILT ON ECODIA
        ══════════════════════════════════════════════════════════════════ */}
        <section className="code-section">
          <SectionMarker label="Proof of work" />

          <div
            style={{
              display: "grid",
              gap: "clamp(2rem, 4vw, 4rem)",
              gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))",
              alignItems: "center",
            }}
          >
            <div>
              <h2
                style={{
                  fontFamily: "var(--ec-font-head)",
                  fontSize: "clamp(1.8rem, 4vw, 2.8rem)",
                  fontWeight: 700,
                  textTransform: "uppercase",
                  lineHeight: 1.1,
                  color: "var(--ec-forest-100)",
                  marginBottom: "1.5rem",
                  letterSpacing: "0.01em",
                }}
              >
                We ship what
                <br />
                <span
                  style={{
                    color: "var(--ec-gold-400)",
                  }}
                >
                  we preach.
                </span>
              </h2>
              <p
                style={{
                  fontSize: "0.95rem",
                  color: "var(--ec-forest-400)",
                  lineHeight: 1.7,
                  marginBottom: "1.25rem",
                }}
              >
                Ecodia itself — the app you're reading about on this site — is our
                reference implementation. Built on this exact stack, in production,
                processing real data for real users.
              </p>
              <p
                style={{
                  fontSize: "0.95rem",
                  color: "var(--ec-forest-400)",
                  lineHeight: 1.7,
                }}
              >
                No agency deck. No case studies dressed up with NDA fog.
                Ecodia is the case study.
              </p>
            </div>

            {/* Stats block */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: "1px",
                background: "rgba(127,208,105,0.1)",
                border: "1px solid rgba(127,208,105,0.1)",
                borderRadius: "2px",
              }}
            >
              {[
                { value: "46", label: "DB tables" },
                { value: "10", label: "Edge functions" },
                { value: "3.5k+", label: "Lines of actions" },
                { value: "5", label: "Realtime hooks" },
              ].map((stat) => (
                <div
                  key={stat.label}
                  style={{
                    padding: "1.75rem",
                    background: "var(--ec-forest-950)",
                    display: "flex",
                    flexDirection: "column",
                    gap: "0.3rem",
                  }}
                >
                  <span
                    style={{
                      fontFamily: "var(--ec-font-mono)",
                      fontSize: "clamp(1.4rem, 3vw, 2rem)",
                      fontWeight: 700,
                      color: "var(--ec-mint-400)",
                      lineHeight: 1,
                    }}
                  >
                    {stat.value}
                  </span>
                  <span
                    style={{
                      fontFamily: "var(--ec-font-mono)",
                      fontSize: "0.6rem",
                      letterSpacing: "0.15em",
                      textTransform: "uppercase",
                      color: "var(--ec-forest-600)",
                    }}
                  >
                    {stat.label}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </section>

        <div className="code-divider" />

        {/* ══════════════════════════════════════════════════════════════════
            ENQUIRY FORM
        ══════════════════════════════════════════════════════════════════ */}
        <section id="enquire" className="code-section">
          <SectionMarker label="Start a project" />

          <div
            style={{
              display: "grid",
              gap: "clamp(2.5rem, 5vw, 5rem)",
              gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))",
              alignItems: "start",
            }}
          >
            {/* Left: context */}
            <div>
              <h2
                style={{
                  fontFamily: "var(--ec-font-head)",
                  fontSize: "clamp(1.8rem, 4vw, 2.8rem)",
                  fontWeight: 700,
                  textTransform: "uppercase",
                  lineHeight: 1.1,
                  color: "var(--ec-forest-100)",
                  marginBottom: "1.5rem",
                  letterSpacing: "0.01em",
                }}
              >
                Tell us
                <br />
                <span
                  style={{
                    background:
                      "linear-gradient(90deg, var(--ec-mint-400), var(--ec-gold-400))",
                    WebkitBackgroundClip: "text",
                    WebkitTextFillColor: "transparent",
                    backgroundClip: "text",
                  }}
                >
                  what you're
                  <br />
                  building.
                </span>
              </h2>

              <p
                style={{
                  fontSize: "0.9rem",
                  color: "var(--ec-forest-500)",
                  lineHeight: 1.7,
                  marginBottom: "2rem",
                }}
              >
                We take on a small number of external projects per quarter.
                Fill in what you can — we'll follow up to understand the rest.
              </p>

              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: "1rem",
                }}
              >
                {[
                  "Reply within 2 business days",
                  "No commitment to enquire",
                  "We'll be honest if it's not a fit",
                ].map((note) => (
                  <div
                    key={note}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "0.7rem",
                      fontFamily: "var(--ec-font-mono)",
                      fontSize: "0.72rem",
                      color: "var(--ec-forest-500)",
                      letterSpacing: "0.04em",
                    }}
                  >
                    <span
                      style={{
                        color: "var(--ec-mint-500)",
                        fontSize: "0.8rem",
                      }}
                    >
                      ✓
                    </span>
                    {note}
                  </div>
                ))}
              </div>
            </div>

            {/* Right: form */}
            <div
              style={{
                padding: "2.5rem",
                border: "1px solid rgba(127,208,105,0.12)",
                borderRadius: "2px",
                background: "rgba(0,0,0,0.25)",
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "0.5rem",
                  marginBottom: "2rem",
                  paddingBottom: "1.25rem",
                  borderBottom: "1px solid rgba(255,255,255,0.05)",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    gap: "4px",
                  }}
                >
                  {["#ef4444", "#f4d35e", "#7fd069"].map((c) => (
                    <div
                      key={c}
                      style={{
                        width: "8px",
                        height: "8px",
                        borderRadius: "50%",
                        background: c,
                        opacity: 0.7,
                      }}
                    />
                  ))}
                </div>
                <span
                  style={{
                    fontFamily: "var(--ec-font-mono)",
                    fontSize: "0.6rem",
                    color: "var(--ec-forest-600)",
                    letterSpacing: "0.1em",
                    flex: 1,
                    textAlign: "center",
                  }}
                >
                  project-enquiry.form
                </span>
              </div>

              <CodeEnquiryForm />
            </div>
          </div>
        </section>

        {/* ══════════════════════════════════════════════════════════════════
            FOOTER CTA STRIP
        ══════════════════════════════════════════════════════════════════ */}
        <div
          style={{
            borderTop: "1px solid rgba(127,208,105,0.1)",
            padding: "3rem clamp(1.25rem, 4vw, 2rem)",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: "1.25rem",
            textAlign: "center",
          }}
        >
          <p
            style={{
              fontFamily: "var(--ec-font-mono)",
              fontSize: "0.6rem",
              fontWeight: 700,
              letterSpacing: "0.3em",
              textTransform: "uppercase",
              color: "var(--ec-forest-700)",
            }}
          >
            Ecodia Code · Open · Typed · Sustainable by design
          </p>
          <div style={{ display: "flex", gap: "2rem", flexWrap: "wrap", justifyContent: "center" }}>
            <a
              href="/ecodia"
              style={{
                fontFamily: "var(--ec-font-mono)",
                fontSize: "0.65rem",
                letterSpacing: "0.12em",
                textTransform: "uppercase",
                color: "var(--ec-forest-600)",
                textDecoration: "none",
                transition: "color 120ms ease",
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLElement).style.color = "var(--ec-mint-400)";
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLElement).style.color = "var(--ec-forest-600)";
              }}
            >
              Explore Ecodia
            </a>
            <a
              href="/contact"
              style={{
                fontFamily: "var(--ec-font-mono)",
                fontSize: "0.65rem",
                letterSpacing: "0.12em",
                textTransform: "uppercase",
                color: "var(--ec-forest-600)",
                textDecoration: "none",
                transition: "color 120ms ease",
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLElement).style.color = "var(--ec-mint-400)";
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLElement).style.color = "var(--ec-forest-600)";
              }}
            >
              General contact
            </a>
            <a
              href="/story"
              style={{
                fontFamily: "var(--ec-font-mono)",
                fontSize: "0.65rem",
                letterSpacing: "0.12em",
                textTransform: "uppercase",
                color: "var(--ec-forest-600)",
                textDecoration: "none",
                transition: "color 120ms ease",
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLElement).style.color = "var(--ec-mint-400)";
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLElement).style.color = "var(--ec-forest-600)";
              }}
            >
              Our story
            </a>
          </div>
        </div>
      </div>
    </>
  );
}
