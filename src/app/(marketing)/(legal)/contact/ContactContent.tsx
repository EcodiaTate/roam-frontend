"use client";

import { useCallback, useEffect, useRef, useState, useMemo } from "react";
import s from "../legal.module.css";
import { Compass, Menu, X, ArrowRight } from "lucide-react";

/* ------------------------------------------------------------------ */
/* Shared nav helpers (same logic as landing page)                     */
/* ------------------------------------------------------------------ */
type Platform = "ios" | "android" | "desktop";

function usePlatform(): Platform {
  const [p, setP] = useState<Platform>("desktop");
  useEffect(() => {
    const ua = navigator.userAgent || "";
    if (
      /iPad|iPhone|iPod/.test(ua) ||
      (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)
    )
      setP("ios");
    else if (/android/i.test(ua)) setP("android");
  }, []);
  return p;
}

const APP_STORE = "https://apps.apple.com/au/app/roam/id000000000";
const PLAY_STORE =
  "https://play.google.com/store/apps/details?id=com.roamapp.au";

function useCtaConfig(platform: Platform) {
  return useMemo(() => {
    switch (platform) {
      case "ios":
        return { href: APP_STORE, label: "Get the App", external: true };
      case "android":
        return { href: PLAY_STORE, label: "Get the App", external: true };
      default:
        return { href: "/trip", label: "Open Roam", external: false };
    }
  }, [platform]);
}

function extProps(external: boolean) {
  return external
    ? ({ target: "_blank", rel: "noopener noreferrer" } as const)
    : {};
}

/* ------------------------------------------------------------------ */
/* Form types                                                          */
/* ------------------------------------------------------------------ */
type Category =
  | ""
  | "support"
  | "bug"
  | "feature"
  | "privacy"
  | "data-request"
  | "complaint"
  | "partnership"
  | "other";

interface FormData {
  name: string;
  email: string;
  category: Category;
  subject: string;
  message: string;
}

const FORMSUBMIT_URL = "https://formsubmit.co/ajax/tate@ecodia.au";

const CATEGORY_LABELS: Record<Exclude<Category, "">, string> = {
  support: "General support",
  bug: "Bug report",
  feature: "Feature request",
  privacy: "Privacy enquiry",
  "data-request": "Data access / deletion request (APP 12 & 13)",
  complaint: "Complaint",
  partnership: "Partnership or business enquiry",
  other: "Other",
};

const SUBJECT_HINTS: Partial<Record<Category, string>> = {
  bug: "What happened? What did you expect to happen?",
  feature: "Describe the feature and why it would help your trips",
  privacy: "Describe your privacy concern or question",
  "data-request":
    "Please specify: access my data, correct my data, or delete my account",
  complaint: "Please describe the issue and the outcome you're seeking",
};

/* ------------------------------------------------------------------ */
/* Page                                                                */
/* ------------------------------------------------------------------ */
export default function ContactContent() {
  const platform = usePlatform();
  const cta = useCtaConfig(platform);
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  const [form, setForm] = useState<FormData>({
    name: "",
    email: "",
    category: "",
    subject: "",
    message: "",
  });
  const [status, setStatus] = useState<
    "idle" | "sending" | "success" | "error"
  >("idle");
  const [errorMsg, setErrorMsg] = useState("");
  const honeyRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const fn = () => setScrolled(window.scrollY > 40);
    window.addEventListener("scroll", fn, { passive: true });
    return () => window.removeEventListener("scroll", fn);
  }, []);

  useEffect(() => {
    const close = () => setMenuOpen(false);
    window.addEventListener("resize", close);
    return () => window.removeEventListener("resize", close);
  }, []);

  const update = useCallback(
    (field: keyof FormData) =>
      (
        e: React.ChangeEvent<
          HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
        >,
      ) => {
        setForm((prev) => ({ ...prev, [field]: e.target.value }));
      },
    [],
  );

  const canSubmit =
    status !== "sending" &&
    form.name.trim().length > 0 &&
    form.email.trim().length > 0 &&
    form.email.includes("@") &&
    form.category !== "" &&
    form.message.trim().length > 10;

  const handleSubmit = useCallback(async () => {
    if (!canSubmit) return;

    if (honeyRef.current && honeyRef.current.value.length > 0) {
      setStatus("success");
      return;
    }

    setStatus("sending");
    setErrorMsg("");

    const categoryLabel =
      CATEGORY_LABELS[form.category as Exclude<Category, "">] || form.category;

    try {
      const res = await fetch(FORMSUBMIT_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({
          name: form.name.trim(),
          email: form.email.trim(),
          category: categoryLabel,
          subject: form.subject.trim() || `[Roam] ${categoryLabel}`,
          message: form.message.trim(),
          _subject: form.subject.trim()
            ? `[Roam ${categoryLabel}] ${form.subject.trim()}`
            : `[Roam] ${categoryLabel}`,
          _template: "box",
          _captcha: "true",
        }),
      });

      if (res.ok) {
        setStatus("success");
        setForm({
          name: "",
          email: "",
          category: "",
          subject: "",
          message: "",
        });
      } else {
        const data = await res.json().catch(() => null);
        setErrorMsg(
          data?.message ||
            "Something went wrong. Please try emailing tate@ecodia.au directly.",
        );
        setStatus("error");
      }
    } catch {
      setErrorMsg(
        "Network error — you may be offline. Please email tate@ecodia.au directly.",
      );
      setStatus("error");
    }
  }, [canSubmit, form]);

  return (
    <>
      <style>{NAV_STYLES}</style>

      {/* ── Nav (matches landing page) ─────────────── */}
      <nav className={`rl-nav ${scrolled ? "rl-nav-s" : ""}`}>
        <div className="rl-nav-bar">
          <a href="/" className="rl-nav-logo">
            <Compass size={22} strokeWidth={2.5} />
            <span>ROAM</span>
          </a>

          <div className="rl-nav-links">
            <a href="/#features" className="rl-nav-link">Features</a>
            <a href="/#how" className="rl-nav-link">How It Works</a>
            <a href="/contact" className="rl-nav-link rl-nav-link-active">Contact</a>
          </div>

          <a
            href={cta.href}
            className="rl-nav-cta"
            {...extProps(cta.external)}
          >
            {cta.label}
          </a>

          <button
            className="rl-nav-hamburger"
            onClick={() => setMenuOpen(!menuOpen)}
            aria-label={menuOpen ? "Close menu" : "Open menu"}
          >
            {menuOpen ? <X size={24} /> : <Menu size={24} />}
          </button>
        </div>

        {menuOpen && (
          <div className="rl-nav-mobile">
            <a href="/#features" className="rl-nav-mobile-link" onClick={() => setMenuOpen(false)}>Features</a>
            <a href="/#how" className="rl-nav-mobile-link" onClick={() => setMenuOpen(false)}>How It Works</a>
            <a href="/contact" className="rl-nav-mobile-link" onClick={() => setMenuOpen(false)}>Contact</a>
            <a
              href={cta.href}
              className="rl-nav-mobile-cta"
              onClick={() => setMenuOpen(false)}
              {...extProps(cta.external)}
            >
              {cta.label} <ArrowRight size={16} />
            </a>
          </div>
        )}
      </nav>

      {/* ── Page content (constrained width) ───────── */}
      <div className="rl-legal-content">
        <h1 className={s.pageTitle}>Contact Us</h1>
        <p className={s.effectiveDate}>
          We typically respond within 1–3 business days
        </p>

        {/* ── Direct contact methods ──────────────────── */}
        <section className={s.section}>
          <div className={s.contactMethods}>
            <div className={s.contactCard}>
              <h4>Email</h4>
              <p>
                <a href="mailto:tate@ecodia.au" className={s.link}>
                  tate@ecodia.au
                </a>
              </p>
            </div>
            <div className={s.contactCard}>
              <h4>Privacy &amp; Data Requests</h4>
              <p>
                For data access, correction, or deletion requests under the
                Australian Privacy Principles, email{" "}
                <a href="mailto:tate@ecodia.au" className={s.link}>
                  tate@ecodia.au
                </a>{" "}
                with &quot;Privacy Request&quot; in the subject. We will respond
                within 30 days.
              </p>
            </div>
            <div className={s.contactCard}>
              <h4>Complaints</h4>
              <p>
                We take complaints seriously. We aim to acknowledge within 7 days
                and resolve within 30 days. If unsatisfied, you can escalate to
                the{" "}
                <a
                  href="https://www.oaic.gov.au/privacy/privacy-complaints"
                  className={s.link}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  OAIC
                </a>
                .
              </p>
            </div>
          </div>
        </section>

        <hr className={s.divider} />

        {/* ── Contact form ────────────────────────────── */}
        <section className={s.section}>
          <h2 className={s.sectionTitle}>Send Us a Message</h2>

          {status === "success" ? (
            <div className={s.successMsg}>
              <p style={{ margin: "0 0 4px", fontSize: "17px" }}>✓ Message sent</p>
              <p style={{ margin: 0, opacity: 0.8, fontSize: "14px" }}>
                Thanks for reaching out. We&apos;ll get back to you at{" "}
                {form.email || "your email"} as soon as we can.
              </p>
              <button
                onClick={() => setStatus("idle")}
                style={{
                  marginTop: "16px",
                  background: "rgba(255,255,255,0.1)",
                  border: "1px solid rgba(255,255,255,0.2)",
                  borderRadius: "8px",
                  padding: "8px 16px",
                  color: "#81c784",
                  fontSize: "14px",
                  cursor: "pointer",
                }}
              >
                Send another message
              </button>
            </div>
          ) : (
            <div className={s.form} role="form" aria-label="Contact form">
              {/* Honeypot */}
              <div
                style={{
                  position: "absolute",
                  left: "-9999px",
                  top: "-9999px",
                  opacity: 0,
                  height: 0,
                  overflow: "hidden",
                }}
                aria-hidden="true"
              >
                <label htmlFor="_honey">Do not fill this field</label>
                <input
                  ref={honeyRef}
                  id="_honey"
                  name="_honey"
                  type="text"
                  tabIndex={-1}
                  autoComplete="off"
                />
              </div>

              {/* Name */}
              <div className={s.fieldGroup}>
                <label htmlFor="contact-name" className={s.label}>
                  Name<span className={s.required}>*</span>
                </label>
                <input
                  id="contact-name"
                  type="text"
                  className={s.input}
                  placeholder="Your name"
                  value={form.name}
                  onChange={update("name")}
                  autoComplete="name"
                  maxLength={100}
                />
              </div>

              {/* Email */}
              <div className={s.fieldGroup}>
                <label htmlFor="contact-email" className={s.label}>
                  Email<span className={s.required}>*</span>
                </label>
                <input
                  id="contact-email"
                  type="email"
                  className={s.input}
                  placeholder="you@example.com"
                  value={form.email}
                  onChange={update("email")}
                  autoComplete="email"
                  maxLength={200}
                />
              </div>

              {/* Category */}
              <div className={s.fieldGroup}>
                <label htmlFor="contact-category" className={s.label}>
                  Category<span className={s.required}>*</span>
                </label>
                <select
                  id="contact-category"
                  className={s.select}
                  value={form.category}
                  onChange={update("category")}
                >
                  <option id="option" className={s.option} value="" disabled>
                    Select a category…
                  </option>
                  {(
                    Object.entries(CATEGORY_LABELS) as [
                      Exclude<Category, "">,
                      string,
                    ][]
                  ).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </div>

              {/* Subject */}
              <div className={s.fieldGroup}>
                <label htmlFor="contact-subject" className={s.label}>
                  Subject
                </label>
                <input
                  id="contact-subject"
                  type="text"
                  className={s.input}
                  placeholder={
                    SUBJECT_HINTS[form.category] ||
                    "Brief summary of your message"
                  }
                  value={form.subject}
                  onChange={update("subject")}
                  maxLength={200}
                />
              </div>

              {/* Message */}
              <div className={s.fieldGroup}>
                <label htmlFor="contact-message" className={s.label}>
                  Message<span className={s.required}>*</span>
                </label>
                <textarea
                  id="contact-message"
                  className={s.textarea}
                  placeholder="Tell us what's on your mind…"
                  value={form.message}
                  onChange={update("message")}
                  maxLength={5000}
                />
                <span
                  style={{
                    fontSize: "11px",
                    color: "rgba(232,221,208,0.25)",
                    textAlign: "right",
                  }}
                >
                  {form.message.length} / 5,000
                </span>
              </div>

              {/* Error */}
              {status === "error" && errorMsg && (
                <div
                  style={{
                    background: "rgba(244, 67, 54, 0.1)",
                    border: "1px solid rgba(244, 67, 54, 0.2)",
                    borderRadius: "10px",
                    padding: "12px 16px",
                    color: "#ef9a9a",
                    fontSize: "14px",
                  }}
                >
                  {errorMsg}
                </div>
              )}

              {/* Submit */}
              <button
                className={s.submitBtn}
                onClick={handleSubmit}
                disabled={!canSubmit}
                aria-busy={status === "sending"}
              >
                {status === "sending" ? "Sending…" : "Send Message"}
              </button>

              {/* Privacy note */}
              <p
                style={{
                  fontSize: "12px",
                  color: "rgba(232,221,208,0.3)",
                  lineHeight: 1.6,
                  margin: 0,
                }}
              >
                By submitting this form, your message is sent to us via{" "}
                <a
                  href="https://formsubmit.co"
                  className={s.link}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ fontSize: "12px" }}
                >
                  FormSubmit
                </a>
                . Your information is handled in accordance with our{" "}
                <a href="/privacy" className={s.link} style={{ fontSize: "12px" }}>
                  Privacy Policy
                </a>
                .
              </p>
            </div>
          )}
        </section>

        <hr className={s.divider} />

        {/* ── Response times ──────────────────────────── */}
        <section className={s.section}>
          <h2 className={s.sectionTitle}>Response Times</h2>
          <div style={{ overflowX: "auto" }}>
            <table className={s.dataTable}>
              <thead>
                <tr>
                  <th>Category</th>
                  <th>Response</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>General support</td>
                  <td>1–3 business days</td>
                </tr>
                <tr>
                  <td>Bug reports</td>
                  <td>1–3 business days</td>
                </tr>
                <tr>
                  <td>Feature requests</td>
                  <td>Acknowledged, no guaranteed timeline</td>
                </tr>
                <tr>
                  <td>Privacy enquiries</td>
                  <td>7 business days</td>
                </tr>
                <tr>
                  <td>Data access / deletion</td>
                  <td>Within 30 days (per APPs)</td>
                </tr>
                <tr>
                  <td>Complaints</td>
                  <td>Acknowledged within 7 days, resolved within 30</td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Nav styles (dark theme matching legal layout) + content container   */
/* ------------------------------------------------------------------ */
const NAV_STYLES = `
@import url('https://fonts.googleapis.com/css2?family=Syne:wght@800&family=Bricolage+Grotesque:opsz,wght@12..96,400;12..96,600;12..96,800&display=swap');

/* Content container — replaces the old layout main constraints */
.rl-legal-content {
  max-width: 680px;
  width: 100%;
  margin: 0 auto;
  padding: 24px 20px 40px;
}

.rl-nav {
  position: sticky; top: 0; z-index: 1000;
  background: #1a1612;
  border-bottom: 1px solid transparent;
  transition: background 0.3s, border-color 0.3s, backdrop-filter 0.3s;
}
.rl-nav-s {
  background: rgba(26, 22, 18, 0.88);
  backdrop-filter: blur(16px);
  border-bottom-color: rgba(232, 221, 208, 0.08);
}
.rl-nav-bar {
  max-width: 1100px; margin: 0 auto;
  height: 72px; padding: 0 24px;
  display: flex; align-items: center; justify-content: space-between;
}
.rl-nav-logo {
  display: flex; align-items: center; gap: 10px;
  font-family: 'Syne', sans-serif; font-weight: 800; font-size: 22px;
  color: #d4845a;
  text-decoration: none;
  transition: opacity 0.2s;
}
.rl-nav-logo:hover { opacity: 0.7; }

.rl-nav-links {
  display: flex; align-items: center; gap: 32px;
}
.rl-nav-link {
  font-family: 'Bricolage Grotesque', sans-serif;
  font-weight: 600; font-size: 15px;
  color: rgba(232, 221, 208, 0.5);
  text-decoration: none;
  transition: color 0.2s;
  position: relative;
}
.rl-nav-link::after {
  content: '';
  position: absolute; bottom: -4px; left: 0; right: 0;
  height: 2px; background: #d4845a;
  transform: scaleX(0);
  transition: transform 0.2s;
}
.rl-nav-link:hover { color: #e8ddd0; }
.rl-nav-link:hover::after { transform: scaleX(1); }
.rl-nav-link-active { color: #e8ddd0; }
.rl-nav-link-active::after { transform: scaleX(1); }

.rl-nav-cta {
  font-family: 'Bricolage Grotesque', sans-serif;
  font-weight: 800; font-size: 15px;
  color: #d4845a;
  text-decoration: underline;
  text-underline-offset: 4px;
  text-decoration-thickness: 2px;
  transition: color 0.2s;
}
.rl-nav-cta:hover { color: #e8ddd0; }

.rl-nav-hamburger {
  display: none;
  background: none; border: none;
  color: #e8ddd0; cursor: pointer;
  padding: 8px;
  -webkit-tap-highlight-color: transparent;
}

.rl-nav-mobile {
  display: none;
  flex-direction: column;
  padding: 8px 24px 24px;
  max-width: 1100px; margin: 0 auto;
  border-top: 1px solid rgba(232, 221, 208, 0.08);
}
.rl-nav-mobile-link {
  display: block;
  padding: 16px 0;
  font-family: 'Bricolage Grotesque', sans-serif;
  font-weight: 600; font-size: 16px;
  color: rgba(232, 221, 208, 0.5);
  text-decoration: none;
  border-bottom: 1px solid rgba(232, 221, 208, 0.08);
  transition: color 0.2s;
}
.rl-nav-mobile-link:hover { color: #e8ddd0; }
.rl-nav-mobile-cta {
  display: inline-flex; align-items: center; gap: 8px;
  margin-top: 20px;
  background: #d4845a; color: #ffffff;
  padding: 14px 28px; border-radius: 14px;
  font-family: 'Bricolage Grotesque', sans-serif;
  font-weight: 800; font-size: 15px;
  text-decoration: none;
  text-align: center; justify-content: center;
  box-shadow: 0 6px 0 #a3623d;
  transition: transform 0.12s, box-shadow 0.12s;
}
.rl-nav-mobile-cta:active {
  transform: translateY(3px);
  box-shadow: 0 3px 0 #a3623d;
}

@media (max-width: 968px) {
  .rl-nav-links { display: none; }
  .rl-nav-cta { display: none; }
  .rl-nav-hamburger { display: block; }
  .rl-nav-mobile { display: flex; }
}

@media (min-width: 969px) {
  .rl-nav-mobile { display: none !important; }
}
`;