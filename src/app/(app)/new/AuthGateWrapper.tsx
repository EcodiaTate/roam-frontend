import { AuthGate } from "@/components/auth/AuthGate";
import type { ReactNode } from "react";

export function AuthGateWrapper({ children }: { children: ReactNode }) {
  return <AuthGate>{children}</AuthGate>;
}
