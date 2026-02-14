// src/app/layout.tsx
import "./globals.css";

import type { Metadata, Viewport } from "next";
import { BottomTabBar } from "@/components/ui/BottomTabBar";

export const metadata: Metadata = {
  title: "Roam",
  description: "Roam frontend",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  userScalable: false,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <div className="roam-shell">
          <main className="roam-main">{children}</main>
          <BottomTabBar />
        </div>
      </body>
    </html>
  );
}
