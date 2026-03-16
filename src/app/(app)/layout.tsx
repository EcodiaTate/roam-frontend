"use client";

import { useEffect } from "react";
import { BottomTabBar } from "@/components/ui/BottomTabBar";
import { PersistentTabs } from "@/components/ui/PersistentTabs";
import { PlaceDetailProvider } from "@/lib/context/PlaceDetailContext";
import { PlaceDetailSheet } from "@/components/places/PlaceDetailSheet";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    document.documentElement.classList.add("roam-shell");
    return () => document.documentElement.classList.remove("roam-shell");
  }, []);

  return (
    <PlaceDetailProvider>
      <div className="roam-shell">
        <main className="roam-main">
          <PersistentTabs>{children}</PersistentTabs>
        </main>
        <BottomTabBar />
        {/* Global place detail sheet — opened via usePlaceDetail().openPlace() from anywhere */}
        <PlaceDetailSheet />
      </div>
    </PlaceDetailProvider>
  );
}
