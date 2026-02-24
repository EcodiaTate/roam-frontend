import { BottomTabBar } from "@/components/ui/BottomTabBar";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="roam-shell">
      <main className="roam-main">{children}</main>
      <BottomTabBar />
    </div>
  );
}
