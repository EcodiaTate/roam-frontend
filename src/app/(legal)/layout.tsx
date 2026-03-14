import React from "react";
import "./legal.module.css"
export default function LegalLayout({
  children,
}: {
  children: React.ReactNode;
}) {

  return (
    <div style={styles.wrapper}>
      <main style={styles.main}>{children}</main>
      <footer style={styles.footer}>
        <p style={styles.footerText}>
          © {new Date().getFullYear()} Ecodia Pty Ltd · ABN: 89693123278
        </p>
        <p style={styles.footerText}>
          Roam is built on Gubbi Gubbi land - Sunshine Coast, Australia
        </p>
      </footer>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  wrapper: {
    minHeight: "100dvh",
    height: "100%",
    overflowY: "auto" as const,
    WebkitOverflowScrolling: "touch",
    background: "var(--bg-sand)",
    color: "var(--text-main)",
    fontFamily:
      '-apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif',
    display: "flex",
    flexDirection: "column",
  },
  main: {
    flex: 1,
    width: "100%",
  },
  footer: {
    padding: "24px 20px",
    borderTop: "1px solid var(--roam-border)",
    textAlign: "center" as const,
  },
  footerText: {
    color: "var(--roam-text-muted)",
    fontSize: "12px",
    lineHeight: 1.6,
    margin: 0,
    opacity: 0.5,
  },
};
