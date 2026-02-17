// src/app/layout.tsx
import "./globals.css";

import type { Metadata, Viewport } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";

import { BottomTabBar } from "@/components/ui/BottomTabBar";
import { AuthProvider } from "@/lib/supabase/auth";
import { SyncBootstrap } from "@/components/auth/SyncBootstrap";
import { NativeBootstrap } from "@/components/native/NativeBootstrap";
import { BasemapBootstrap } from "@/components/native/BasemapBootstrap";

const outbackFont = Plus_Jakarta_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  display: "swap",
  variable: "--font-sans",
});

export const metadata: Metadata = {
  title: "Roam",
  description: "Offline-first outback routing and navigation",

  //  Updated for static manifest
  manifest: "/manifest.webmanifest",

  // Ensures installable feel on mobile web too
  applicationName: "Roam",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Roam",
  },

  formatDetection: {
    telephone: false,
  },
};

export const viewport: Viewport = {
  width: "device-width",
  height: "device-height", // Add this
  initialScale: 1,
  maximumScale: 1,         // Add this to be extra safe
  userScalable: false,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={outbackFont.variable}>
      <head>
        {/* Ensures PWA + native splash tint alignment */}
        <meta name="theme-color" content="#0a0a0a" />
        <link rel="manifest" href="/manifest.webmanifest" />
      </head>

      <body
        className={outbackFont.className}
        style={{
          overscrollBehavior: "none",
          backgroundColor: "#0a0a0a",
        }}
      >
        <AuthProvider>
          <NativeBootstrap />
          <SyncBootstrap />
          <BasemapBootstrap />

          <div className="roam-shell">
            <main className="roam-main">{children}</main>
            <BottomTabBar />
          </div>
        </AuthProvider>
      </body>
    </html>
  );
}