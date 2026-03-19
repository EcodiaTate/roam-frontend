"use client";

import { useEffect, useState } from "react";
import { BottomTabBar } from "@/components/ui/BottomTabBar";
import { PersistentTabs } from "@/components/ui/PersistentTabs";
import { PlaceDetailProvider } from "@/lib/context/PlaceDetailContext";
import { PlaceDetailSheet } from "@/components/places/PlaceDetailSheet";
import { SavedPlacesSync } from "@/components/places/SavedPlacesSync";
import { UIModePickerModal, hasChosenUIMode } from "@/components/ui/UIModePickerModal";
import { useAuth } from "@/lib/supabase/auth";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const { session, loading } = useAuth();
  const [modePickerOpen, setModePickerOpen] = useState(false);

  useEffect(() => {
    document.documentElement.classList.add("roam-shell");
    return () => document.documentElement.classList.remove("roam-shell");
  }, []);

  // Show UI mode picker once after first sign-in
  useEffect(() => {
    if (loading || !session) return;
    if (!hasChosenUIMode()) {
      setModePickerOpen(true);
    }
  }, [loading, session]);

  return (
    <PlaceDetailProvider>
      {/* Wires useSavedPlaces into PlaceDetailContext so the sheet can toggle bookmarks */}
      <SavedPlacesSync />
      <div className="roam-shell">
        <main className="roam-main">
          <PersistentTabs>{children}</PersistentTabs>
        </main>
        <BottomTabBar />
        {/* Global place detail sheet - opened via usePlaceDetail().openPlace() from anywhere */}
        <PlaceDetailSheet />
      </div>
      {/* UI mode picker - shown once on first authenticated session */}
      <UIModePickerModal open={modePickerOpen} onClose={() => setModePickerOpen(false)} />
    </PlaceDetailProvider>
  );
}
