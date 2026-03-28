import React from "react";
import { Outlet } from "react-router";
import "./legal.module.css";

export function LegalLayout() {
  return (
    <div style={styles.wrapper}>
      <main style={styles.main}>
        <Outlet />
      </main>
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

export default LegalLayout;

const styles: Record<string, React.CSSProperties> = {
  wrapper: {
    minHeight: "100dvh",
    height: "100%",
    overflowY: "auto" as const,
    WebkitOverflowScrolling: "touch",
    background: "var(--bg-sand)",
    color: "var(--text-main)",
    fontFamily: "var(--ff-body)",
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
