// src/app/layout.tsx
import "./globals.css";

import type { Metadata, Viewport } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";

import { BottomTabBar } from "@/components/ui/BottomTabBar";
import { AuthProvider } from "@/lib/supabase/auth";
import { SyncBootstrap } from "@/components/auth/SyncBootstrap";
import { NativeBootstrap } from "@/components/native/NativeBootstrap";

// Configure our premium native-feeling font
const outbackFont = Plus_Jakarta_Sans({
  subsets: ["latin"],
  // We explicitly load the weights used in our custom globals.css
  weight: ["400", "500", "600", "700", "800"],
  display: "swap",
  variable: "--font-sans",
});

export const metadata: Metadata = {
  title: "Roam",
  description: "Offline-first outback routing and navigation",
  manifest: "/manifest.json",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  userScalable: false,
  // iOS status bar / browser UI tint
  themeColor: "#fdfbf7",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={outbackFont.variable}>
      <body className={outbackFont.className} style={{ overscrollBehavior: "none" }}>
        <AuthProvider>
          <NativeBootstrap />
          <SyncBootstrap />

          <div className="roam-shell">
            <main className="roam-main">{children}</main>
            <BottomTabBar />
          </div>
        </AuthProvider>
      </body>
    </html>
  );
}
