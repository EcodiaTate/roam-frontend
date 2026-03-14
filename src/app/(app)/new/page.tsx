// src/app/(app)/new/page.tsx
import NewTripClientPage from "./ClientPage";
import { AuthGateWrapper } from "./AuthGateWrapper";

export default function Page() {
  return (
    <AuthGateWrapper>
      <NewTripClientPage />
    </AuthGateWrapper>
  );
}
