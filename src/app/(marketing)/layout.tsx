import * as React from "react";

export default function MarketingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="roam-shell">
      <main className="roam-main">{children}</main>
    </div>
  );
}
