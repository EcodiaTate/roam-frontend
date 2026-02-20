import { BottomTabBar } from "@/components/ui/BottomTabBar";
import * as React from "react";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="roam-shell">
      <main className="roam-main">{children}</main>
      <BottomTabBar />
    </div>
  );
}
