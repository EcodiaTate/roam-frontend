// src/app/(shell)/sos/ClientPage.tsx
"use client";

export function SosClientPage() {
  return (
    <div className="roam-page">
      <h1 className="roam-h1">SOS</h1>
      <p className="roam-muted">Emergency tools. Always one-tap reachable.</p>

      <div className="roam-card">
        <p className="roam-muted">
          Next: quick actions (share location, call emergency contacts), nearest services, offline readiness.
        </p>
      </div>
    </div>
  );
}
