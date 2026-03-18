"use client";

import { useCallback, useRef, useState } from "react";
import { haptic } from "@/lib/native/haptics";
import s from "../legal.module.css";
import LegalNav from "../LegalNav";

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
        haptic.success();
        setStatus("success");
        setForm({
          name: "",
          email: "",
          category: "",
          subject: "",
          message: "",
        });
      } else {
        haptic.error();
        const data = await res.json().catch(() => null);
        setErrorMsg(
          data?.message ||
            "Something went wrong. Please try emailing tate@ecodia.au directly.",
        );
        setStatus("error");
      }
    } catch {
      haptic.error();
      setErrorMsg(
        "Network error - you may be offline. Please email tate@ecodia.au directly.",
      );
      setStatus("error");
    }
  }, [canSubmit, form]);

  return (
    <>
      <LegalNav activePath="/contact" />

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
                  color: "var(--roam-success)",
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
                    background: "var(--danger-tint)",
                    border: "1px solid var(--roam-border-strong)",
                    borderRadius: "10px",
                    padding: "12px 16px",
                    color: "var(--roam-danger)",
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
