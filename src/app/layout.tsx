import "./globals.css";

import type { Metadata } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";

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
  title: {
    default: "Roam — Outback Navigation That Works Offline",
    template: "%s | Roam",
  },
  description:
    "Turn-by-turn navigation, fuel intelligence, and live hazard alerts for Australian road trips. Works without reception. Built for the outback.",
  keywords: [
    "outback navigation",
    "offline maps australia",
    "road trip planner australia",
    "turn by turn offline",
    "fuel planner outback",
    "road closure alerts australia",
    "offline navigation app",
  ],
  openGraph: {
    type: "website",
    locale: "en_AU",
    url: "https://roamapp.com.au",
    siteName: "Roam",
    title: "Roam — Outback Navigation That Works Offline",
    description:
      "Turn-by-turn navigation, fuel intelligence, and live hazard alerts for Australian road trips. Works without reception.",
  },
  twitter: {
    card: "summary_large_image",
    title: "Roam — Outback Navigation That Works Offline",
    description:
      "Navigation, fuel planning, and hazard alerts for Australian road trips. Works without signal.",
  },
  robots: { index: true, follow: true },
  other: {
    "apple-mobile-web-app-capable": "yes",
    "apple-mobile-web-app-status-bar-style": "black-translucent",
    "mobile-web-app-capable": "yes",
    "theme-color": "#120f0c",
  },
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  themeColor: "#120f0c",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={outbackFont.variable}>
      <head>
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
          {children}
        </AuthProvider>
      </body>
    </html>
  );
}