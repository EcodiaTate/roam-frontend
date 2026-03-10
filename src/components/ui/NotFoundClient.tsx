"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";

export function NotFoundClient() {
  const router = useRouter();

  return (
    <div
      className="trip-app-container trip-wrap-center"
      style={{
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        alignItems: "center",
        padding: "0 24px",
        textAlign: "center",
      }}
    >
      {/* Icon / Graphic Container */}
      <div 
        style={{ 
          width: 80, 
          height: 80, 
          backgroundColor: "var(--roam-surface-hover)", 
          borderRadius: "50%", 
          display: "grid", 
          placeItems: "center",
          marginBottom: 24,
          color: "var(--brand-ochre)"
        }}
      >
        <svg 
          width="40" 
          height="40" 
          viewBox="0 0 24 24" 
          fill="none" 
          stroke="currentColor" 
          strokeWidth="2.5" 
          strokeLinecap="round" 
          strokeLinejoin="round"
        >
          <circle cx="12" cy="12" r="10" />
          <polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76" />
        </svg>
      </div>

      <h1 className="trip-h1" style={{ marginBottom: 12 }}>
        Off the beaten track
      </h1>
      
      <p className="trip-muted" style={{ marginBottom: 32, maxWidth: 300, lineHeight: 1.5 }}>
        Looks like you've wandered a bit too far. We couldn't find the page you're looking for.
      </p>

      {/* Valid Next.js Link for the home route */}
      <Link 
        href="/" 
        style={{ textDecoration: "none", width: "100%", maxWidth: 300 }}
      >
        <button 
          className="trip-interactive trip-btn trip-btn-primary"
          style={{ width: "100%" }}
        >
          Return to Base
        </button>
      </Link>
      
      {/* Client-side router action for going back */}
      <div style={{ width: "100%", maxWidth: 300, marginTop: 16 }}>
        <button 
          onClick={() => router.back()}
          className="trip-interactive trip-btn trip-btn-secondary"
          style={{ width: "100%" }}
        >
          Go Back
        </button>
      </div>
    </div>
  );
}