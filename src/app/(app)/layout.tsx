"use client";

import { useEffect } from "react";
import { BottomTabBar } from "@/components/ui/BottomTabBar";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    document.documentElement.classList.add("roam-shell");
    return () => document.documentElement.classList.remove("roam-shell");
  }, []);

  return (
    <div className="roam-shell">
      <main className="roam-main">{children}</main>
      <BottomTabBar />
    </div>
  );
}
