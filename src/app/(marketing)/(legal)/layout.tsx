"use client";

import { useRouter } from "next/navigation";
import React from "react";

export default function LegalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();

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
    background: "#1a1612",
    color: "#e8ddd0",
    fontFamily:
      '-apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif',
    display: "flex",
    flexDirection: "column",
    paddingBottom:
      "calc(var(--roam-tab-h, 72px) + env(safe-area-inset-bottom, 0px))",
  },
  main: {
    flex: 1,
    width: "100%",
  },
  footer: {
    padding: "24px 20px",
    borderTop: "1px solid rgba(232, 221, 208, 0.06)",
    textAlign: "center" as const,
  },
  footerText: {
    color: "rgba(232, 221, 208, 0.3)",
    fontSize: "12px",
    lineHeight: 1.6,
    margin: 0,
  },
};