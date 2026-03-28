import { useEffect } from "react";
import { Outlet } from "react-router";
import { BottomTabBar } from "@/components/ui/BottomTabBar";
import { PersistentTabs } from "@/components/ui/PersistentTabs";
import { PlaceDetailProvider } from "@/lib/context/PlaceDetailContext";
import { PlaceDetailSheet } from "@/components/places/PlaceDetailSheet";
import { SavedPlacesSync } from "@/components/places/SavedPlacesSync";
import { OfflineStatusIndicator } from "@/components/ui/OfflineStatusIndicator";
import { ThemeToggle } from "@/components/ui/ThemeToggle";
export function AppLayout() {
  useEffect(() => {
    document.documentElement.classList.add("roam-shell");
    return () => document.documentElement.classList.remove("roam-shell");
  }, []);

  return (
    <PlaceDetailProvider>
      {/* Wires useSavedPlaces into PlaceDetailContext so the sheet can toggle bookmarks */}
      <SavedPlacesSync />
      <div className="roam-shell">
        {/* Day/Night mode toggle — top-left, always accessible */}
        <ThemeToggle />
        {/* Persistent offline status — always visible, never dismissable */}
        <div style={{
          position: "fixed",
          top: "calc(env(safe-area-inset-top, 0px) + 6px)",
          right: "calc(env(safe-area-inset-right, 0px) + 12px)",
          zIndex: 100,
          pointerEvents: "none",
        }}>
          <OfflineStatusIndicator />
        </div>
        <main className="roam-main">
          <PersistentTabs>
            <Outlet />
          </PersistentTabs>
        </main>
        <BottomTabBar />
        {/* Global place detail sheet - opened via usePlaceDetail().openPlace() from anywhere */}
        <PlaceDetailSheet />
      </div>
    </PlaceDetailProvider>
  );
}

export default AppLayout;
